import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LoraConfig {
  name: string;
  strength: number;
  enabled: boolean;
}

export interface PromptProject {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  positivePrompt: string;
  negativePrompt: string;
  artistPrompt: string;
  
  // Generation Params
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: string;
  sampler: string;
  scheduler: string;
  
  // Model Configs
  baseModel: string;
  vaeModel: string;
  loraConfigs: LoraConfig[];
  
  // Metadata
  tags: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

interface PromptStore {
  prompts: PromptProject[];
  addPrompt: (prompt: PromptProject) => void;
  removePrompt: (id: string) => void;
  updatePrompt: (id: string, data: Partial<PromptProject>) => void;
  toggleFavorite: (id: string) => void;
}

const mockPrompts: PromptProject[] = [
  {
    id: "1",
    title: "赛博朋克夜之城",
    description: "具有强烈霓虹灯光效的赛博朋克城市全景，高画质设定。",
    coverImage: "https://images.unsplash.com/photo-1515630278258-407f66498911?q=80&w=600&auto=format&fit=crop",
    positivePrompt: "masterpiece, best quality, cyberpunk city, neon lights, rainy street, highly detailed, 8k resolution, cinematic lighting",
    negativePrompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality",
    artistPrompt: "by greg rutkowski, by makoto shinkai",
    width: 1024,
    height: 576,
    steps: 30,
    cfgScale: 7.0,
    seed: "-1",
    sampler: "euler",
    scheduler: "normal",
    baseModel: "sd_xl_base_1.0.safetensors",
    vaeModel: "auto",
    loraConfigs: [
      { name: "cyberpunk_neon_v1.safetensors", strength: 0.8, enabled: true }
    ],
    tags: ["场景", "赛博朋克", "夜景"],
    isFavorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: "2",
    title: "二次元机甲少女",
    description: "标准动漫质感，适用于人物生成设定图。",
    coverImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop",
    positivePrompt: "1girl, solo, mecha musume, mechanical parts, glowing armor, dynamic pose, looking at viewer, masterpiece, high quality, anime style",
    negativePrompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts",
    artistPrompt: "",
    width: 832,
    height: 1216,
    steps: 25,
    cfgScale: 6.0,
    seed: "12345678",
    sampler: "dpmpp_2m",
    scheduler: "karras",
    baseModel: "animagine-xl-3.1.safetensors",
    vaeModel: "sdxl_vae.safetensors",
    loraConfigs: [
      { name: "mecha_details_xl.safetensors", strength: 0.65, enabled: true },
      { name: "anime_flat_color.safetensors", strength: 0.4, enabled: false }
    ],
    tags: ["人物", "二次元", "机甲"],
    isFavorite: false,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000
  }
];

export const usePromptStore = create<PromptStore>()(
  persist(
    (set) => ({
      prompts: mockPrompts,
      addPrompt: (prompt) =>
        set((state) => ({ prompts: [...state.prompts, prompt] })),
      removePrompt: (id) =>
        set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) })),
      updatePrompt: (id, data) =>
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),
      toggleFavorite: (id) =>
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)),
        })),
    }),
    {
      name: 'prompt-storage',
    }
  )
);
