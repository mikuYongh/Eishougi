import type { ApiWorkflow, LGraphGroup, LGraphNode, LLink } from "../types/comfy";

export interface SubgraphDefinition {
  id: string;
  name?: string;
  inputs?: Array<{ id?: string; name: string; type: string; [key: string]: any }>;
  outputs?: Array<{ id?: string; name: string; type: string; [key: string]: any }>;
  nodes: LGraphNode[];
  links: LLink[];
  groups?: LGraphGroup[];
  [key: string]: any;
}

export interface RenderWorkflow {
  format: "ui" | "api";
  graph: { nodes: LGraphNode[]; links: LLink[]; groups: LGraphGroup[]; last_node_id: number; last_link_id: number; extra?: any };
  subgraphs: Map<string, SubgraphDefinition>;
}

export function isUiWorkflow(value: any): boolean {
  return Boolean(value && Array.isArray(value.nodes));
}

function subgraphsOf(workflow: any): Map<string, SubgraphDefinition> {
  const source = workflow.definitions?.subgraphs;
  const entries = Array.isArray(source) ? source.map((item: SubgraphDefinition) => [item.id, item]) : Object.entries(source || {});
  return new Map(entries as Array<[string, SubgraphDefinition]>);
}

export function createRenderWorkflow(workflow: any): RenderWorkflow | null {
  if (!workflow) return null;
  if (isUiWorkflow(workflow)) {
    return {
      format: "ui",
      graph: {
        nodes: workflow.nodes,
        links: workflow.links || [],
        groups: workflow.groups || [],
        last_node_id: workflow.last_node_id || 0,
        last_link_id: workflow.last_link_id || 0,
        extra: workflow.extra,
      },
      subgraphs: subgraphsOf(workflow),
    };
  }

  const idMap = new Map<string, number>();
  let nextNodeId = 1;
  const getNodeId = (sourceId: string) => {
    if (!idMap.has(sourceId)) idMap.set(sourceId, nextNodeId++);
    return idMap.get(sourceId)!;
  };
  const nodes: LGraphNode[] = [];
  const links: LLink[] = [];
  let nextLinkId = 1;
  for (const [sourceId, node] of Object.entries(workflow as ApiWorkflow)) {
    if (!node || typeof node !== "object" || !(node as any).class_type) continue;
    const details = node as any;
    const inputs = Object.entries(details.inputs || {});
    const socketInputs = inputs.filter(([, value]) => isConnection(value));
    nodes.push({
      id: getNodeId(sourceId), type: details.class_type, title: details._meta?.title || details.class_type,
      pos: [0, 0], size: details.size || [200, 120], flags: {}, order: nodes.length, mode: 0,
      inputs: socketInputs.map(([name]) => ({ name, type: "*", link: null })), outputs: [], properties: {},
      widgets_values: inputs.filter(([, value]) => !isConnection(value)).map(([, value]) => value), _originalId: sourceId,
      _apiInputValues: details.inputs || {},
    } as any);
    socketInputs.forEach(([name, value], targetSlot) => {
      const [sourceNode, sourceSlot] = value as [string, number];
      links.push([nextLinkId++, getNodeId(sourceNode), sourceSlot, getNodeId(sourceId), targetSlot, "*"]);
    });
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  nodes.forEach((node, index) => { node.pos = [(index % columns) * 280, Math.floor(index / columns) * 220]; });
  return { format: "api", graph: { nodes, links, groups: [], last_node_id: nodes.length, last_link_id: links.length }, subgraphs: new Map() };
}

function isConnection(value: any): boolean {
  return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "number";
}

export function getSubgraphGraph(definition: SubgraphDefinition) {
  return {
    nodes: definition.nodes || [], links: definition.links || [], groups: definition.groups || [],
    last_node_id: Math.max(0, ...(definition.nodes || []).map((node) => Number(node.id) || 0)),
    last_link_id: Math.max(0, ...(definition.links || []).map((link) => Number(link[0]) || 0)),
  };
}

export function getSubgraphTypes(definition: SubgraphDefinition): string[] {
  return [...new Set((definition.nodes || []).map((node) => node.type).filter((type): type is string => Boolean(type)))];
}
