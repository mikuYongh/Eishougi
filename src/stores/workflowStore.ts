import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  addWorkflow: (workflow: WorkflowProject) => void;
  removeWorkflow: (id: string) => void;
  updateWorkflow: (id: string, data: Partial<WorkflowProject>) => void;
}

const mockWorkflows: WorkflowProject[] = [
  {
    id: "wf_1",
    name: "基础文生图 - SDXL 高画质版",
    description: "最标准的基础文生图工作流，支持 Base + VAE + 多个 LoRA 加载，自动替换节点。",
    type: "text2img",
    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop",
    jsonContent: "{\n  \"3\": {\n    \"inputs\": {\n      \"seed\": 123456,\n      \"steps\": 20,\n      \"cfg\": 8.0,\n      \"sampler_name\": \"euler\",\n      \"scheduler\": \"normal\"\n    },\n    \"class_type\": \"KSampler\"\n  }\n}",
    tags: ["基础", "SDXL"],
    createdAt: Date.now() - 1000000,
    updatedAt: Date.now() - 500000
  },
  {
    id: "wf_2",
    name: "AnimateDiff 图生视频",
    description: "将任意图片转换为 2 秒的动态视频，适用于二次元与写实。",
    type: "img2video",
    thumbnail: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=600&auto=format&fit=crop",
    jsonContent: "{\n  \"video_node\": {\n    \"class_type\": \"AnimateDiffLoader\"\n  }\n}",
    tags: ["视频", "AnimateDiff"],
    createdAt: Date.now() - 2000000,
    updatedAt: Date.now() - 1500000
  },
  {
    id: "wf_3",
    name: "WD14 提示词反推",
    description: "使用 WD14 Tagger 模型对输入的图片进行分析并提取特征标签。",
    type: "tagger",
    jsonContent: "{\n  \"tagger\": {\n    \"class_type\": \"WD14Tagger\"\n  }\n}",
    tags: ["反推", "工具"],
    createdAt: Date.now() - 3000000,
    updatedAt: Date.now() - 2500000
  }
];

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set) => ({
      workflows: mockWorkflows,
      addWorkflow: (workflow) =>
        set((state) => ({ workflows: [...state.workflows, workflow] })),
      removeWorkflow: (id) =>
        set((state) => ({ workflows: state.workflows.filter((w) => w.id !== id) })),
      updateWorkflow: (id, data) =>
        set((state) => ({
          workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...data, updatedAt: Date.now() } : w)),
        })),
    }),
    {
      name: 'workflow-storage',
    }
  )
);
