// ComfyUI Service Integration

import { useSettingsStore } from '../stores/settingsStore';
import { invoke } from '@tauri-apps/api/core';
import { appLog } from '../utils/appLog';

// Get dynamically from settings
export const getComfyUrl = () => {
  let url = useSettingsStore.getState().settings.comfyUrl || 'http://127.0.0.1:8188';
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const getVideoComfyUrl = () => {
  let url = useSettingsStore.getState().settings.videoComfyUrl || 'http://127.0.0.1:8188';
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

function isUiWorkflow(workflow: any): boolean {
  return Boolean(workflow && Array.isArray(workflow.nodes));
}

function forEachUiNode(workflow: any, callback: (node: any) => void) {
  (workflow.nodes || []).forEach(callback);
  const subgraphs = workflow.definitions?.subgraphs;
  const definitions = Array.isArray(subgraphs) ? subgraphs : Object.values(subgraphs || {});
  definitions.forEach((definition: any) => (definition.nodes || []).forEach(callback));
}

function getUiWidgetIndex(node: any, inputName: string): number | null {
  const inputs = Array.isArray(node.inputs) ? node.inputs : [];
  const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  let index = 0;
  for (const input of inputs) {
    if (!input.widget) continue;
    if (input.name === inputName) return index < widgets.length ? index : null;
    index += 1;
    if (/seed/i.test(input.name || "") && widgets[index] !== undefined) {
      if (inputName === "control_after_generate") return index;
      index += 1;
    }
  }
  return null;
}

function setUiWidget(node: any, inputName: string, value: any): boolean {
  const index = getUiWidgetIndex(node, inputName);
  if (index === null) return false;
  node.widgets_values[index] = value;
  return true;
}

function getUiWidget(node: any, inputName: string): any {
  const index = getUiWidgetIndex(node, inputName);
  return index === null ? undefined : node.widgets_values?.[index];
}

function injectUiWorkflow(workflow: any, project: any): any {
  const loraConfigs = Array.isArray(project.loraConfigs) ? project.loraConfigs : [];
  const seed = Number(project.seed);
  const finalSeed = Number.isFinite(seed) && seed >= 0 ? seed : Math.floor(Math.random() * 1_000_000_000);
  const positive = project.artistPrompt ? `${project.positivePrompt || ""}, ${project.artistPrompt}` : project.positivePrompt;

  forEachUiNode(workflow, (node) => {
    const type = node.type || "";
    const title = String(node.title || "");
    if (!Array.isArray(node.widgets_values)) node.widgets_values = [];

    if (type === "LoadImage" && project.imageFilename) setUiWidget(node, "image", project.imageFilename);
    if (type === "Simple String" || type === "SimpleString") {
      if (positive !== undefined) setUiWidget(node, "string", positive);
    }
    if (type === "CLIPTextEncode") {
      if (/positive/i.test(title) && positive !== undefined) setUiWidget(node, "text", positive);
      if (/negative/i.test(title) && project.negativePrompt !== undefined) setUiWidget(node, "text", project.negativePrompt);
    }

    if (type.includes("KSampler")) {
      if (project.steps > 0) setUiWidget(node, "steps", project.steps);
      if (project.cfgScale > 0) setUiWidget(node, "cfg", project.cfgScale);
      if (project.sampler) setUiWidget(node, "sampler_name", project.sampler);
      if (project.scheduler) setUiWidget(node, "scheduler", project.scheduler);
      if (project.seed !== undefined) {
        setUiWidget(node, "seed", finalSeed);
        setUiWidget(node, "noise_seed", finalSeed);
      }
    }

    if (type === "UNETLoader" || type === "CheckpointLoaderSimple" || type === "CheckpointLoader" || type === "ImageOnlyCheckpointLoader") {
      if (project.baseModel) {
        setUiWidget(node, "unet_name", project.baseModel);
        setUiWidget(node, "ckpt_name", project.baseModel);
      }
    }
    if (type === "VAELoader" && project.vaeModel && project.vaeModel !== "auto") setUiWidget(node, "vae_name", project.vaeModel);

    if (type === "SDXLEmptyLatentSizePicker+") {
      const resolution = project.resolution || (project.width && project.height ? `${project.width}x${project.height}` : undefined);
      if (resolution) setUiWidget(node, "resolution", resolution);
      if (project.width > 0) {
        setUiWidget(node, "width_override", project.width);
        setUiWidget(node, "empty_latent_width", project.width);
      }
      if (project.height > 0) {
        setUiWidget(node, "height_override", project.height);
        setUiWidget(node, "empty_latent_height", project.height);
      }
    } else if (type.includes("EmptyLatent") || type.includes("LatentVideo")) {
      if (project.width > 0) setUiWidget(node, "width", project.width);
      if (project.height > 0) setUiWidget(node, "height", project.height);
      if (project.duration > 0) {
        setUiWidget(node, "length", project.duration);
        setUiWidget(node, "duration", project.duration);
      }
    }

    if (type === "PrimitiveInt") {
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes("width") && project.width > 0) setUiWidget(node, "value", project.width);
      if (lowerTitle.includes("height") && project.height > 0) setUiWidget(node, "value", project.height);
      if ((lowerTitle.includes("frame") || lowerTitle.includes("fps")) && project.fps > 0) setUiWidget(node, "value", project.fps);
      if (lowerTitle.includes("duration") && project.duration > 0) setUiWidget(node, "value", project.duration);
    }

    if (type === "Power Lora Loader (rgthree)") {
      const slots = node.widgets_values.filter((value: any) => value && typeof value === "object" && !value.type);
      slots.forEach((slot: any) => {
        const config = loraConfigs.find((item: any) => item.name === slot.lora);
        if (config) {
          slot.on = config.enabled !== false;
          slot.strength = config.strength;
        } else if (slot.lora) {
          slot.on = false;
        }
      });
      loraConfigs.filter((item: any) => item.name).forEach((config: any) => {
        if (slots.some((slot: any) => slot.lora === config.name)) return;
        const index = node.widgets_values.findIndex((value: any) => !value || (typeof value === "object" && !value.type && !value.lora));
        if (index >= 0) node.widgets_values[index] = { lora: config.name, strength: config.strength, strengthTwo: config.strength, on: config.enabled !== false };
      });
    }
  });
  return workflow;
}

function uiWorkflowToApi(workflow: any): any {
  const linkMap = new Map<number, any[]>();
  (workflow.links || []).forEach((link: any[]) => linkMap.set(link[0], link));
  const result: Record<string, any> = {};
  (workflow.nodes || []).forEach((node: any) => {
    if (!node?.type || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.type)) return;
    const inputs: Record<string, any> = {};
    (node.inputs || []).forEach((input: any) => {
      if (!input.name) return;
      if (input.widget) {
        const value = getUiWidget(node, input.name);
        if (value !== undefined && !(value && typeof value === "object")) inputs[input.name] = value;
      } else if (input.link != null) {
        const link = linkMap.get(input.link);
        if (link) inputs[input.name] = [String(link[1]), link[2] || 0];
      }
    });
    if (node.type === "Power Lora Loader (rgthree)") {
      (node.widgets_values || []).forEach((value: any, index: number) => {
        if (value && typeof value === "object" && !value.type) inputs[`lora_${index + 1}`] = value;
      });
    }
    result[String(node.id)] = { inputs, class_type: node.type, _meta: { title: node.title || node.type } };
  });
  return result;
}

