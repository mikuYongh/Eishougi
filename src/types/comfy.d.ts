// src/types/comfy.d.ts

// IT: Gruppo di nodi LiteGraph.
// EN: LiteGraph node group.
export interface LGraphGroup {
  title: string;
  bounding: [number, number, number, number]; // IT: [x, y, larghezza, altezza]. EN: [x, y, width, height].
  color: string;
  font_size: number;
  [key: string]: any;
}

// IT: Nodo nel formato API ComfyUI.
// EN: Node in ComfyUI API format.
export interface ApiNode {
  inputs: Record<string, any> | any[];
  class_type: string; // IT: Tipo classe Python. EN: Python class type.
  [key: string]: any;
}

// IT: Workflow nel formato API ComfyUI.
// EN: Workflow in ComfyUI API format.
export interface ApiWorkflow {
  [nodeId: string]: ApiNode;
}

// IT: Parametri di un singolo nodo Sampler.
// EN: Parameters for a single Sampler node.
export interface SamplerParameters {
  id: string;
  nodeTitle: string;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
}

// IT: Parametri del workflow estratti per la visualizzazione.
// EN: Workflow parameters extracted for display.
export interface WorkflowParameters {
  positivePrompt?: string;
  negativePrompt?: string;
  samplers: SamplerParameters[];
}

// IT: Workflow normalizzato per l'app.
// EN: Normalized workflow for the app.
export interface NormalizedWorkflow {
  nodes: LGraphNode[];
  links: LLink[];
  groups?: LGraphGroup[];
  nodeList: { id: string; name: string }[]; // IT: Lista nodi per UI. EN: Node list for UI.
  notes?: { id: string; text: string; type: 'Note' | 'MarkdownNote' }[]; // IT: Note del workflow. EN: Workflow notes.
  parameters?: WorkflowParameters; // IT: Parametri del workflow. EN: Workflow parameters.
  [key: string]: any;
}

// IT: Tipo per un link LiteGraph.
// EN: Type for a LiteGraph link.
// IT: [id_link, id_nodo_origine, slot_origine, id_nodo_dest, slot_dest, tipo_link]
// EN: [link_id, origin_node_id, origin_slot, target_node_id, target_slot, link_type]
export type LLink = [number, number, number, number, number, string];

// IT: Nodo LiteGraph.
// EN: LiteGraph node.
export interface LGraphNode {
  id: number;
  type: string;
  title: string;
  pos: [number, number];
  size: [number, number];
  flags: object;
  order: number;
  mode: number; // IT: Modalità rendering. EN: Rendering mode.
  inputs?: { name: string; type: string; link: number | null }[];
  outputs?: { name: string; type: string; links: number[] | null }[];
  properties: Record<string, any>;
  widgets_values?: any[];
  bgcolor?: string; // IT: Per evidenziazione. EN: For highlighting.
  // IT: Metodi base nodo. EN: Basic node methods.
  addInput: (name: string, type: string) => void;
  addOutput: (name: string, type: string) => void;
  addWidget: (type: string, name: string, value: any, callback?: (value: any) => void, options?: object) => void;
  onConfigure?: () => void; // IT: Hook di configurazione. EN: Configuration hook.
  [key: string]: any;
}

// IT: Istanza LGraph di LiteGraph.
// EN: LiteGraph LGraph instance.
export interface LGraphInstance {
  configure(data: object): void;
  clear(): void;
  start(): void;
  stop(): void;
  _nodes: LGraphNode[]; // IT: Accesso interno, usare con cautela. EN: Internal access, use cautiously.
  getNodeById(id: number): LGraphNode | null;
  setDirtyCanvas(fg: boolean, bg: boolean): void;
  [key: string]: any;
}

// IT: Definizione di un Subgraph, usato in workflow complessi.
// EN: Definition of a Subgraph, used in complex workflows.
export interface SubgraphDefinition {
  id: string;
  name: string;
  inputs?: { name: string; type: string; [key: string]: any }[];
  outputs?: { name: string; type: string; [key: string]: any }[];
  [key: string]: any;
}

// IT: Dichiarazioni per estendere i tipi di 'litegraph.js'.
// EN: Declarations to extend 'litegraph.js' types.
declare module 'litegraph.js' {
  export class LGraph implements LGraphInstance {
    constructor();
    configure(data: object): void;
    clear(): void;
    start(): void;
    stop(): void;
    _nodes: LGraphNode[];
    getNodeById(id: number): LGraphNode | null;
    setDirtyCanvas(fg: boolean, bg: boolean): void;
  }

  export class LGraphCanvas {
    constructor(canvas: HTMLCanvasElement, graph: LGraph);
    ds: { // IT: Helper disegno/zoom. EN: Drawing/zoom helper.
      zoomFit: (center?: boolean) => void;
    };
    allow_dragnodes: boolean;
    allow_interaction: boolean;
    allow_dragcanvas: boolean;
    round_links: boolean;
    link_type_colors: Record<string, string>;
    resize: () => void;
  }

  export const LiteGraph: {
    registerNodeType(type: string, base_class: any): void;
    NODE_TITLE_HEIGHT?: number;
    [key: string]: any;
  };
}
