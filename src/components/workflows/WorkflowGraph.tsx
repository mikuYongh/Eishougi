import { memo, useEffect, useMemo, useRef, useState } from "react";
import { LiteGraph, LGraph, LGraphCanvas } from "litegraph.js";
import "litegraph.js/css/litegraph.css";
import { ChevronLeft, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { LoraPickerModal } from "../ui/LoraPickerModal";
import { getSubgraphGraph, createRenderWorkflow, type SubgraphDefinition } from "../../services/workflowRenderModel";
import { registerNodeTypes, registerSubgraphNode } from "../../utils/litegraph-setup";
import { applyNodeAdapter } from "./nodeRenderAdapters/registry";
import type { ValidationReport } from "../../services/comfyValidator";

const LINK_COLORS: Record<string, string> = {
  MODEL: "#8888FF", CLIP: "#B3B333", VAE: "#FF8888", CONDITIONING: "#FFAA00",
  LATENT: "#FF69B4", IMAGE: "#3A86FF", MASK: "#00A000", INT: "#A0D0A0",
  FLOAT: "#A0D0A0", STRING: "#CFCFCF", VIDEO: "#FFD700", AUDIO: "#FF6B6B",
};
(LGraphCanvas as any).link_type_colors = { ...LINK_COLORS, "*": "#7F7F7F" };

interface WorkflowGraphProps {
  workflow: any;
  report?: ValidationReport | null;
  onChange?: (workflow: string) => void;
}

function parseWorkflow(value: any) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function WorkflowGraphInner({ workflow, report, onChange }: WorkflowGraphProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<any>(null);
  const canvasInstanceRef = useRef<any>(null);
  const rootRenderRef = useRef<ReturnType<typeof createRenderWorkflow> | null>(null);
  const rootViewportRef = useRef<{ scale: number; offset: [number, number] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("准备中...");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [fullscreenMode, setFullscreenMode] = useState<"native" | "fallback" | null>(null);
  const [activeSubgraph, setActiveSubgraph] = useState<SubgraphDefinition | null>(null);
  const [loraNodeId, setLoraNodeId] = useState<number | null>(null);
  const [loraRevision, setLoraRevision] = useState(0);
  const workflowObjectRef = useRef<any>(null);
  const activeSubgraphRef = useRef<SubgraphDefinition | null>(null);
  const configuredRef = useRef(false);
  const lastEmittedWorkflowRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);

  const isFullscreen = fullscreenMode !== null;

  const workflowObject = useMemo(() => parseWorkflow(workflow), [workflow]);

  onChangeRef.current = onChange;
  workflowObjectRef.current = workflowObject;
  activeSubgraphRef.current = activeSubgraph;

  useEffect(() => {
    if (!canvasRef.current) return;
    const graph = new LGraph();
    const canvas = new LGraphCanvas(canvasRef.current, graph);
    canvas.allow_interaction = true;
    canvas.allow_dragcanvas = true;
    canvas.allow_dragnodes = true;
    (canvas as any).round_links = true;
    (canvas as any).allow_searchbox = false;
    graphRef.current = graph;
    canvasInstanceRef.current = canvas;

    (graph as any).onAfterChange = () => {
      if (!configuredRef.current || !onChangeRef.current) return;
      const currentWorkflow = workflowObjectRef.current;
      const serialized = serializeWorkflow(currentWorkflow, graph, activeSubgraphRef.current);
      if (!serialized) return;
      lastEmittedWorkflowRef.current = serialized;
      onChangeRef.current(serialized);
    };

    const resizeObserver = new ResizeObserver(() => {
      canvas.resize();
      if ((graph as any)._nodes?.length) fitCanvas(canvas, graph);
      graph.setDirtyCanvas(true, true);
    });
    if (wrapperRef.current) resizeObserver.observe(wrapperRef.current);
    canvas.resize();
    canvas.startRendering?.();

    return () => {
      resizeObserver.disconnect();
      canvas.stopRendering?.();
      graph.stop();
      graphRef.current = null;
      canvasInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onOpenSubgraph = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const definition = rootRenderRef.current?.subgraphs.get(id);
      if (!definition || !graphRef.current) return;
      const canvas = canvasInstanceRef.current;
      rootViewportRef.current = canvas?.ds ? { scale: canvas.ds.scale, offset: [canvas.ds.offset[0], canvas.ds.offset[1]] } : null;
      setActiveSubgraph(definition);
    };
    const onOpenLoraPicker = (event: Event) => {
      setLoraNodeId((event as CustomEvent<{ nodeId: number }>).detail?.nodeId ?? null);
    };
    window.addEventListener("workflow:open-subgraph", onOpenSubgraph);
    window.addEventListener("workflow:lora-picker", onOpenLoraPicker);
    return () => {
      window.removeEventListener("workflow:open-subgraph", onOpenSubgraph);
      window.removeEventListener("workflow:lora-picker", onOpenLoraPicker);
    };
  }, []);

  useEffect(() => {
    const render = createRenderWorkflow(workflowObject);
    console.info("[WorkflowGraph] workflow changed", {
      hasWorkflow: Boolean(workflowObject),
      format: render?.format,
      rootNodes: render?.graph.nodes.length ?? 0,
      rootLinks: render?.graph.links.length ?? 0,
      subgraphs: render ? [...render.subgraphs.values()].map((definition) => ({
        id: definition.id,
        name: definition.name,
        nodes: definition.nodes?.length ?? 0,
        links: definition.links?.length ?? 0,
      })) : [],
    });
    if (!render || !graphRef.current) return;
    rootRenderRef.current = render;
    const serialized = JSON.stringify(workflowObject);
    if (lastEmittedWorkflowRef.current === serialized && activeSubgraphRef.current) {
      return;
    } else {
      setActiveSubgraph(null);
    }
  }, [workflowObject]);

  useEffect(() => {
    const render = rootRenderRef.current || createRenderWorkflow(workflowObject);
    const graph = graphRef.current;
    const canvas = canvasInstanceRef.current;
    if (!render || !graph || !canvas) return;
    if (lastEmittedWorkflowRef.current === JSON.stringify(workflowObject)) {
      lastEmittedWorkflowRef.current = null;
      return;
    }
    rootRenderRef.current = render;
    let cancelled = false;

    const configure = async () => {
      setLoading(true);
      setRenderError(null);
      setLoadingMessage("解析工作流...");
      await nextFrame();
      if (cancelled) return;
      const currentGraph = activeSubgraph ? getSubgraphGraph(activeSubgraph) : render.graph;
      const rawNodes = currentGraph.nodes;
      const nodeTypes = [...new Set(rawNodes.map((node: any) => node.type).filter((type: any): type is string => Boolean(type)))];
      console.info("[WorkflowGraph] configure start", {
        view: activeSubgraph ? "subgraph" : "root",
        nodes: rawNodes.length,
        links: currentGraph.links.length,
        nodeTypes,
      });
      setLoadingMessage(`注册节点 0/${nodeTypes.length}`);
      if (activeSubgraph) {
        for (const definition of render.subgraphs.values()) {
          if (definition.id === activeSubgraph.id) {
            registerSubgraphNode(definition);
            break;
          }
        }
      } else {
        for (const type of nodeTypes) {
          const definition = render.subgraphs.get(type);
          if (definition) registerSubgraphNode(definition, rawNodes.find((node: any) => node.type === type));
        }
      }
      await registerNodeTypes(nodeTypes, rawNodes, (current, total) => {
        setLoadingMessage(`注册节点 ${current}/${total}`);
      });
      console.info("[WorkflowGraph] node types registered", {
        nodeTypes,
        registered: nodeTypes.map((type) => ({ type, registered: Boolean((LiteGraph as any).registered_node_types?.[type]) })),
      });
      if (cancelled) return;
      setLoadingMessage(`配置画布 ${nodeTypes.length}/${nodeTypes.length}`);
      graph.clear();
      configuredRef.current = false;
      graph.configure(currentGraph);
      console.info("[WorkflowGraph] graph configured", {
        configuredNodes: graph._nodes?.length ?? 0,
        configuredLinks: graph.links ? Object.keys(graph.links).length : 0,
        canvas: { width: canvas.canvas.width, height: canvas.canvas.height },
      });
      graph._nodes?.forEach((node: any) => {
        if (node.computeSize && node.size) {
          const computed = node.computeSize();
          node.size[0] = Math.max(node.size[0], computed[0]);
          node.size[1] = Math.max(node.size[1], computed[1]);
        }
      });
      applyValidationColors(graph, report);
      await nextFrame();
      if (cancelled) return;
      canvas.resize();
      fitCanvas(canvas, graph);
      console.info("[WorkflowGraph] canvas fitted", JSON.stringify({
        element: {
          width: canvas.canvas.width,
          height: canvas.canvas.height,
          clientWidth: canvas.canvas.clientWidth,
          clientHeight: canvas.canvas.clientHeight,
          rect: canvas.canvas.getBoundingClientRect().toJSON(),
        },
        viewport: {
          scale: canvas.ds.scale,
          offset: [canvas.ds.offset[0], canvas.ds.offset[1]],
        },
        nodes: graph._nodes?.map((node: any) => ({
          id: node.id,
          type: node.type,
          pos: node.pos,
          size: node.size,
        })),
      }));
      graph.setDirtyCanvas(true, true);
      configuredRef.current = true;
      setLoading(false);
    };
    configure().catch((error) => {
      console.error("[WorkflowGraph] configure failed", error);
      setRenderError(error instanceof Error ? error.message : "工作流节点无法渲染");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeSubgraph, report, workflowObject]);

  useEffect(() => {
    const canvas = canvasInstanceRef.current;
    const graph = graphRef.current;
    if (!canvas || !graph) return;
    requestAnimationFrame(() => {
      canvas.resize();
      fitCanvas(canvas, graph);
      graph.setDirtyCanvas(true, true);
    });
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement === wrapperRef.current) {
        setFullscreenMode("native");
      } else if (fullscreenMode === "native") {
        setFullscreenMode(null);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [fullscreenMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreenMode === "fallback") setFullscreenMode(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreenMode]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === wrapperRef.current) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreenMode === "fallback") {
      setFullscreenMode(null);
      return;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (wrapper.requestFullscreen) {
      try {
        await wrapper.requestFullscreen();
        return;
      } catch (error) {
        console.warn("[WorkflowGraph] native fullscreen unavailable, using fallback", error);
      }
    }
    setFullscreenMode("fallback");
  };

  const leaveSubgraph = () => {
    setActiveSubgraph(null);
    requestAnimationFrame(() => {
      const canvas = canvasInstanceRef.current;
      const graph = graphRef.current;
      if (!canvas || !graph) return;
      if (rootViewportRef.current) {
        canvas.ds.scale = rootViewportRef.current.scale;
        canvas.ds.offset = rootViewportRef.current.offset;
      }
      graph.setDirtyCanvas(true, true);
    });
  };

  const selectedLoras = useMemo(() => {
    const node = graphRef.current?.getNodeById(loraNodeId ?? -1);
    return (node?.widgets_values || [])
      .filter((value: any) => value && typeof value.lora === "string" && value.lora !== "None")
      .map((value: any) => value.lora);
  }, [loraNodeId, loraRevision, workflowObject]);

  const toggleLora = (name: string) => {
    const node = graphRef.current?.getNodeById(loraNodeId ?? -1);
    if (!node) return;
    const values = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    const index = values.findIndex((value: any) => value && value.lora === name);
    if (index >= 0) values[index] = { ...values[index], on: values[index].on === false };
    else values.push({ lora: name, strength: 1, strengthTwo: 1, on: true });
    node.widgets_values = values;
    node.widgets = [];
    applyNodeAdapter(node.type, node);
    if (node.computeSize) node.size = [Math.max(node.size[0], node.computeSize()[0]), Math.max(node.size[1], node.computeSize()[1])];
    setLoraRevision((value) => value + 1);
    graphRef.current.setDirtyCanvas(true, true);
    graphRef.current.onAfterChange?.();
  };

  return (
    <div
      ref={wrapperRef}
       className={`relative w-full h-full min-w-0 overflow-hidden ${isFullscreen ? "rounded-none bg-[#202020]" : "rounded-2xl border border-[var(--glass-border)] bg-[#202020]"}`}
      style={isFullscreen ? { position: "fixed", inset: 0, zIndex: 500, width: "100vw", height: "100vh" } : undefined}
    >
       {loading && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#202020]"><Loader2 size={28} className="animate-spin text-[var(--accent-1)]" /><span className="text-[11px] text-[var(--text-muted)]">{loadingMessage}</span></div>}
       {renderError && !loading && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#202020] px-6 text-center"><span className="text-[12px] font-bold text-red-300">工作流预览加载失败</span><span className="max-w-lg break-words text-[10px] text-[var(--text-muted)]">{renderError}</span></div>}
       {activeSubgraph && <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-layer-1)]/90 px-2 py-1.5 text-[11px] text-[var(--text-primary)]"><button onClick={leaveSubgraph} className="flex items-center gap-1 cursor-pointer"><ChevronLeft size={14} />返回根画布</button><span className="text-[var(--text-muted)]">/ {activeSubgraph.name || "Subgraph"}</span></div>}
       <canvas ref={canvasRef} className="block h-full w-full" />
       <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggleFullscreen(); }} className="absolute top-3 right-3 z-20 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-layer-1)]/90 px-2.5 text-[11px] text-[var(--text-primary)] shadow-lg cursor-pointer" title={isFullscreen ? "退出全屏 (ESC)" : "全屏预览"}>
         {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
         <span>{isFullscreen ? "退出全屏" : "全屏"}</span>
       </button>
      <LoraPickerModal isOpen={loraNodeId !== null} onClose={() => setLoraNodeId(null)} selectedLoras={selectedLoras} onToggle={toggleLora} />
    </div>
  );
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function fitCanvas(canvas: any, graph: any) {
  const nodes = graph?._nodes || [];
  if (!nodes.length || !canvas.canvas) return;
  const bounds = nodes.reduce((result: { minX: number; minY: number; maxX: number; maxY: number }, node: any) => {
    const width = Number(node.size?.[0]) || 200;
    const height = Number(node.size?.[1]) || 100;
    const x = Number(node.pos?.[0]) || 0;
    const y = Number(node.pos?.[1]) || 0;
    return {
      minX: Math.min(result.minX, x), minY: Math.min(result.minY, y),
      maxX: Math.max(result.maxX, x + width), maxY: Math.max(result.maxY, y + height),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const margin = 50;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const fittedScale = Math.min((canvas.canvas.width - margin * 2) / width, (canvas.canvas.height - margin * 2) / height);
  const minimumScale = nodes.length <= 8 ? 0.2 : 0.1;
  const scale = Math.min(2, Math.max(minimumScale, fittedScale));
  canvas.ds.scale = scale;
  canvas.ds.offset = [
    (canvas.canvas.width - width * scale) / 2 - bounds.minX * scale,
    (canvas.canvas.height - height * scale) / 2 - bounds.minY * scale,
  ];
  canvas.setDirty(true, true);
}

function applyValidationColors(graph: any, report: ValidationReport | null | undefined) {
  if (!report) return;
  for (const issue of report.issues) {
    const node = graph.getNodeById(Number(issue.nodeId));
    if (node) node.bgcolor = issue.status === "invalid_value" ? "rgba(234,179,8,0.25)" : "rgba(239,68,68,0.25)";
  }
}

function serializeWorkflow(workflow: any, graph: any, activeSubgraph: SubgraphDefinition | null): string | null {
  if (!workflow || !graph?.serialize) return null;
  const serializedGraph = graph.serialize();
  const next = structuredClone(workflow);

  if (activeSubgraph) {
    const definitions = next.definitions?.subgraphs;
    const definition = Array.isArray(definitions)
      ? definitions.find((item: any) => item.id === activeSubgraph.id)
      : definitions?.[activeSubgraph.id];
    if (!definition) return null;
    definition.nodes = serializedGraph.nodes || [];
    definition.links = serializedGraph.links || [];
    definition.groups = serializedGraph.groups || [];
  } else if (Array.isArray(next.nodes)) {
    next.nodes = serializedGraph.nodes || [];
    next.links = serializedGraph.links || [];
    next.groups = serializedGraph.groups || [];
    next.last_node_id = serializedGraph.last_node_id;
    next.last_link_id = serializedGraph.last_link_id;
  } else {
    for (const node of graph._nodes || []) {
      const originalId = node._originalId;
      const original = originalId == null ? null : next[String(originalId)];
      if (!original?.inputs || !node.widgets) continue;
      for (const widget of node.widgets) {
        if (widget?.name && Object.prototype.hasOwnProperty.call(original.inputs, widget.name)) {
          original.inputs[widget.name] = widget.value;
        }
      }
    }
  }

  return JSON.stringify(next, null, 2);
}

export const WorkflowGraph = memo(WorkflowGraphInner);