export class ComfyService {
  private clientId: string;
  private ws: WebSocket | null = null;

  constructor() {
    this.clientId = Math.random().toString(36).substring(2, 15);
  }

  toApiPrompt(workflow: any): any {
    return isUiWorkflow(workflow) ? uiWorkflowToApi(workflow) : workflow;
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
          if (msg.type === 'progress') {
            onProgress({ value: msg.data.value, max: msg.data.max, node: msg.data.node }, msg.data?.prompt_id);
          } else if (msg.type === 'executed') {
            if (msg.data.output && msg.data.output.images) {
              const comfyUrl = getComfyUrl();
              const images = msg.data.output.images.map((img: any) => 
                `${comfyUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`
              );
              onComplete(images, msg.data?.prompt_id);
            } else {
            }
          } else if (msg.type === 'execution_error') {
            console.error("[ComfyWS] execution_error:", msg.data?.exception_message);
            onError(msg.data.exception_message || "Execution error in ComfyUI", msg.data?.prompt_id);
          } else if (msg.type === 'execution_success') {
            } else if (msg.type === 'executing') {
            } else if (msg.type === 'execution_cached') {
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
      return await invoke<boolean>('interrupt_comfy', { url: comfyUrl || null });
    } catch (e: any) {
      console.error(`Failed to interrupt ComfyUI execution: ${e.message || e}`);
      return false;
    }
  }

