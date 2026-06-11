import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type WorkflowType = 'text2img' | 'img2video' | 'tagger' | 'upscale' | 'custom';

export interface WorkflowProject {
  id: string;
  name: string;
  description: string;
  type: WorkflowType;
  thumbnail?: string;
  jsonContent: string; // The ComfyUI JSON API format
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface WorkflowStore {
  workflows: WorkflowProject[];
  fetchWorkflows: () => Promise<void>;
  addWorkflow: (workflow: WorkflowProject) => Promise<void>;
  removeWorkflow: (id: string) => Promise<void>;
  updateWorkflow: (id: string, data: Partial<WorkflowProject>) => Promise<void>;
}

// Mapper to Rust
function toRustWorkflow(w: WorkflowProject): any {
  return {
    id: w.id,
    name: w.name || '',
    description: w.description || '',
    type: w.type || 'custom',
    jsonContent: w.jsonContent || '{}',
    isDefault: false,
    isBuiltin: false,
    createdAt: w.createdAt || Date.now(),
    updatedAt: w.updatedAt || Date.now()
  };
}

// Mapper from Rust
function fromRustWorkflow(r: any): WorkflowProject {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type as WorkflowType,
    jsonContent: r.jsonContent,
    tags: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  fetchWorkflows: async () => {
    try {
      const rustWorkflows = await invoke<any[]>('list_workflows');
      set({ workflows: rustWorkflows.map(fromRustWorkflow) });
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    }
  },
  addWorkflow: async (workflow) => {
    try {
      await invoke('create_workflow', { workflow: toRustWorkflow(workflow) });
      set((state) => ({ workflows: [...state.workflows, workflow] }));
    } catch (error) {
      console.error('Failed to add workflow:', error);
    }
  },
  removeWorkflow: async (id) => {
    try {
      await invoke('delete_workflow', { id });
      set((state) => ({ workflows: state.workflows.filter((w) => w.id !== id) }));
    } catch (error) {
      console.error('Failed to remove workflow:', error);
    }
  },
  updateWorkflow: async (id, data) => {
    try {
      const currentWorkflow = get().workflows.find((w) => w.id === id);
      if (!currentWorkflow) return;
      const updatedWorkflow = { ...currentWorkflow, ...data, updatedAt: Date.now() };
      await invoke('update_workflow', { workflow: toRustWorkflow(updatedWorkflow) });
      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? updatedWorkflow : w)),
      }));
    } catch (error) {
      console.error('Failed to update workflow:', error);
    }
  },
}));
