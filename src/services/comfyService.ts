// ComfyUI Service Integration

import { useSettingsStore } from '../stores/settingsStore';

// Get dynamically from settings
export const getComfyUrl = () => {
  let url = useSettingsStore.getState().settings.comfyUrl || 'http://127.0.0.1:8188';
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const getWsUrl = () => {
  const httpUrl = getComfyUrl();
  return httpUrl.replace('http://', 'ws://').replace('https://', 'wss://');
};

export interface ComfyProgress {
  value: number;
  max: number;
  node: string;
}

export class ComfyService {
  private clientId: string;
  private ws: WebSocket | null = null;

  constructor() {
    this.clientId = Math.random().toString(36).substring(2, 15);
  }

  connect(
    onProgress: (progress: ComfyProgress, promptId?: string) => void,
    onComplete: (images: string[], promptId?: string) => void,
    onError: (err: string, promptId?: string) => void,
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void
  ) {
    if (this.ws) {
      this.ws.close();
    }
    
    if (onStatusChange) onStatusChange('connecting');
    const wsUrl = `${getWsUrl()}/ws?clientId=${this.clientId}`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      if (onStatusChange) onStatusChange('connected');
    };
    
    this.ws.onmessage = async (event) => {
      try {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          console.log("[ComfyWS] received message type:", msg.type, msg.type === 'executed' ? 'has output:' + !!msg.data?.output : '');
          if (msg.type === 'progress') {
            onProgress({ value: msg.data.value, max: msg.data.max, node: msg.data.node }, msg.data?.prompt_id);
          } else if (msg.type === 'executed') {
            if (msg.data.output && msg.data.output.images) {
              const comfyUrl = getComfyUrl();
              const images = msg.data.output.images.map((img: any) => 
                `${comfyUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`
              );
              console.log("[ComfyWS] calling onComplete with images:", images.length, "prompt_id:", msg.data?.prompt_id);
              onComplete(images, msg.data?.prompt_id);
            } else {
              console.log("[ComfyWS] executed msg without output images:", JSON.stringify(msg.data));
            }
          } else if (msg.type === 'execution_error') {
            console.error("[ComfyWS] execution_error:", msg.data?.exception_message);
            onError(msg.data.exception_message || "Execution error in ComfyUI", msg.data?.prompt_id);
          } else if (msg.type === 'execution_success') {
            console.log("[ComfyWS] execution_success for prompt:", msg.data?.prompt_id);
          } else if (msg.type === 'executing') {
            console.log("[ComfyWS] executing node:", msg.data?.node);
          } else if (msg.type === 'execution_cached') {
            console.log("[ComfyWS] execution_cached for prompt:", msg.data?.prompt_id);
          }
        } else {
          console.log("[ComfyWS] received non-string data:", typeof event.data);
        }
      } catch (e) {
        console.error("[ComfyWS] Failed to parse message:", e, event.data);
      }
    };

    this.ws.onerror = () => {
      // Don't call onError directly for WebSocket connection failures as it blocks the UI.
      // Just update status to disconnected.
    };

    this.ws.onclose = () => {
      if (onStatusChange) onStatusChange('disconnected');
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async queuePrompt(prompt: any) {
    try {
      const comfyUrl = getComfyUrl();
      const response = await fetch(`${comfyUrl}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          client_id: this.clientId
        })
      });

      if (!response.ok) {
        let errDetail = "";
        try {
          const errJson = await response.json();
          errDetail = JSON.stringify(errJson);
        } catch (e) {
          try {
            errDetail = await response.text();
          } catch(e2) {}
        }
        throw new Error(`Failed to queue prompt: ${response.status} ${response.statusText}. Detail: ${errDetail}`);
      }

      return await response.json();
    } catch (e: any) {
      throw new Error(`Failed to communicate with ComfyUI: ${e.message}`);
    }
  }

  async interrupt() {
    try {
      const comfyUrl = getComfyUrl();
      const response = await fetch(`${comfyUrl}/interrupt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to interrupt: ${response.status} ${response.statusText}`);
      }
      return true;
    } catch (e: any) {
      console.error(`Failed to interrupt ComfyUI execution: ${e.message}`);
      return false;
    }
  }

  async fetchObjectInfo() {
    try {
      const comfyUrl = getComfyUrl();
      const response = await fetch(`${comfyUrl}/object_info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch object info: ${response.statusText}`);
      }

      return await response.json();
    } catch (e: any) {
      console.error(`Failed to fetch ComfyUI object info: ${e.message}`);
      return null;
    }
  }

  // Analyze a workflow to extract its settings (model, LoRAs, whether it uses size picker, etc.)
  analyzeWorkflow(workflowStr: string): {
    hasSizePicker: boolean;
    baseModel: string | null;
    vaeModel: string | null;
    samplerName: string | null;
    scheduler: string | null;
    width: number | null;
    height: number | null;
    steps: number | null;
    cfgScale: number | null;
    loras: { name: string; strength: number; enabled: boolean }[];
  } {
    const result = {
      hasSizePicker: false,
      baseModel: null as string | null,
      vaeModel: null as string | null,
      samplerName: null as string | null,
      scheduler: null as string | null,
      width: null as number | null,
      height: null as number | null,
      steps: null as number | null,
      cfgScale: null as number | null,
      loras: [] as { name: string; strength: number; enabled: boolean }[]
    };

    try {
      const workflow = JSON.parse(workflowStr);
      for (const key in workflow) {
        const node = workflow[key];
        if (!node.inputs) continue;

        // Check for SDXLEmptyLatentSizePicker+
        if (node.class_type === "SDXLEmptyLatentSizePicker+") {
          result.hasSizePicker = true;
        }

        // Check for models
        if (node.class_type === "UNETLoader" || node.class_type === "CheckpointLoaderSimple") {
          const modelVal = node.inputs.unet_name || node.inputs.ckpt_name;
          if (modelVal) result.baseModel = modelVal;
        }
        if (node.class_type === "VAELoader") {
          if (node.inputs.vae_name) result.vaeModel = node.inputs.vae_name;
        }

        // Check for KSampler parameters
        if (node.class_type.includes("KSampler")) {
          if (node.inputs.sampler_name) result.samplerName = node.inputs.sampler_name;
          if (node.inputs.scheduler) result.scheduler = node.inputs.scheduler;
          if (typeof node.inputs.steps === 'number') result.steps = node.inputs.steps;
          if (typeof node.inputs.cfg === 'number') result.cfgScale = node.inputs.cfg;
        }

        // Check for Resolution
        if (node.class_type.includes("EmptyLatent") || node.class_type.includes("SizePicker") || node.class_type.includes("Latent")) {
          if (typeof node.inputs.empty_latent_width === 'number') result.width = node.inputs.empty_latent_width;
          else if (typeof node.inputs.width === 'number') result.width = node.inputs.width;
          
          if (typeof node.inputs.empty_latent_height === 'number') result.height = node.inputs.empty_latent_height;
          else if (typeof node.inputs.height === 'number') result.height = node.inputs.height;
        }

        // Check for LoRAs in Power Lora Loader (rgthree)
        if (node.class_type === "Power Lora Loader (rgthree)") {
          for (let i = 1; i <= 20; i++) {
            const loraKey = `lora_${i}`;
            const loraSlot = node.inputs[loraKey];
            if (loraSlot && loraSlot.lora && loraSlot.lora !== "None") {
              result.loras.push({
                name: loraSlot.lora,
                strength: typeof loraSlot.strength === 'number' ? loraSlot.strength : 1.0,
                enabled: typeof loraSlot.on === 'boolean' ? loraSlot.on : true
              });
            }
          }
        }
        // General LoraLoader
        if (node.class_type === "LoraLoader") {
          if (node.inputs.lora_name) {
            result.loras.push({
              name: node.inputs.lora_name,
              strength: typeof node.inputs.strength_model === 'number' ? node.inputs.strength_model : 1.0,
              enabled: true
            });
          }
        }
      }
    } catch (e) {
      console.error("Failed to analyze workflow:", e);
    }
    return result;
  }

  private cachedObjectInfo: any = null;

  async getObjectInfo() {
    if (this.cachedObjectInfo) return this.cachedObjectInfo;
    this.cachedObjectInfo = await this.fetchObjectInfo();
    return this.cachedObjectInfo;
  }

  // Inject user PromptProject parameters into a raw ComfyUI JSON workflow
  async injectParameters(workflowStr: string, project: any): Promise<any> {
    console.log("[ComfyService] injectParameters started.");
    console.log("[ComfyService] Input project settings:", JSON.stringify(project, null, 2));
    
    // Fetch object_info to get dynamic widget valid options
    const objectInfo = await this.getObjectInfo();
    
    try {
      const workflow = JSON.parse(workflowStr);

      let loraConfigs = project.loraConfigs;
      if (typeof loraConfigs === 'string') {
        try {
          loraConfigs = JSON.parse(loraConfigs);
        } catch (e) {
          loraConfigs = [];
        }
      }
      if (!Array.isArray(loraConfigs)) {
        loraConfigs = [];
      }

      const seedInt = parseInt(project.seed);
      const finalSeed = (isNaN(seedInt) || seedInt < 0) ? Math.floor(Math.random() * 1000000000) : seedInt;
      const finalPositive = project.artistPrompt 
        ? `${project.positivePrompt}, ${project.artistPrompt}` 
        : project.positivePrompt;

      for (const key in workflow) {
        const node = workflow[key];
        if (!node.inputs) continue;

        // 1. KSampler / KSamplerAdvanced
        if (node.class_type.includes("KSampler")) {
          if (project.steps !== undefined && node.inputs.steps !== undefined) node.inputs.steps = project.steps;
          if (project.cfgScale !== undefined && node.inputs.cfg !== undefined) node.inputs.cfg = project.cfgScale;
          if (project.sampler !== undefined && project.sampler !== null && node.inputs.sampler_name !== undefined) node.inputs.sampler_name = project.sampler;
          if (project.scheduler !== undefined && project.scheduler !== null && node.inputs.scheduler !== undefined) node.inputs.scheduler = project.scheduler;
          if (project.seed !== undefined && node.inputs.noise_seed !== undefined) node.inputs.noise_seed = finalSeed;
          if (project.seed !== undefined && node.inputs.seed !== undefined) node.inputs.seed = finalSeed;
        }

        // 2. Positive Prompt (CLIPTextEncode / Simple String / StringConcatenate)
        if (project.positivePrompt !== undefined) {
          if (node.class_type === "CLIPTextEncode" && node._meta?.title?.includes("Positive")) {
            if (typeof node.inputs.text === 'string') {
              node.inputs.text = finalPositive;
            }
          } else if (node.class_type === "Simple String" || node.class_type === "SimpleString") {
            node.inputs.string = finalPositive;
          } else if (node.class_type === "StringConcatenate") {
            if (typeof node.inputs.string_b === 'string') {
              node.inputs.string_b = finalPositive;
            } else if (typeof node.inputs.string_a === 'string') {
              node.inputs.string_a = finalPositive;
            }
          }
        }

        // 3. Negative Prompt (CLIPTextEncode)
        if (project.negativePrompt !== undefined) {
          if (node.class_type === "CLIPTextEncode" && node._meta?.title?.includes("Negative")) {
            if (typeof node.inputs.text === 'string') {
              node.inputs.text = project.negativePrompt;
            }
          }
        }

        // 4. UNet / Base Model
        if (node.class_type === "UNETLoader" || node.class_type === "CheckpointLoaderSimple") {
          if (project.baseModel && project.baseModel.trim() !== '' && project.baseModel !== 'sd_xl_base_1.0.safetensors') {
            if (node.inputs.unet_name !== undefined) node.inputs.unet_name = project.baseModel;
            if (node.inputs.ckpt_name !== undefined) node.inputs.ckpt_name = project.baseModel;
          }
        }
        // VAE Model
        if (node.class_type === "VAELoader") {
          if (project.vaeModel && project.vaeModel.trim() !== '' && project.vaeModel !== 'auto') {
            if (node.inputs.vae_name !== undefined) node.inputs.vae_name = project.vaeModel;
          }
        }

        // 5. Resolution / Empty Latent
        if (node.class_type === "SDXLEmptyLatentSizePicker+") {
          if (project.width !== undefined && project.height !== undefined && project.width > 0 && project.height > 0) {
            let customStr = "custom ⚠️";
            if (objectInfo && objectInfo["SDXLEmptyLatentSizePicker+"]?.input?.required?.resolution?.[0]) {
              const resList = objectInfo["SDXLEmptyLatentSizePicker+"].input.required.resolution[0];
              const found = resList.find((r: string) => r.toLowerCase().includes("custom"));
              if (found) customStr = found;
              else if (resList.length > 0) customStr = resList[resList.length - 1];
            }
            node.inputs.resolution = customStr;
            node.inputs.empty_latent_width = project.width;
            node.inputs.width_override = project.width;
            node.inputs.empty_latent_height = project.height;
            node.inputs.height_override = project.height;
          } else if (project.resolution !== undefined && project.resolution !== null) {
            node.inputs.resolution = project.resolution;
          }
        } else if (node.class_type.includes("EmptyLatent") || node.class_type.includes("SizePicker") || node.class_type.includes("Latent")) {
          if (project.width !== undefined && node.inputs.width !== undefined) node.inputs.width = project.width;
          if (project.height !== undefined && node.inputs.height !== undefined) node.inputs.height = project.height;
          if (project.width !== undefined && node.inputs.width_override !== undefined) node.inputs.width_override = project.width;
          if (project.height !== undefined && node.inputs.height_override !== undefined) node.inputs.height_override = project.height;
        }

        // 6. Power Lora Loader (rgthree)
        if (node.class_type === "Power Lora Loader (rgthree)") {
          if (loraConfigs && loraConfigs.length > 0) {
            // Match LoRAs in slots by name and apply override configs
            for (let i = 1; i <= 20; i++) {
              const slotKey = `lora_${i}`;
              const slot = node.inputs[slotKey];
              if (slot && slot.lora && slot.lora !== "None") {
                const config = loraConfigs.find((lc: any) => lc.name === slot.lora);
                if (config) {
                  slot.on = config.enabled;
                  slot.strength = config.strength;
                }
              }
            }
          }
        }

        // 7. General LoraLoader
        if (node.class_type === "LoraLoader") {
          if (loraConfigs && loraConfigs.length > 0 && node.inputs.lora_name) {
            const config = loraConfigs.find((lc: any) => lc.name === node.inputs.lora_name);
            if (config) {
              // Note: Standard LoraLoader does not have an 'on' flag, but we can set model/clip strength to 0 if disabled
              const str = config.enabled ? config.strength : 0;
              if (node.inputs.strength_model !== undefined) node.inputs.strength_model = str;
              if (node.inputs.strength_clip !== undefined) node.inputs.strength_clip = str;
            }
          }
        }
      }

      const summary: any = {};
      for (const key in workflow) {
        const node = workflow[key];
        if (!node.inputs) continue;
        const ct = node.class_type || "";
        const t = node._meta?.title || "";
        if (ct.includes("KSampler") || ct.includes("CLIPTextEncode") || ct.includes("Simple String") || ct.includes("StringConcatenate") || ct.includes("EmptyLatent") || ct.includes("SizePicker") || ct.includes("Loader") || ct.includes("Anything Everywhere") || ct.includes("Power Lora") || ct.includes("Ollama") || ct.includes("ToriiGate") || ct.includes("Captioner")) {
          const info: any = { class_type: ct, title: t };
          if (ct.includes("KSampler")) {
            info.params = { steps: node.inputs.steps, cfg: node.inputs.cfg, sampler: node.inputs.sampler_name, scheduler: node.inputs.scheduler };
          } else if (ct.includes("CLIPTextEncode")) {
            info.text_input = typeof node.inputs.text === 'string' ? node.inputs.text.substring(0, 60) : `link->[${node.inputs.text}]`;
          } else if (ct === "Simple String" || ct === "SimpleString") {
            info.text = node.inputs.string?.substring?.(0, 60) || node.inputs.string;
          } else if (ct === "StringConcatenate") {
            info.string_a = typeof node.inputs.string_a === 'string' ? node.inputs.string_a.substring(0, 40) : node.inputs.string_a;
            info.string_b = typeof node.inputs.string_b === 'string' ? node.inputs.string_b.substring(0, 40) : node.inputs.string_b;
          } else if (ct.includes("Loader")) {
            info.model = node.inputs.unet_name || node.inputs.ckpt_name || node.inputs.clip_name || node.inputs.vae_name || "?";
          } else if (ct.includes("Anything Everywhere")) {
            info.inputs = JSON.stringify(node.inputs);
          } else if (ct.includes("Ollama") || ct.includes("ToriiGate") || ct.includes("Captioner")) {
            info.prompt_source = JSON.stringify(node.inputs.prompt || node.inputs.string || node.inputs.system);
          }
          summary[key] = info;
        }
      }
      console.log("[ComfyService] Workflow node summary:", JSON.stringify(summary, null, 2));

      console.log("[ComfyService] Final injected workflow payload:", JSON.stringify(workflow, null, 2));
      return workflow;
    } catch (e) {
      console.error("Failed to inject parameters into workflow JSON", e);
      return null;
    }
  }
}

export const comfyService = new ComfyService();

