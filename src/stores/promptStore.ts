import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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
  instanceImages?: string[];
}

interface PromptStore {
  prompts: PromptProject[];
  fetchPrompts: () => Promise<void>;
  addPrompt: (prompt: PromptProject) => Promise<void>;
  removePrompt: (id: string) => Promise<void>;
  updatePrompt: (id: string, data: Partial<PromptProject>) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
}

// Mapper to Rust
function toRustPrompt(p: PromptProject): any {
  return {
    id: p.id,
    title: p.title || '',
    description: p.description || '',
    positivePrompt: p.positivePrompt || '',
    negativePrompt: p.negativePrompt || '',
    artistPrompt: p.artistPrompt || '',
    width: p.width || 1024,
    height: p.height || 1024,
    steps: p.steps || 25,
    cfgScale: p.cfgScale || 7.0,
    seed: p.seed || '-1',
    samplerName: p.sampler || 'euler',
    scheduler: p.scheduler || 'normal',
    baseModel: p.baseModel || '',
    vaeModel: p.vaeModel || '',
    loraConfigs: JSON.stringify(p.loraConfigs || []),
    tags: (p.tags || []).map((t, i) => ({ id: `tag_${Date.now()}_${i}`, name: t, color: '#ff6b9d', createdAt: Date.now() })),
    isFavorite: p.isFavorite || false,
    isPinned: false,
    createdAt: p.createdAt || Date.now(),
    updatedAt: p.updatedAt || Date.now(),
    images: (p.instanceImages || []).map((path, i) => ({
      id: `pimg_${Date.now()}_${i}`,
      promptId: p.id,
      filePath: path,
      fileName: `image_${i}.png`,
      createdAt: Date.now()
    }))
  };
}

// Mapper from Rust
function fromRustPrompt(r: any): PromptProject {
  let loras = [];
  try { loras = JSON.parse(r.loraConfigs || '[]'); } catch(e) {}
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    positivePrompt: r.positivePrompt,
    negativePrompt: r.negativePrompt,
    artistPrompt: r.artistPrompt,
    width: r.width,
    height: r.height,
    steps: r.steps,
    cfgScale: r.cfgScale,
    seed: r.seed,
    sampler: r.samplerName,
    scheduler: r.scheduler,
    baseModel: r.baseModel || '',
    vaeModel: r.vaeModel || '',
    loraConfigs: loras,
    tags: (r.tags || []).map((t: any) => t.name),
    isFavorite: r.isFavorite,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    instanceImages: (r.images || []).map((img: any) => img.filePath)
  };
}

export const usePromptStore = create<PromptStore>((set, get) => ({
  prompts: [],
  fetchPrompts: async () => {
    try {
      const rustPrompts = await invoke<any[]>('list_prompts');
      set({ prompts: rustPrompts.map(fromRustPrompt) });
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
    }
  },
  addPrompt: async (prompt) => {
    try {
      await invoke('create_prompt', { prompt: toRustPrompt(prompt) });
      set((state) => ({ prompts: [prompt, ...state.prompts] }));
    } catch (error) {
      console.error('Failed to add prompt:', error);
    }
  },
  removePrompt: async (id) => {
    try {
      await invoke('delete_prompt', { id });
      set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) }));
    } catch (error) {
      console.error('Failed to remove prompt:', error);
    }
  },
  updatePrompt: async (id, data) => {
    try {
      const currentPrompt = get().prompts.find((p) => p.id === id);
      if (!currentPrompt) return;
      const updatedPrompt = { ...currentPrompt, ...data, updatedAt: Date.now() };
      await invoke('update_prompt', { prompt: toRustPrompt(updatedPrompt) });
      set((state) => ({
        prompts: state.prompts.map((p) => (p.id === id ? updatedPrompt : p)),
      }));
    } catch (error) {
      console.error('Failed to update prompt:', error);
    }
  },
  toggleFavorite: async (id) => {
    try {
      const currentPrompt = get().prompts.find((p) => p.id === id);
      if (!currentPrompt) return;
      const updatedPrompt = { ...currentPrompt, isFavorite: !currentPrompt.isFavorite };
      await invoke('update_prompt', { prompt: toRustPrompt(updatedPrompt) });
      set((state) => ({
        prompts: state.prompts.map((p) => (p.id === id ? updatedPrompt : p)),
      }));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  },
}));
