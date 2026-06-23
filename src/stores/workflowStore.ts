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
  isDefault?: boolean;
  isBuiltin?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface WorkflowStore {
  workflows: WorkflowProject[];
  fetchWorkflows: () => Promise<void>;
  addWorkflow: (workflow: WorkflowProject) => Promise<void>;
  removeWorkflow: (id: string) => Promise<void>;
  updateWorkflow: (id: string, data: Partial<WorkflowProject>) => Promise<void>;
  setDefaultWorkflow: (id: string) => Promise<void>;
}

// Mapper to Rust
function toRustWorkflow(w: WorkflowProject): any {
  return {
    id: w.id,
    name: w.name || '',
    description: w.description || '',
    type: w.type || 'custom',
    jsonContent: w.jsonContent || '{}',
    isDefault: w.isDefault || false,
    isBuiltin: w.isBuiltin || false,
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
    isDefault: r.isDefault,
    isBuiltin: r.isBuiltin,
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
  setDefaultWorkflow: async (id) => {
    try {
      const target = get().workflows.find((w) => w.id === id);
      if (!target) return;
      await invoke('set_default_workflow', { id });
      // per-type 默认：只清同 type 的旧 default，其他 type 的 default 保持不动。
      // 后端 set_default_workflow 也是这个语义；乐观更新必须对齐，否则前端会
      // 短暂认为其他 type 也没默认，UI 显示错误状态直到下次 refetch。
      set((state) => ({
        workflows: state.workflows.map((w) => ({
          ...w,
          isDefault: w.id === id
            ? true
            : (w.type === target.type ? false : w.isDefault),
        })),
      }));
    } catch (error) {
      console.error('Failed to set default workflow:', error);
    }
  },
}));
