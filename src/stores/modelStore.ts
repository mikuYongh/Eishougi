import { create } from 'zustand';
import { comfyService, getComfyUrl } from '../services/comfyService';
import { toast } from 'sonner';
import { appLog } from '../utils/appLog';

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
    
    // Avoid frequent re-fetching unless forced (cache for 60 seconds)
    if (!force && Date.now() - lastFetched < 60000 && get().checkpoints.length > 0) {
      return;
    }

    set({ isLoading: true, isError: false, errorMsg: "" });
    
    try {
      const t0 = performance.now();
      const comfyUrl = getComfyUrl();
      console.info(`[ComfyModel] fetchModels start, comfyUrl=${comfyUrl}, force=${force}`);
      const objectInfo = await comfyService.fetchObjectInfo();
      const fetchMs = Math.round(performance.now() - t0);
      const objKeys = Object.keys(objectInfo);
      console.info(
        `[ComfyModel] fetchObjectInfo returned ${objKeys.length} nodes in ${fetchMs}ms: ` +
        `[${objKeys.join(', ')}]`
      );
      if (!objectInfo || objKeys.length === 0) {
        throw new Error("连接超时或服务未启动，无法获取节点列表。");
      }

      let checkpoints: string[] = [];
      let loras: string[] = [];

      // Extract checkpoints prioritizing UNETLoader (loads from diffusion_models directory)
      const unetSource = objectInfo['UNETLoader'];
      const ckptSource = objectInfo['CheckpointLoaderSimple'] || objectInfo['CheckpointLoader'];
      
      if (unetSource?.input?.required?.unet_name) {
        const unetArray = unetSource.input.required.unet_name[0];
        if (Array.isArray(unetArray)) checkpoints = unetArray;
        console.info(`[ComfyModel] checkpoints from UNETLoader: ${checkpoints.length}`);
      } else if (ckptSource?.input?.required?.ckpt_name) {
        const ckptArray = ckptSource.input.required.ckpt_name[0];
        if (Array.isArray(ckptArray)) checkpoints = ckptArray;
        console.info(`[ComfyModel] checkpoints from CheckpointLoader(Simple): ${checkpoints.length}`);
      } else if (ckptSource?.input?.required?.unet_name) {
        const unetArray = ckptSource.input.required.unet_name[0];
        if (Array.isArray(unetArray)) checkpoints = unetArray;
        console.info(`[ComfyModel] checkpoints from Checkpoint(unet_name): ${checkpoints.length}`);
      } else {
        console.warn(`[ComfyModel] no checkpoint loader node found in object_info`);
        appLog.warn('ComfyModel', 'no checkpoint loader node found');
      }

      // Extract loras from LoraLoader or Power Lora Loader (rgthree)
      const loraSource = objectInfo['LoraLoader'] || objectInfo['Power Lora Loader (rgthree)'];
      if (loraSource?.input?.required?.lora_name) {
        const loraArray = loraSource.input.required.lora_name[0];
        if (Array.isArray(loraArray)) loras = loraArray;
        console.info(`[ComfyModel] loras from ${objectInfo['LoraLoader'] ? 'LoraLoader' : 'Power Lora Loader (rgthree)'}: ${loras.length}`);
      } else if (loraSource?.input?.required?.lora) {
        const loraArray = loraSource.input.required.lora[0];
        if (Array.isArray(loraArray)) loras = loraArray;
        console.info(`[ComfyModel] loras from Power Lora Loader (rgthree.lora): ${loras.length}`);
      } else {
        console.warn(`[ComfyModel] no lora loader node found, trying fuzzy fallback...`);
        appLog.warn('ComfyModel', 'no lora loader node found, using fuzzy fallback');
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
                    console.info(`[ComfyModel] loras from fuzzy match ${nodeKey}.${inputKey}: ${loras.length}`);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      set({ 
        checkpoints, 
        loras, 
        isLoading: false, 
        isError: false, 
        lastFetched: Date.now() 
      });

      const totalMs = Math.round(performance.now() - t0);
      console.info(
        `[ComfyModel] fetchModels done in ${totalMs}ms: checkpoints=${checkpoints.length}, loras=${loras.length}`
      );

      if (force) {
        toast.success(`模型列表刷新成功（${checkpoints.length} 模型 / ${loras.length} LoRA）`);
      } else if (checkpoints.length === 0 && loras.length === 0) {
        // 接口通但没有节点 — 可能用户 ComfyUI 装的节点不在白名单内
        console.warn(`[ComfyModel] fetched successfully but both lists empty — check if ComfyUI has CheckpointLoaderSimple/LoraLoader installed`);
        toast.warning("已连接 ComfyUI，但未识别到模型节点", {
          description: "请检查 ComfyUI 是否安装了 CheckpointLoaderSimple / LoraLoader 节点",
          duration: 8000,
        });
      }

    } catch (e: any) {
      const msg = e.message || "请求失败，请检查 ComfyUI 服务状态。";
      console.error("Failed to fetch models from comfy store:", e);
      appLog.error('ComfyModel', `fetchModels FAILED: ${msg}`);
      // 保留之前的 checkpoints/loras 缓存，不清空 —— 避免网络抖动让用户面对空列表
      const { checkpoints: oldCheckpoints, loras: oldLoras } = get();
      set({
        isLoading: false,
        isError: true,
        errorMsg: msg,
        // 关键：不覆盖 checkpoints/loras，让用户还能用旧数据
        checkpoints: oldCheckpoints,
        loras: oldLoras,
        // 更新 lastFetched 防止 force=false 时立即重试打满 ComfyUI
        lastFetched: Date.now(),
      });

      // force=true 是用户主动刷新，失败时提示；自动刷新失败只打 console
      if (force) {
        toast.error("刷新模型失败", {
          description: oldCheckpoints.length > 0 || oldLoras.length > 0
            ? `${msg}\n（当前仍显示上次的缓存：${oldCheckpoints.length} 模型 / ${oldLoras.length} LoRA）`
            : msg,
          duration: 6000,
        });
      } else {
        console.warn(`[ComfyModel] fetchModels failed but kept cached: ${oldCheckpoints.length} ckpt, ${oldLoras.length} lora`);
      }
    }
  }
}));
