import type { LGraphNode as LGraphNodeInterface } from "../../../types/comfy";

export type NodeAdapter = (node: LGraphNodeInterface) => void;

const adapters = new Map<string, NodeAdapter>();

export function registerNodeAdapter(type: string, adapter: NodeAdapter) {
  adapters.set(type, adapter);
}

export function applyNodeAdapter(type: string, node: LGraphNodeInterface) {
  adapters.get(type)?.(node);
}

export function hasNodeAdapter(type: string) {
  return adapters.has(type);
}
