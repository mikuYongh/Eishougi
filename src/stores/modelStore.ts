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

      // Extract checkpoints prioritizing UNETLoader (loads from diffusion_models directory)
      const unetSource = objectInfo['UNETLoader'];
      const ckptSource = objectInfo['CheckpointLoaderSimple'] || objectInfo['CheckpointLoader'];
      
      if (unetSource?.input?.required?.unet_name) {
        const unetArray = unetSource.input.required.unet_name[0];
        if (Array.isArray(unetArray)) checkpoints = unetArray;
      } else if (ckptSource?.input?.required?.ckpt_name) {
        const ckptArray = ckptSource.input.required.ckpt_name[0];
        if (Array.isArray(ckptArray)) checkpoints = ckptArray;
      } else if (ckptSource?.input?.required?.unet_name) {
        const unetArray = ckptSource.input.required.unet_name[0];
        if (Array.isArray(unetArray)) checkpoints = unetArray;
      }

      // Extract loras from LoraLoader or Power Lora Loader (rgthree)
      const loraSource = objectInfo['LoraLoader'] || objectInfo['Power Lora Loader (rgthree)'];
      if (loraSource?.input?.required?.lora_name) {
        const loraArray = loraSource.input.required.lora_name[0];
        if (Array.isArray(loraArray)) loras = loraArray;
      } else if (loraSource?.input?.required?.lora) {
        const loraArray = loraSource.input.required.lora[0];
        if (Array.isArray(loraArray)) loras = loraArray;
      } else {
        // Fallback checks for key inputs inside any node with "Lora" in its class_type
        for (const nodeKey in objectInfo) {
          if (nodeKey.toLowerCase().includes("lora")) {
            const inputs = objectInfo[nodeKey]?.input?.required;
            if (inputs) {
              for (const inputKey in inputs) {
                if (inputKey.toLowerCase().includes("lora")) {
                  const arr = inputs[inputKey][0];
                  if (Array.isArray(arr) && arr.length > 0) {
                    loras = arr;
                    break;
                  }
                }
              }
            }
          }
        }
      }

      set({ checkpoints, loras, isLoading: false });
    } catch (e) {
      console.error("Failed to fetch models from comfy store:", e);
      set({ isLoading: false });
    }
  }
}));
