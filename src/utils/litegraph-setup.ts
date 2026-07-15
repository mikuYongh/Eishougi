import { LiteGraph } from "litegraph.js";
import type { LGraphNode as LGraphNodeInterface } from "../types/comfy";
import { getComfyUrl } from "../services/comfyService";
import { getInputConfig, getInputType, isSeedInput, isWidgetInput, SEED_CONTROL_VALUES, type InputDefinition } from "./comfyWidgets";
import { applyNodeAdapter } from "../components/workflows/nodeRenderAdapters/registry";
import { isAdapterType } from "../components/workflows/nodeRenderAdapters/comfyAdapters";

const registeredTypes = new Set<string>();
const nodeInfoCache = new Map<string, any>();
const nodeInfoPromises = new Map<string, Promise<any>>();
let staticInfoPromise: Promise<Record<string, any>> | null = null;

function isSubgraphType(type: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(type);
}

async function loadStaticObjectInfo() {
  if (!staticInfoPromise) {
    staticInfoPromise = fetch("/object_info.json")
      .then((response) => response.ok ? response.json() : {})
      .catch(() => ({}));
  }
  return staticInfoPromise;
}

async function fetchNodeInfo(type: string) {
  if (nodeInfoCache.has(type)) return nodeInfoCache.get(type);
  if (nodeInfoPromises.has(type)) return nodeInfoPromises.get(type);
  const promise = (async () => {
    const fallback = (await loadStaticObjectInfo())[type];
    try {
      const response = await fetch(`${getComfyUrl()}/object_info/${encodeURIComponent(type)}`);
      const live = response.ok ? await response.json() : {};
      const info = live[type] || live || fallback;
      nodeInfoCache.set(type, info);
      return info;
    } catch {
      nodeInfoCache.set(type, fallback);
      return fallback;
    }
  })();
  nodeInfoPromises.set(type, promise);
  return promise;
}

function addWidget(node: LGraphNodeInterface, name: string, definition: InputDefinition) {
  const type = getInputType(definition);
  const config = getInputConfig(definition) || {};
  const values = Array.isArray(type) ? type : (config.options as unknown[] | undefined);
  const callback = () => {};
  if (Array.isArray(values) || type === "COMBO") {
    node.addWidget("combo", name, config.default ?? values?.[0] ?? "", callback, { values: values || [] });
  } else if (type === "INT" || type === "FLOAT") {
    node.addWidget("number", name, config.default ?? 0, callback, config);
    if (type === "INT" && isSeedInput(name)) {
      node.addWidget("combo", "control_after_generate", "randomize", callback, { values: [...SEED_CONTROL_VALUES] });
    }
  } else if (type === "BOOLEAN") {
    node.addWidget("toggle", name, config.default ?? false, callback, config);
  } else {
    node.addWidget("text", name, config.default ?? "", callback, config);
  }
}

function createConstructor(type: string, info: any, rawNode?: any) {
  const title = rawNode?.title && rawNode.title !== "NodeConstructor"
    ? rawNode.title
    : info?.display_name || type;
  const Constructor = function (this: LGraphNodeInterface, nodeTitle?: string) {
    this.title = nodeTitle && nodeTitle !== "NodeConstructor" ? nodeTitle : title;
      const rawInputs = rawNode?.inputs || [];
      const rawOutputs = rawNode?.outputs || [];
    if (rawNode && !rawNode._apiInputValues) {
        rawInputs.forEach((input: any) => {
          if (input.widget && !isAdapterType(type)) this.addWidget("text", input.name, "", () => {});
          else if (!input.widget) this.addInput(input.name, input.type || "*");
        });
      rawOutputs.forEach((output: any) => this.addOutput(output.name || output.type, output.type || "*"));
    } else {
      for (const section of [info?.input?.required, info?.input?.optional]) {
        if (!section) continue;
        for (const [name, definition] of Object.entries(section)) {
          if (isWidgetInput(definition as InputDefinition)) addWidget(this, name, definition as InputDefinition);
          else this.addInput(name, String(getInputType(definition as InputDefinition) || "*"));
        }
      }
      (info?.output || []).forEach((outputType: string, index: number) => {
        const names = info.output_name || info.output;
        this.addOutput(names[index] || outputType, outputType);
      });
    }
    this.onConfigure = function () {
      if (this.title === "NodeConstructor") this.title = title;
      if (rawNode?.size) this.size = [rawNode.size[0], rawNode.size[1]];
      if (rawNode?._apiInputValues && this.widgets) {
        this.widgets.forEach((widget: any) => {
          if (Object.prototype.hasOwnProperty.call(rawNode._apiInputValues, widget.name)) {
            widget.value = rawNode._apiInputValues[widget.name];
          }
        });
      }
      if (isAdapterType(type)) {
        this.widgets = [];
        applyNodeAdapter(type, this);
      }
    };
  };
  (Constructor as any).title = title;
  return Constructor;
}

export function registerNodeType(type: string, info?: any, rawNode?: any) {
  if (registeredTypes.has(type)) return;
  LiteGraph.registerNodeType(type, createConstructor(type, info, rawNode) as any);
  registeredTypes.add(type);
}

export async function registerNodeTypes(types: string[], rawNodes: any[] = [], onProgress?: (current: number, total: number) => void) {
  const rawByType = new Map(rawNodes.map((node) => [node.type, node]));
  const pending = types.filter((type) => !registeredTypes.has(type) && !isSubgraphType(type));
  for (let index = 0; index < pending.length; index += 1) {
    const type = pending[index];
    registerNodeType(type, await fetchNodeInfo(type), rawByType.get(type));
    onProgress?.(index + 1, pending.length);
    if (index % 4 === 3) await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

export function registerSubgraphNode(definition: { id: string; name?: string; inputs?: any[]; outputs?: any[] }, rawNode?: any) {
  if (registeredTypes.has(definition.id)) return;
  const Constructor = function (this: LGraphNodeInterface, title?: string) {
    this.title = title && title !== "NodeConstructor" ? title : definition.name || "Subgraph";
    (rawNode?.inputs || definition.inputs || []).forEach((input: any) => this.addInput(input.name || input.label, input.type || "*"));
    (rawNode?.outputs || definition.outputs || []).forEach((output: any) => this.addOutput(output.name || output.label, output.type || "*"));
    this.size = rawNode?.size ? [rawNode.size[0], rawNode.size[1]] : [390, 470];
    this.onDblClick = () => window.dispatchEvent(new CustomEvent("workflow:open-subgraph", { detail: { id: definition.id } }));
  };
  (Constructor as any).title = definition.name || "Subgraph";
  LiteGraph.registerNodeType(definition.id, Constructor as any);
  registeredTypes.add(definition.id);
}
