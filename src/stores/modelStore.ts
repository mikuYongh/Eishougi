import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settingsStore';
import { toast } from 'sonner';

interface ModelStore {
  checkpoints: string[];
  loras: string[];
  isLoading: boolean;
  isError: boolean;
  errorMsg: string;
  lastFetched: number;
  fetchModels: (force?: boolean) => Promise<void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  checkpoints: [],
  loras: [],
  isLoading: false,
  isError: false,
  errorMsg: "",
  lastFetched: 0,

  fetchModels: async (force = false) => {
    const { isLoading, lastFetched } = get();
    if (isLoading) return;

    if (!force && Date.now() - lastFetched < 60000 && get().checkpoints.length > 0) {
      return;
    }

    set({ isLoading: true, isError: false, errorMsg: "" });

    try {
      const t0 = performance.now();
      const comfyUrl = useSettingsStore.getState().settings.comfyUrl;
      const result: { checkpoints: string[]; loras: string[] } = await invoke('fetch_comfy_models', { url: comfyUrl || null });
      const elapsed = Math.round(performance.now() - t0);

      set({
        checkpoints: result.checkpoints || [],
        loras: result.loras || [],
        isLoading: false,
        isError: false,
        lastFetched: Date.now(),
      });

      if (force) {
        toast.success(`模型列表刷新成功（${result.checkpoints.length} 模型 / ${result.loras.length} LoRA）`);
      } else if (result.checkpoints.length === 0 && result.loras.length === 0) {
        toast.info("未发现模型，请确认 ComfyUI 已安装相应节点");
      }
      console.info(`[ComfyModel] fetchModels done ${elapsed}ms: ${result.checkpoints.length} checkpoints, ${result.loras.length} loras`);
    } catch (e: any) {
      set({ isLoading: false, isError: true, errorMsg: String(e) });
      toast.error(`模型列表加载失败: ${e}`);
      console.error(`[ComfyModel] fetchModels FAILED:`, e);
    }
  },
}));