  /**
   * 拉取 ComfyUI 节点信息（用于解析 checkpoints/loras 列表）。
   *
   * 优化：从全量 /object_info（4MB+, 装了很多自定义节点的 ComfyUI 实测 50+ 秒）
   * 改为只拉模型相关节点（每个约 1-4KB, 2-3 秒）。
   * 请求顺序：UNETLoader + CheckpointLoaderSimple + LoraLoader + Power Lora Loader (rgthree)
   * 任一节点失败不阻塞其他节点（容错）。
   */
  async fetchObjectInfo() {
    const t0 = performance.now();
    const comfyUrl = getComfyUrl();
    const NODES = [
      'UNETLoader',
      'CheckpointLoaderSimple',
      'CheckpointLoader',
      'LoraLoader',
      'Power Lora Loader (rgthree)',
    ];

    const result: any = {};
    const failures: string[] = [];

    for (const node of NODES) {
      const url = `${comfyUrl}/object_info/${encodeURIComponent(node)}`;
      const tNode = performance.now();
      try {
        const abortController = new AbortController();
        // 单节点接口本身很快（~2s），给 15s 兜底足够
        const timeoutId = setTimeout(() => abortController.abort(), 15000);
        const resp = await fetch(url, {
          method: 'GET',
          signal: abortController.signal,
        });
        clearTimeout(timeoutId);
        const elapsed = Math.round(performance.now() - tNode);
        if (!resp.ok) {
          console.warn(`[ComfyHTTP] /object_info/${node} HTTP ${resp.status} after ${elapsed}ms`);
          appLog.warn('ComfyHTTP', `/object_info/${node} HTTP ${resp.status} after ${elapsed}ms`);
          failures.push(`${node}(HTTP ${resp.status})`);
          continue;
        }
        const text = await resp.text();
        try {
          const json = JSON.parse(text);
          // ComfyUI 单节点接口返回 { NodeName: { ... } } 结构
          if (json && json[node]) {
            result[node] = json[node];
          }
        } catch (parseErr) {
          console.warn(`[ComfyHTTP] /object_info/${node} returned non-JSON body: ${text.substring(0, 200)}`);
          appLog.warn('ComfyHTTP', `/object_info/${node} non-JSON response`);
          failures.push(`${node}(PARSE_ERR)`);
          continue;
        }
        console.info(
          `[ComfyHTTP] /object_info/${node} 200 OK ${elapsed}ms size=${text.length}B`
        );
      } catch (e: any) {
        const elapsed = Math.round(performance.now() - tNode);
        const reason = e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || String(e));
        console.warn(`[ComfyHTTP] /object_info/${node} FAILED after ${elapsed}ms: ${reason}`);
        appLog.error('ComfyHTTP', `/object_info/${node} FAILED after ${elapsed}ms: ${reason}`);
        failures.push(`${node}(${reason})`);
      }
    }

