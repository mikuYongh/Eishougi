// ComfyUI Service Integration

import { useSettingsStore } from '../stores/settingsStore';

// Get dynamically from settings
const getComfyUrl = () => {
  let url = useSettingsStore.getState().settings.comfyUrl || 'http://127.0.0.1:8188';
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const getWsUrl = () => {
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
    onProgress: (progress: ComfyProgress) => void,
    onComplete: (images: string[]) => void,
    onError: (err: string) => void,
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
            onProgress({ value: msg.data.value, max: msg.data.max, node: msg.data.node });
          } else if (msg.type === 'executed') {
            if (msg.data.output && msg.data.output.images) {
              const comfyUrl = getComfyUrl();
              const images = msg.data.output.images.map((img: any) => 
                `${comfyUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`
              );
              console.log("[ComfyWS] calling onComplete with images:", images.length);
              onComplete(images);
            } else {
              console.log("[ComfyWS] executed msg without output images:", JSON.stringify(msg.data));
            }
          } else if (msg.type === 'execution_error') {
            console.error("[ComfyWS] execution_error:", msg.data?.exception_message);
            onError(msg.data.exception_message || "Execution error in ComfyUI");
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
        throw new Error(`Failed to queue prompt: ${response.statusText}`);
      }

      return await response.json();
    } catch (e: any) {
      throw new Error(`Failed to communicate with ComfyUI: ${e.message}`);
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

  // Inject user PromptProject parameters into a raw ComfyUI JSON workflow
  injectParameters(workflowStr: string, project: any): any {
    try {
      const workflow = JSON.parse(workflowStr);

      for (const key in workflow) {
        const node = workflow[key];
        if (!node.inputs) continue;

        // 1. KSampler / KSamplerAdvanced
        if (node.class_type.includes("KSampler")) {
          if (node.inputs.steps !== undefined) node.inputs.steps = project.steps;
          if (node.inputs.cfg !== undefined) node.inputs.cfg = project.cfgScale;
          
          const seedInt = parseInt(project.seed);
          const finalSeed = (isNaN(seedInt) || seedInt < 0) ? Math.floor(Math.random() * 1000000000) : seedInt;
          if (node.inputs.seed !== undefined) node.inputs.seed = finalSeed;
          if (node.inputs.noise_seed !== undefined) node.inputs.noise_seed = finalSeed;
        }

        // 2. Positive Prompt (CLIPTextEncode or Simple String)
        if (node.class_type === "CLIPTextEncode" && node._meta?.title?.includes("Positive")) {
          node.inputs.text = project.positivePrompt;
        } else if (node.class_type === "Simple String" || node.class_type === "SimpleString") {
          node.inputs.string = project.positivePrompt;
        }

        // 3. Negative Prompt (CLIPTextEncode)
        if (node.class_type === "CLIPTextEncode" && node._meta?.title?.includes("Negative")) {
          node.inputs.text = project.negativePrompt;
        }

        // 4. UNet / Base Model
        if (node.class_type === "UNETLoader" || node.class_type === "CheckpointLoaderSimple") {
          const skipModel = !project.baseModel || project.baseModel.trim() === '' || project.baseModel === 'sd_xl_base_1.0.safetensors';
          if (node.inputs.unet_name !== undefined && !skipModel) node.inputs.unet_name = project.baseModel;
          if (node.inputs.ckpt_name !== undefined && !skipModel) node.inputs.ckpt_name = project.baseModel;
        }

        // 5. Resolution / Empty Latent
        if (node.class_type.includes("EmptyLatent") || node.class_type.includes("SizePicker") || node.class_type.includes("Latent")) {
          if (node.inputs.width !== undefined) node.inputs.width = project.width;
          if (node.inputs.height !== undefined) node.inputs.height = project.height;
          if (node.inputs.width_override !== undefined) node.inputs.width_override = project.width;
          if (node.inputs.height_override !== undefined) node.inputs.height_override = project.height;
          // IMPORTANT: Do NOT override "resolution" string properties because many custom nodes (like SDXLEmptyLatentSizePicker+) 
          // use strict enums like "896x1088 (0.82)". Forcing "1024x1024" will trigger 400 Bad Request!
        }

        // 6. Power Lora Loader (rgthree)
        if (node.class_type === "Power Lora Loader (rgthree)") {
          if (project.loraConfigs && project.loraConfigs.length > 0) {
            // Disable all first
            for (let i = 1; i <= 20; i++) {
              const loraKey = `lora_${i}`;
              if (node.inputs[loraKey]) {
                node.inputs[loraKey].on = false;
              }
            }
            // Enable according to project config
            project.loraConfigs.forEach((lora: any, idx: number) => {
              const slot = `lora_${idx + 1}`;
              if (node.inputs[slot]) {
                node.inputs[slot].on = lora.enabled;
                node.inputs[slot].lora = lora.name;
                node.inputs[slot].strength = lora.strength;
              } else {
                node.inputs[slot] = { on: lora.enabled, lora: lora.name, strength: lora.strength };
              }
            });
          }
        }
      }

      return workflow;
    } catch (e) {
      console.error("Failed to inject parameters into workflow JSON", e);
      return null;
    }
  }
}

export const comfyService = new ComfyService();
