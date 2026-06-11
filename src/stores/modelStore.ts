import { create } from 'zustand';
import { comfyService } from '../services/comfyService';

interface ModelStore {
  checkpoints: string[];
  loras: string[];
  isLoading: boolean;
  fetchModels: () => Promise<void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  checkpoints: [],
  loras: [],
  isLoading: false,

  fetchModels: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    
    try {
      const objectInfo = await comfyService.fetchObjectInfo();
      if (!objectInfo) {
        set({ isLoading: false });
        return;
      }

      let checkpoints: string[] = [];
      let loras: string[] = [];

      // Extract checkpoints from CheckpointLoaderSimple
      if (objectInfo['CheckpointLoaderSimple']?.input?.required?.ckpt_name) {
        const ckptArray = objectInfo['CheckpointLoaderSimple'].input.required.ckpt_name[0];
        if (Array.isArray(ckptArray)) {
          checkpoints = ckptArray;
        }
      }

      // Extract loras from LoraLoader or Power Lora Loader (rgthree)
      if (objectInfo['LoraLoader']?.input?.required?.lora_name) {
        const loraArray = objectInfo['LoraLoader'].input.required.lora_name[0];
        if (Array.isArray(loraArray)) {
          loras = loraArray;
        }
      }

      set({ checkpoints, loras, isLoading: false });
    } catch (e) {
      console.error("Failed to fetch models from comfy store:", e);
      set({ isLoading: false });
    }
  }
}));