    const totalMs = Math.round(performance.now() - t0);
    const keyCount = Object.keys(result).length;
    console.info(
      `[ComfyHTTP] fetchObjectInfo done in ${totalMs}ms, got ${keyCount}/${NODES.length} nodes` +
      (failures.length > 0 ? `, failed: ${failures.join(', ')}` : '')
    );
    return result;
  }

  async uploadImage(file: File | Blob, filename: string): Promise<string> {
    try {
      const comfyUrl = getVideoComfyUrl();
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const resultName = await invoke<string>("upload_image_to_comfy", {
        comfyUrl,
        imageData: Array.from(uint8Array),
        filename
      });

      return resultName;
    } catch (e: any) {
      throw new Error(`Failed to upload image: ${e.message || e}`);
    }
  }

  injectVideoParameters(
    workflow: any,
    imageFilename: string,
    prompt: string,
    fps: number,
    duration: number,
    width: number,
    height: number,
    baseModel?: string
  ) {
    const finalJson = JSON.parse(JSON.stringify(workflow));

    if (isUiWorkflow(finalJson)) {
      return injectUiWorkflow(finalJson, {
        imageFilename,
        positivePrompt: prompt,
        fps,
        duration,
        width,
        height,
        baseModel,
      });
    }

    for (const key in finalJson) {
      const node = finalJson[key];
         if (!node?.inputs || typeof node.class_type !== "string") continue;

      const classType = node.class_type;
      const title = node._meta?.title || '';

      if (classType === "LoadImage" && node.inputs.image !== undefined) {
        node.inputs.image = imageFilename;
      }
      
      if (classType === "Simple String" && title === "Simple String" && node.inputs.string !== undefined && prompt) {
        node.inputs.string = prompt;
      }

      if (classType === "PrimitiveInt" && node.inputs.value !== undefined) {
        if (!Array.isArray(node.inputs.value)) {
          if (title === "Width") node.inputs.value = width;
          if (title === "Height") node.inputs.value = height;
          if (title === "Frame Rate") node.inputs.value = fps;
          if (title === "Duration") node.inputs.value = duration;
        }
      }

      if (["EmptyLatentVideo", "EmptyLTXVLatentVideo", "EmptyLatentImage"].includes(classType)) {
        if (node.inputs.width !== undefined && !Array.isArray(node.inputs.width)) {
          node.inputs.width = width;
        }
        if (node.inputs.height !== undefined && !Array.isArray(node.inputs.height)) {
          node.inputs.height = height;
        }
        if (node.inputs.length !== undefined && !Array.isArray(node.inputs.length)) {
          node.inputs.length = duration;
        }
        if (classType === "EmptyLatentVideo" && node.inputs.batch_size !== undefined && !Array.isArray(node.inputs.batch_size)) {
          node.inputs.batch_size = duration;
        }
      }

      if (["UNETLoader", "CheckpointLoaderSimple", "ImageOnlyCheckpointLoader"].includes(classType)) {
        if (baseModel && baseModel.trim() !== '') {
          if (node.inputs.unet_name !== undefined) node.inputs.unet_name = baseModel;
          if (node.inputs.ckpt_name !== undefined) node.inputs.ckpt_name = baseModel;
        }
      }
    }

    return finalJson;
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
      const raw = JSON.parse(workflowStr);

      // 归一化：UI 格式（nodes 数组）→ 统一用 type + widgets_values 提取
      // API 格式（扁平对象）→ 用 class_type + inputs 提取
      const isUiFormat = Array.isArray(raw.nodes);

      // 辅助：从 UI 格式节点的 widgets_values 里按 object_info 的 input 顺序提取字段值
      // 返回 { fieldName: value } 映射
      const extractWidgetValues = (node: any): Record<string, any> => {
        const wv = node.widgets_values;
        if (!Array.isArray(wv)) return {};
        // UI 格式的 widgets_values 是按 widget 定义顺序排列的数组
        // 我们不知道精确的字段名，但可以通过 object_info 推断
        // 这里用一个简单策略：把非对象值按顺序映射到 _w0, _w1...
        // 对象值（如 lora slot）单独处理
        const result: Record<string, any> = {};
        wv.forEach((v, i) => {
          if (v !== null && typeof v === "object") {
            // lora slot 或 header，保留原始对象
            result[`_obj_${i}`] = v;
          } else {
            result[`_w${i}`] = v;
          }
        });
        return result;
      };

      // 收集所有节点，统一为 { classType, title, inputs, widgets } 结构
      const nodes: Array<{ classType: string; title: string; inputs: Record<string, any>; widgetObjs: any[] }> = [];

      if (isUiFormat) {
        forEachUiNode(raw, (n) => {
          const classType = n.type || "";
          const wv = n.widgets_values || [];
          // 收集 widgets_values 里的对象（lora slots 等）
          const widgetObjs = wv.filter((v: any) => v !== null && typeof v === "object");
          const inputs: Record<string, any> = {};
          if (Array.isArray(n.inputs)) {
            n.inputs.forEach((inp: any) => {
              if (!inp.name) return;
              if (inp.widget) inputs[inp.name] = getUiWidget(n, inp.name);
              else if (inp.link != null) inputs[inp.name] = inp.link;
            });
          }
          nodes.push({ classType, title: n.title || classType, inputs, widgetObjs });
        });
      } else {
        // API 格式
        for (const key in raw) {
          const node = raw[key];
          if (!node || !node.class_type) continue;
          nodes.push({
            classType: node.class_type,
            title: node._meta?.title || node.class_type,
            inputs: node.inputs || {},
            widgetObjs: [],
          });
        }
      }

      for (const node of nodes) {
        const ct = node.classType;
        const inp = node.inputs;

        // SDXLEmptyLatentSizePicker+
        if (ct === "SDXLEmptyLatentSizePicker+") {
          result.hasSizePicker = true;
          if (inp.resolution) result.width = parseInt(String(inp.resolution).split("x")[0]) || result.width;
          if (inp.resolution) result.height = parseInt(String(inp.resolution).split("x")[1]) || result.height;
          // API 格式
          if (typeof inp.resolution === "string") {
            const m = inp.resolution.match(/(\d+)\s*x\s*(\d+)/);
            if (m) { result.width = parseInt(m[1]); result.height = parseInt(m[2]); }
          }
        }

        // Models
        if (ct === "UNETLoader" || ct === "CheckpointLoaderSimple" || ct === "CheckpointLoader") {
          // API 格式
          const modelVal = inp.unet_name || inp.ckpt_name;
          if (modelVal && typeof modelVal === "string") result.baseModel = modelVal;
        }
        if (ct === "VAELoader") {
          if (inp.vae_name && typeof inp.vae_name === "string") result.vaeModel = inp.vae_name;
        }

        // KSampler
        if (ct.includes("KSampler")) {
          // API 格式
          if (inp.sampler_name) result.samplerName = inp.sampler_name;
          if (inp.scheduler) result.scheduler = inp.scheduler;
          if (typeof inp.steps === "number") result.steps = inp.steps;
          if (typeof inp.cfg === "number") result.cfgScale = inp.cfg;
          if (!result.samplerName && inp.sampler_name) result.samplerName = inp.sampler_name;
          if (!result.scheduler && inp.scheduler) result.scheduler = inp.scheduler;
          if (!result.steps && inp.steps !== undefined) result.steps = parseInt(inp.steps);
          if (!result.cfgScale && inp.cfg !== undefined) result.cfgScale = parseFloat(inp.cfg);
        }

        // Resolution (非 SizePicker 的 EmptyLatent 等)
        if (ct.includes("EmptyLatent") || (ct.includes("Latent") && !ct.includes("SizePicker"))) {
          if (typeof inp.empty_latent_width === "number") result.width = inp.empty_latent_width;
          else if (typeof inp.width === "number") result.width = inp.width;
          if (typeof inp.empty_latent_height === "number") result.height = inp.empty_latent_height;
          else if (typeof inp.height === "number") result.height = inp.height;
        }

        // Power Lora Loader (rgthree) — UI 格式的 lora 数据在 widgets_values 的对象里
        if (ct === "Power Lora Loader (rgthree)") {
          // API 格式: lora_1, lora_2... 在 inputs 里
          for (const key of Object.keys(inp)) {
            if (key.startsWith("lora_")) {
              const slot = inp[key];
              if (slot && slot.lora && slot.lora !== "None") {
                result.loras.push({
                  name: slot.lora,
                  strength: typeof slot.strength === "number" ? slot.strength : 1.0,
                  enabled: typeof slot.on === "boolean" ? slot.on : true,
                });
              }
            }
          }
          // UI 格式: lora 数据在 widgetObjs 里 ({on, lora, strength, strengthTwo})
          for (const obj of node.widgetObjs) {
            if (obj.type === "PowerLoraLoaderHeaderWidget") continue;
            if (obj.lora && obj.lora !== "None") {
              result.loras.push({
                name: obj.lora,
                strength: typeof obj.strength === "number" ? obj.strength : 1.0,
                enabled: typeof obj.on === "boolean" ? obj.on : true,
              });
            }
          }
        }

        // General LoraLoader / LoraLoaderModelOnly
        if (ct === "LoraLoader" || ct === "LoraLoaderModelOnly") {
          // API 格式
          if (inp.lora_name && typeof inp.lora_name === "string") {
            const str = typeof inp.strength_model === "number" ? inp.strength_model : 1.0;
            result.loras.push({ name: inp.lora_name, strength: str, enabled: str !== 0 });
          }
          if (inp.lora_name && typeof inp.lora_name === "string" && inp.lora_name.endsWith(".safetensors")) {
            const str = typeof inp.strength_model === "number" ? inp.strength_model : 1.0;
            result.loras.push({ name: inp.lora_name, strength: str, enabled: str !== 0 });
          }
        }

        if (ct === "PrimitiveInt" && inp.value !== undefined) {
          const lowerTitle = node.title.toLowerCase();
          const value = Number(inp.value);
          if (lowerTitle.includes("width") && Number.isFinite(value)) result.width = value;
          if (lowerTitle.includes("height") && Number.isFinite(value)) result.height = value;
        }
      }
    } catch (e) {
      console.error("Failed to analyze workflow:", e);
    }
    return result;
  }

  private cachedObjectInfo: any = null;

  async getObjectInfo() {
    // Don't cache empty results — if the first fetch fails (e.g. ComfyUI not yet
    // connected at app startup), we want subsequent calls to retry so injection
    // can pick up the real node schema later.
    if (this.cachedObjectInfo && Object.keys(this.cachedObjectInfo).length > 0) {
      return this.cachedObjectInfo;
    }
    const result = await this.fetchObjectInfo();
    if (result && Object.keys(result).length > 0) {
      this.cachedObjectInfo = result;
    }
    return result;
  }

  // Inject user PromptProject parameters into a raw ComfyUI JSON workflow
  async injectParameters(workflowStr: string, project: any): Promise<any> {
    // Use cached objectInfo only — never block on a fetch to ComfyUI.
    // getObjectInfo is only needed for SDXLEmptyLatentSizePicker+ resolution fallback,
    // which is a nice-to-have. If ComfyUI is offline, we just skip it.
    let objectInfo: any = this.cachedObjectInfo || null;
    
    try {
      const workflow = JSON.parse(workflowStr);

      if (isUiWorkflow(workflow)) {
        return injectUiWorkflow(workflow, project);
      }

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
        if (!node?.inputs || typeof node.class_type !== "string") continue;

        // 1. KSampler / KSamplerAdvanced
        if (node.class_type.includes("KSampler")) {
          // Guard against empty strings too — they would clobber the workflow's good values.
          if (project.steps !== undefined && project.steps !== null && Number(project.steps) > 0 && node.inputs.steps !== undefined) node.inputs.steps = project.steps;
          if (project.cfgScale !== undefined && project.cfgScale !== null && Number(project.cfgScale) > 0 && node.inputs.cfg !== undefined) node.inputs.cfg = project.cfgScale;
          if (project.sampler && project.sampler.trim() !== '' && node.inputs.sampler_name !== undefined) node.inputs.sampler_name = project.sampler;
          if (project.scheduler && project.scheduler.trim() !== '' && node.inputs.scheduler !== undefined) node.inputs.scheduler = project.scheduler;
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
          if (project.baseModel && project.baseModel.trim() !== '') {
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
          if (project.resolution !== undefined && project.resolution !== null) {
            node.inputs.resolution = project.resolution;
            const m = project.resolution.match(/(\d+)\s*[x×]\s*(\d+)/);
            if (m) {
              const w = parseInt(m[1]);
              const h = parseInt(m[2]);
              if (node.inputs.empty_latent_width !== undefined) node.inputs.empty_latent_width = w;
              if (node.inputs.width_override !== undefined) node.inputs.width_override = w;
              if (node.inputs.empty_latent_height !== undefined) node.inputs.empty_latent_height = h;
              if (node.inputs.height_override !== undefined) node.inputs.height_override = h;
            }
          } else if (project.width !== undefined && project.height !== undefined && project.width > 0 && project.height > 0) {
            // Try to find the valid "custom" option from the node's actual schema.
            // The exact string varies across versions of the custom node (e.g. "custom", "Custom", "custom ⚠️").
            // We must NEVER write a hardcoded fallback that is not in the valid list, or ComfyUI will reject
            // the prompt with "Value not in list" and silently drop the output.
            let customStr: string | null = null;
            if (objectInfo && objectInfo["SDXLEmptyLatentSizePicker+"]?.input?.required?.resolution?.[0]) {
              const resList: string[] = objectInfo["SDXLEmptyLatentSizePicker+"].input.required.resolution[0];
              if (Array.isArray(resList)) {
                // Prefer any option literally containing "custom" (case-insensitive)
                const found = resList.find((r: string) => typeof r === 'string' && r.toLowerCase().includes("custom"));
                if (found) {
                  customStr = found;
                } else {
                  // If there is no "custom" option, the node likely does not support
                  // arbitrary sizes via resolution + width/height override.
                  // Fallback: pick a standard resolution from the list closest to the
                  // project's aspect ratio. This is still a valid value so ComfyUI won't reject it.
                  const targetAspect = project.width / project.height;
                  let best = resList[0];
                  let bestDiff = Infinity;
                  for (const r of resList) {
                    // Parse "1024x1024" or "1024 x 1024" style strings
                    const m = r.match(/(\d+)\s*[x×]\s*(\d+)/);
                    if (m) {
                      const w = parseInt(m[1]);
                      const h = parseInt(m[2]);
                      if (w > 0 && h > 0) {
                        const diff = Math.abs((w / h) - targetAspect);
                        if (diff < bestDiff) {
                          bestDiff = diff;
                          best = r;
                        }
                      }
                    }
                  }
                  customStr = best;
                }
              }
            }

            if (customStr) {
              node.inputs.resolution = customStr;
            }
            // Always set width/height overrides — these are what actually determine
            // the latent dimensions when resolution is "custom" or compatible.
            if (node.inputs.empty_latent_width !== undefined) node.inputs.empty_latent_width = project.width;
            if (node.inputs.width_override !== undefined) node.inputs.width_override = project.width;
            if (node.inputs.empty_latent_height !== undefined) node.inputs.empty_latent_height = project.height;
            if (node.inputs.height_override !== undefined) node.inputs.height_override = project.height;
          }
        } else if (node.class_type.includes("EmptyLatent") || node.class_type.includes("SizePicker") || node.class_type.includes("Latent")) {
          if (project.width !== undefined && node.inputs.width !== undefined) node.inputs.width = project.width;
          if (project.height !== undefined && node.inputs.height !== undefined) node.inputs.height = project.height;
          if (project.width !== undefined && node.inputs.width_override !== undefined) node.inputs.width_override = project.width;
          if (project.height !== undefined && node.inputs.height_override !== undefined) node.inputs.height_override = project.height;
        }

        // Generic Primitive overrides for custom generic workflows
        if ((node.class_type === "PrimitiveInt" || node.class_type === "PrimitiveNode") && node.inputs.value !== undefined) {
          if (!Array.isArray(node.inputs.value)) {
            const title = (node._meta?.title || "").toLowerCase();
            if (title.includes("width") && project.width !== undefined) node.inputs.value = project.width;
            if (title.includes("height") && project.height !== undefined) node.inputs.value = project.height;
          }
        }

        // 6. Power Lora Loader (rgthree)
        if (node.class_type === "Power Lora Loader (rgthree)") {
          if (loraConfigs && Array.isArray(loraConfigs)) {
            let configQueue = [...loraConfigs];
            
            // First pass: update existing slots or clear deleted ones
            let maxSlotIdx = 0;
            for (const key of Object.keys(node.inputs)) {
              if (key.startsWith("lora_")) {
                const num = parseInt(key.replace("lora_", ""));
                if (!isNaN(num) && num > maxSlotIdx) {
                  maxSlotIdx = num;
                }
              }
            }
            
            for (let i = 1; i <= maxSlotIdx; i++) {
              const slotKey = `lora_${i}`;
              const slot = node.inputs[slotKey];
              if (slot && slot.lora && slot.lora !== "None") {
                const configIdx = configQueue.findIndex((lc: any) => lc.name === slot.lora);
                if (configIdx !== -1) {
                  const config = configQueue[configIdx];
                  slot.on = config.enabled;
                  slot.strength = config.strength;
                  configQueue.splice(configIdx, 1);
                } else {
                  slot.lora = "None";
                  slot.on = false;
                }
              }
            }

            // Second pass: insert newly added LoRAs into empty slots
            let nextSlotIdx = 1;
            while (configQueue.length > 0) {
              const slotKey = `lora_${nextSlotIdx}`;
              let slot = node.inputs[slotKey];
              if (!slot || !slot.lora || slot.lora === "None") {
                const config = configQueue.shift();
                if (config) {
                  node.inputs[slotKey] = {
                    lora: config.name,
                    strength: config.strength,
                    on: config.enabled
                  };
                }
              }
              nextSlotIdx++;
            }
          }
        }

        // 7. General LoraLoader
        if (node.class_type === "LoraLoader") {
          if (node.inputs.lora_name) {
            const config = loraConfigs ? (Array.isArray(loraConfigs) ? loraConfigs.find((lc: any) => lc.name === node.inputs.lora_name) : null) : null;
            if (config) {
              const str = config.enabled ? config.strength : 0;
              if (node.inputs.strength_model !== undefined) node.inputs.strength_model = str;
              if (node.inputs.strength_clip !== undefined) node.inputs.strength_clip = str;
            } else if (Array.isArray(loraConfigs)) {
              // If we have an array of LoRAs and this one is NOT in it, user deleted it — disable.
              if (node.inputs.strength_model !== undefined) node.inputs.strength_model = 0;
              if (node.inputs.strength_clip !== undefined) node.inputs.strength_clip = 0;
            }
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

