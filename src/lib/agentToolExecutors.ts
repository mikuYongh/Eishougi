/**
 * Shared tool execution logic for the AI agent.
 *
 * This module contains the `executeTool` function that dispatches tool calls to their
 * Tauri command / store implementations. It is shared between the original hand-rolled
 * agent loop (`useAgent.ts` on master) and the Vercel AI SDK experiment
 * (`useAgent.ts` on agent-sdk-experiment), so tool behavior stays identical.
 */

import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore';
import { usePromptStore } from '../stores/promptStore';
import { useQueueStore } from '../stores/queueStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { useFavoriteLibraryStore } from '../stores/favoriteLibraryStore';
import { useModelStore } from '../stores/modelStore';
import { comfyService } from '../services/comfyService';
import type { ChatMessage } from '../agent/types';

export interface ToolResult {
  /** The serialised result string to feed back to the LLM. */
  resultStr: string;
  /** Extracted image paths (if the tool produced images/videos) for UI display. */
  images?: string[];
  /** Optional assistant-side status message to inject into the chat (e.g. video progress). */
  statusMessage?: ChatMessage;
}

/**
 * Execute a single tool call by name + parsed arguments.
 *
 * Returns `{ resultStr, images }`. The `resultStr` is always valid JSON.
 * On error, returns `{ error: "..." }` JSON so the LLM can react.
 */
export async function executeTool(
  fnName: string,
  parsedArgs: any,
  context: {
    /** All messages in the current conversation (for extracting past images, user JSON, etc.) */
    currentMessages: ChatMessage[];
    /** MCP tools (from external MCP servers), for dispatching unknown tool names. */
    mcpTools: any[];
    /** Callback to add a message to the store (used by video generation status). */
    addMessage: (msg: ChatMessage) => void;
  },
): Promise<ToolResult> {
  const { currentMessages, mcpTools, addMessage } = context;
  let res: any = undefined;
  let resultStr = "";

  try {
    if (fnName === 'create_prompt') {
      const workflows = useWorkflowStore.getState().workflows;
      const defaultWf = workflows.find(w => w.type === 'text2img' && w.isDefault);
      const resolvedWorkflowId: string | null =
        parsedArgs.workflow_id || (defaultWf ? defaultWf.id : null) || null;

      let workflowParsedBaseModel: string | null = null;
      let workflowParsedVaeModel: string | null = null;
      let workflowParsedSampler: string | null = null;
      let workflowParsedScheduler: string | null = null;
      let workflowParsedWidth: number | null = null;
      let workflowParsedHeight: number | null = null;
      let workflowParsedSteps: number | null = null;
      let workflowParsedCfg: number | null = null;
      let workflowParsedLoras: any[] = [];
      if (resolvedWorkflowId) {
        const wf = workflows.find(w => w.id === resolvedWorkflowId);
        if (wf && wf.jsonContent) {
          try {
            const analysis = comfyService.analyzeWorkflow(wf.jsonContent);
            workflowParsedBaseModel = analysis.baseModel || null;
            workflowParsedVaeModel = analysis.vaeModel || null;
            workflowParsedSampler = analysis.samplerName || null;
            workflowParsedScheduler = analysis.scheduler || null;
            workflowParsedWidth = analysis.width || null;
            workflowParsedHeight = analysis.height || null;
            workflowParsedSteps = analysis.steps || null;
            workflowParsedCfg = analysis.cfgScale || null;
            workflowParsedLoras = analysis.loras || [];
          } catch (e) {
            console.warn("[Agent] create_prompt: failed to parse workflow JSON:", e);
          }
        }
      }

      const localCheckpoints = useModelStore.getState().checkpoints || [];
      // 优先级：LLM 显式传的参数（= 用户意图）> 工作流默认值 > 本地列表第一个 > 空
      // 之前工作流解析值优先级最高，导致用户切换基础模型后被工作流自带的旧模型覆盖
      let resolvedBaseModel: string;
      if (parsedArgs.base_model) {
        resolvedBaseModel = parsedArgs.base_model;
      } else if (workflowParsedBaseModel) {
        resolvedBaseModel = workflowParsedBaseModel;
      } else if (localCheckpoints.length > 0) {
        resolvedBaseModel = localCheckpoints[0];
      } else {
        resolvedBaseModel = "";
      }

      const resolvedWidth = parsedArgs.width ?? workflowParsedWidth ?? 1024;
      const resolvedHeight = parsedArgs.height ?? workflowParsedHeight ?? 1024;
      const resolvedSteps = parsedArgs.steps ?? workflowParsedSteps ?? 25;
      const resolvedCfg = parsedArgs.cfg_scale ?? workflowParsedCfg ?? 5.0;
      const resolvedSampler = parsedArgs.sampler_name ?? workflowParsedSampler ?? "euler";
      const resolvedScheduler = parsedArgs.scheduler ?? workflowParsedScheduler ?? "normal";
      const resolvedVae = parsedArgs.vae_model ?? workflowParsedVaeModel ?? "auto";

      const resolvedLoraConfigs: string | null = workflowParsedLoras.length > 0
        ? JSON.stringify(workflowParsedLoras)
        : (Array.isArray(parsedArgs.lora_configs) ? JSON.stringify(parsedArgs.lora_configs) : null);

      // LLM 偶尔把 tags 传成 JSON 字符串而非数组，做容错
      let rawTags: any[] = parsedArgs.tags;
      if (typeof rawTags === "string") {
        try { rawTags = JSON.parse(rawTags); } catch { rawTags = []; }
      }
      if (!Array.isArray(rawTags)) rawTags = [];

      const newPrompt = {
        id: "p_" + Date.now().toString(),
        title: parsedArgs.title || parsedArgs.tags?.[0] || "Agent Generated",
        description: "Generated by AI Agent",
        positivePrompt: parsedArgs.content,
        negativePrompt: parsedArgs.negative_prompt || "",
        artistPrompt: parsedArgs.artist_prompt || "",
        promptSyntax: parsedArgs.prompt_syntax || "danbooru",
        width: resolvedWidth,
        height: resolvedHeight,
        steps: resolvedSteps,
        cfgScale: resolvedCfg,
        seed: parsedArgs.seed || "-1",
        samplerName: resolvedSampler,
        scheduler: resolvedScheduler,
        baseModel: resolvedBaseModel,
        vaeModel: resolvedVae,
        workflowId: resolvedWorkflowId,
        loraConfigs: resolvedLoraConfigs,
        tags: rawTags.map((t: string, i: number) => ({
          id: "tag_" + Date.now() + i,
          name: t,
          color: "#ff6b9d",
          createdAt: Date.now()
        })),
        isFavorite: false,
        isPinned: false,
        instanceImages: parsedArgs.instance_images || [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await invoke('create_prompt', { prompt: newPrompt });
      usePromptStore.getState().fetchPrompts();
      res = { status: "success", prompt_id: newPrompt.id };

    } else if (fnName === 'update_prompt_content') {
      const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
      if (!currentPrompt) throw new Error(`Prompt with ID ${parsedArgs.prompt_id} not found.`);
      const updatedPrompt = {
        ...currentPrompt,
        title: parsedArgs.title !== undefined ? parsedArgs.title : currentPrompt.title,
        positivePrompt: parsedArgs.positive_prompt !== undefined ? parsedArgs.positive_prompt : currentPrompt.positivePrompt,
        negativePrompt: parsedArgs.negative_prompt !== undefined ? parsedArgs.negative_prompt : currentPrompt.negativePrompt,
        artistPrompt: parsedArgs.artist_prompt !== undefined ? parsedArgs.artist_prompt : currentPrompt.artistPrompt,
        tags: parsedArgs.tags !== undefined ? parsedArgs.tags.map((t: string, i: number) => ({
          id: "tag_" + Date.now() + i, name: t, color: "#ff6b9d", createdAt: Date.now()
        })) : currentPrompt.tags,
        updatedAt: Date.now()
      };
      await invoke('update_prompt', { prompt: updatedPrompt });
      usePromptStore.getState().fetchPrompts();
      res = { status: "success", message: `Prompt content ${parsedArgs.prompt_id} updated.` };

    } else if (fnName === 'update_prompt_settings') {
      const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
      if (!currentPrompt) throw new Error(`Prompt with ID ${parsedArgs.prompt_id} not found.`);
      const updatedPrompt = { ...currentPrompt };
      if (parsedArgs.base_model !== undefined) {
        const checkpoints = useModelStore.getState().checkpoints || [];
        if (checkpoints.length > 0 && !checkpoints.includes(parsedArgs.base_model)) {
          throw new Error(`Invalid base_model: '${parsedArgs.base_model}'. It is not in the available model list. Use list_local_models to check available models.`);
        }
        updatedPrompt.baseModel = parsedArgs.base_model;
      }
      if (parsedArgs.vae_model !== undefined) updatedPrompt.vaeModel = parsedArgs.vae_model;
      if (parsedArgs.lora_configs !== undefined) updatedPrompt.loraConfigs = parsedArgs.lora_configs ? JSON.stringify(parsedArgs.lora_configs) : null;
      if (parsedArgs.width !== undefined) updatedPrompt.width = parsedArgs.width;
      if (parsedArgs.height !== undefined) updatedPrompt.height = parsedArgs.height;
      if (parsedArgs.steps !== undefined) updatedPrompt.steps = parsedArgs.steps;
      if (parsedArgs.cfg_scale !== undefined) updatedPrompt.cfgScale = parsedArgs.cfg_scale;
      if (parsedArgs.seed !== undefined) updatedPrompt.seed = parsedArgs.seed;
      if (parsedArgs.sampler_name !== undefined) { updatedPrompt.samplerName = parsedArgs.sampler_name; updatedPrompt.sampler = parsedArgs.sampler_name; }
      if (parsedArgs.scheduler !== undefined) updatedPrompt.scheduler = parsedArgs.scheduler;
      if (parsedArgs.workflow_id !== undefined) updatedPrompt.workflowId = parsedArgs.workflow_id;
      updatedPrompt.updatedAt = Date.now();
      await invoke('update_prompt', { prompt: updatedPrompt });
      usePromptStore.getState().fetchPrompts();
      res = { status: "success", message: `Prompt settings ${parsedArgs.prompt_id} updated.` };

    } else if (fnName === 'delete_prompt') {
      await invoke('delete_prompt', { id: parsedArgs.prompt_id });
      usePromptStore.getState().fetchPrompts();
      res = { status: "success", message: `Prompt ${parsedArgs.prompt_id} deleted.` };

    } else if (fnName === 'search_prompts') {
      await usePromptStore.getState().fetchPrompts();
      const prompts = usePromptStore.getState().prompts;
      res = prompts.filter(p => {
        if (!parsedArgs.tags || parsedArgs.tags.length === 0) return true;
        return parsedArgs.tags.every((t: string) => {
          const searchStr = t.toLowerCase();
          return (
            p.tags?.some(tag => tag.toLowerCase() === searchStr) ||
            p.title?.toLowerCase().includes(searchStr) ||
            p.description?.toLowerCase().includes(searchStr)
          );
        });
      }).slice(0, parsedArgs.limit || 5);

    } else if (fnName === 'get_prompt') {
      res = await invoke('get_prompt', { id: parsedArgs.prompt_id });

    } else if (fnName === 'generate_image') {
      const rawProject = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
      if (!rawProject) throw new Error(`Prompt ID ${parsedArgs.prompt_id} not found`);
      const project = {
        ...rawProject,
        sampler: rawProject.sampler ?? rawProject.samplerName ?? '',
      };
      Object.assign(project, {
        ...(parsedArgs.positive_prompt != null ? { positivePrompt: parsedArgs.positive_prompt } : {}),
        ...(parsedArgs.negative_prompt != null ? { negativePrompt: parsedArgs.negative_prompt } : {}),
        ...(parsedArgs.artist_prompt != null ? { artistPrompt: parsedArgs.artist_prompt } : {}),
        ...(parsedArgs.base_model != null ? { baseModel: parsedArgs.base_model } : {}),
        ...(parsedArgs.vae_model != null ? { vaeModel: parsedArgs.vae_model } : {}),
        ...(Array.isArray(parsedArgs.lora_configs) ? { loraConfigs: parsedArgs.lora_configs } : {}),
        ...(parsedArgs.width != null ? { width: Number(parsedArgs.width) } : {}),
        ...(parsedArgs.height != null ? { height: Number(parsedArgs.height) } : {}),
        ...(parsedArgs.steps != null ? { steps: Number(parsedArgs.steps) } : {}),
        ...(parsedArgs.cfg_scale != null ? { cfgScale: Number(parsedArgs.cfg_scale) } : {}),
        ...(parsedArgs.seed != null ? { seed: String(parsedArgs.seed) } : {}),
        ...(parsedArgs.sampler_name != null ? { sampler: parsedArgs.sampler_name } : {}),
        ...(parsedArgs.scheduler != null ? { scheduler: parsedArgs.scheduler } : {}),
        ...(parsedArgs.workflow_id != null ? { workflowId: parsedArgs.workflow_id } : {}),
      });
      let wfId = project.workflowId;
      if (!wfId) {
        const workflows = useWorkflowStore.getState().workflows;
        const defaultWf = workflows.find((w: any) => w.type === 'text2img' && w.isDefault)
          || workflows.find((w: any) => w.type === 'text2img');
        if (defaultWf) wfId = defaultWf.id;
      }
      if (!wfId) throw new Error('未找到 text2img 工作流，请先在工作流管理中导入');
      const batchCount = parsedArgs.batch_count || 1;
      const results = await useQueueStore.getState().addJob(project, wfId, batchCount);
      const allImages = results ? results.flat() : [];
      res = { status: "completed", images: allImages, prompt_id: parsedArgs.prompt_id, message: `Successfully generated ${allImages.length} image(s).` };

    } else if (fnName === 'generate_video_from_image') {
      const prompt = typeof parsedArgs.prompt === 'string' ? parsedArgs.prompt : '';
      if (!prompt) throw new Error("prompt is required for video generation");
      const fps = typeof parsedArgs.fps === 'number' ? parsedArgs.fps : 25;
      const durationSec = typeof parsedArgs.duration === 'number' ? parsedArgs.duration : 5;
      const baseModel = typeof parsedArgs.base_model === 'string' ? parsedArgs.base_model : '';

      const workflows = useWorkflowStore.getState().workflows;
      let img2videoWorkflow = workflows.find((w: any) => w.id === parsedArgs.workflow_id);
      if (!img2videoWorkflow) {
        img2videoWorkflow = workflows.find((w: any) => w.type === 'img2video' && w.isDefault) || workflows.find((w: any) => w.type === 'img2video');
      }
      if (!img2videoWorkflow || !img2videoWorkflow.jsonContent) {
        throw new Error("未找到图生视频工作流，请先在系统中导入一个 img2video 工作流。");
      }

      let imagePath: string | null = null;
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        const msg = currentMessages[i];
        if (msg.images && msg.images.length > 0) {
          imagePath = msg.images[msg.images.length - 1];
          break;
        }
      }
      if (!imagePath) throw new Error("没有找到可用的图片。请先发送一张图片或用 generate_image 生成一张。");

      addMessage({
        id: "sys_" + Date.now(),
        role: "assistant",
        content: `🎬 正在将图片转换为视频...\n\n**提示词**: ${prompt}\n**时长**: ${durationSec} 秒\n**FPS**: ${fps}\n**工作流**: ${img2videoWorkflow.name}`
      });

      let rawB64: string;
      if (imagePath.startsWith('data:')) {
        rawB64 = imagePath;
      } else if (imagePath.startsWith('http')) {
        const resp = await fetch(imagePath);
        const blob = await resp.blob();
        rawB64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.readAsDataURL(blob);
        });
      } else {
        rawB64 = await invoke<string>('read_image_base64', { path: imagePath });
      }
      const imageBase64 = rawB64.includes(',') ? rawB64.split(',')[1] : rawB64;
      const byteChars = atob(imageBase64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let j = 0; j < byteChars.length; j++) byteArr[j] = byteChars.charCodeAt(j);
      const imgBlob = new Blob([byteArr], { type: 'image/png' });
      const uploadName = `upload_agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      const uploadedFilename = await comfyService.uploadImage(imgBlob, uploadName);

      const imgObj = new Image();
      imgObj.src = `data:image/png;base64,${imageBase64}`;
      try {
        await new Promise<void>((resolve, reject) => {
          imgObj.onload = () => resolve();
          imgObj.onerror = () => reject(new Error('image decode failed'));
        });
      } catch { /* fallback */ }
      const imgW = imgObj.naturalWidth || 832;
      const imgH = imgObj.naturalHeight || 1216;

      const tempProject = {
        id: 'video_' + Date.now(),
        title: '图生视频 (Agent)',
        positivePrompt: prompt,
        negativePrompt: '',
        width: imgW, height: imgH,
        seed: Math.floor(Math.random() * 1000000000),
      };
      const generatedVideos = await useQueueStore.getState().addVideoJob(
        tempProject, img2videoWorkflow.id, uploadedFilename, fps, durationSec, imgW, imgH, prompt, baseModel
      );
      res = { status: "completed", videos: generatedVideos, message: `视频生成完成，共 ${generatedVideos.length} 个视频。` };

    } else if (fnName === 'auto_tag_all_prompts') {
      const { aiService } = await import('../services/aiService');
      aiService.batchAutoTagPrompts();
      res = { status: "success", message: "后台批量打标已启动，将自动为所有创作生成标签" };

    } else if (fnName === 'list_local_models') {
      await useModelStore.getState().fetchModels(true, true);
      const { checkpoints, loras } = useModelStore.getState();
      res = { checkpoints, loras };

    } else if (fnName === 'list_character_series') {
      res = await invoke('get_character_series', {
        search: parsedArgs.search || null,
        limit: Math.min(parsedArgs.limit || 30, 100),
        offset: parsedArgs.offset || 0,
      });

    } else if (fnName === 'search_characters_in_series') {
      const series = parsedArgs.series;
      if (!series) throw new Error("series is required");
      res = await invoke('search_characters', {
        search: parsedArgs.search || null, series,
        limit: Math.min(parsedArgs.limit || 20, 50),
        offset: parsedArgs.offset || 0, favorite: null,
      });

    } else if (fnName === 'search_artists') {
      res = await invoke('search_artists', {
        search: parsedArgs.search || null, series: null,
        limit: Math.min(parsedArgs.limit || 20, 50),
        offset: parsedArgs.offset || 0, favorite: null,
      });

    } else if (fnName === 'random_character_and_artist') {
      const char = await invoke<any[]>('search_characters', {
        search: null, series: parsedArgs.series || null,
        limit: 1, offset: 0, favorite: null,
      });
      const artists = await invoke<any[]>('search_artists', {
        search: null, series: null,
        limit: 1, offset: parsedArgs.use_artist === false ? 0 : Math.floor(Math.random() * 100),
        favorite: null,
      });
      res = {
        character: char?.[0] || null,
        artist: parsedArgs.use_artist === false ? null : (artists?.[0] || null),
      };

    } else if (fnName === 'get_queue_status') {
      const state = useQueueStore.getState();
      const activeJobs = state.jobs.filter(j => j.status === 'pending' || j.status === 'generating');
      const recentCompleted = state.jobs
        .filter(j => j.status === 'completed' && j.images && j.images.length > 0)
        .slice(-3)
        .map(j => ({ job_id: j.id, project_title: j.projectTitle, images: j.images }));
      res = {
        status: state.isConnected ? "connected" : "disconnected",
        active_jobs: activeJobs.length,
        total_jobs_in_history: state.jobs.length,
        recent_completed: recentCompleted
      };

    } else if (fnName === 'search_workflows') {
      await useWorkflowStore.getState().fetchWorkflows();
      const workflows = useWorkflowStore.getState().workflows;
      res = workflows.filter(w => {
        if (!parsedArgs.tags || parsedArgs.tags.length === 0) return true;
        return parsedArgs.tags.every((t: string) => {
          const searchStr = t.toLowerCase();
          return (
            w.tags?.some(tag => tag.toLowerCase() === searchStr) ||
            w.name?.toLowerCase().includes(searchStr) ||
            w.description?.toLowerCase().includes(searchStr)
          );
        });
      }).slice(0, parsedArgs.limit || 5);

    } else if (fnName === 'get_workflow') {
      res = await invoke('get_workflow', { id: parsedArgs.workflow_id });

    } else if (fnName === 'create_workflow') {
      const newWf = {
        id: "wf_" + Date.now().toString(),
        name: parsedArgs.title,
        description: parsedArgs.description || "Generated by AI Agent",
        type: "custom" as const,
        jsonContent: (() => {
          let j = typeof parsedArgs.workflow_json === 'string' ? parsedArgs.workflow_json : (parsedArgs.workflow_json ? JSON.stringify(parsedArgs.workflow_json, null, 2) : undefined);
          if (!j || j === '{}') {
            const lastUserMsg = currentMessages.slice().reverse().find(m => m.role === 'user');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
              const s = lastUserMsg.content.indexOf('{');
              const e = lastUserMsg.content.lastIndexOf('}');
              if (s !== -1 && e !== -1 && e > s) j = lastUserMsg.content.substring(s, e + 1);
            }
          }
          return j || '{}';
        })(),
        tags: (parsedArgs.tags || []),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await useWorkflowStore.getState().addWorkflow(newWf);
      res = { status: "success", workflow_id: newWf.id };

    } else if (fnName === 'update_workflow') {
      const workflows = useWorkflowStore.getState().workflows;
      let currentWf = workflows.find(w => w.id === parsedArgs.workflow_id);
      if (!currentWf) {
        const allWf = await invoke('list_workflows') as any[];
        const r = allWf.find((w: any) => w.id === parsedArgs.workflow_id);
        if (!r) throw new Error(`Workflow with ID ${parsedArgs.workflow_id} not found.`);
        currentWf = {
          id: r.id, name: r.name, description: r.description, type: r.type,
          jsonContent: r.jsonContent, tags: [], createdAt: r.createdAt, updatedAt: r.updatedAt
        };
      }
      const updatedWf = {
        name: parsedArgs.title !== undefined ? parsedArgs.title : currentWf.name,
        description: parsedArgs.description !== undefined ? parsedArgs.description : currentWf.description,
        jsonContent: (() => {
          if (parsedArgs.workflow_json === undefined) return currentWf.jsonContent;
          let j = typeof parsedArgs.workflow_json === 'string' ? parsedArgs.workflow_json : JSON.stringify(parsedArgs.workflow_json, null, 2);
          if (!j || j === '{}') {
            const lastUserMsg = currentMessages.slice().reverse().find(m => m.role === 'user');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
              const s = lastUserMsg.content.indexOf('{');
              const e = lastUserMsg.content.lastIndexOf('}');
              if (s !== -1 && e !== -1 && e > s) j = lastUserMsg.content.substring(s, e + 1);
            }
          }
          return j && j !== '{}' ? j : currentWf.jsonContent;
        })(),
        tags: parsedArgs.tags !== undefined ? parsedArgs.tags : currentWf.tags,
        updatedAt: Date.now()
      };
      await useWorkflowStore.getState().updateWorkflow(parsedArgs.workflow_id, updatedWf);
      res = { status: "success", message: `Workflow ${parsedArgs.workflow_id} updated.` };

    } else if (fnName === 'delete_workflow') {
      await invoke('delete_workflow', { id: parsedArgs.workflow_id });
      useWorkflowStore.getState().fetchWorkflows();
      res = { status: "success", message: `Workflow ${parsedArgs.workflow_id} deleted.` };

    } else if (fnName === 'get_generated_images') {
      const allImages = await invoke<any[]>('list_generated_images');
      const limit = parsedArgs.limit || 10;
      let filtered = allImages.filter(img => img.status === 'completed');
      if (parsedArgs.prompt_id) filtered = filtered.filter(img => img.promptId === parsedArgs.prompt_id);
      const prompts = usePromptStore.getState().prompts;
      res = filtered.slice(0, limit).map(img => {
        const p = prompts.find(p => p.id === img.promptId);
        return {
          id: img.id, url: img.outputPath, prompt_id: img.promptId,
          prompt_title: p?.title || 'Unknown', created_at: new Date(img.createdAt).toLocaleString()
        };
      });

    } else if (fnName === 'add_instance_image') {
      const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
      if (!currentPrompt) throw new Error(`Prompt ID ${parsedArgs.prompt_id} not found`);
      const existing: any[] = currentPrompt.images || [];
      const existingUrls = existing.map((img: any) => img.filePath);
      if (!existingUrls.includes(parsedArgs.image_url)) {
        const updatedPrompt = {
          ...currentPrompt,
          images: [...existing, { id: "img_" + Date.now(), promptId: parsedArgs.prompt_id, filePath: parsedArgs.image_url, fileName: "", createdAt: Date.now() }],
          updatedAt: Date.now()
        };
        await invoke('update_prompt', { prompt: updatedPrompt });
        usePromptStore.getState().fetchPrompts();
      }
      res = { status: "success", message: `Image added to prompt ${parsedArgs.prompt_id} instance images.` };

    } else if (fnName === 'install_custom_node') {
      const allowedHosts = ['github.com', 'gitlab.com', 'gitee.com', 'cnb.cool'];
      const nodeUrl = String(parsedArgs.node_url || '');
      let urlHost = '';
      try { urlHost = new URL(nodeUrl).hostname; } catch { /* invalid */ }
      if (!urlHost || !allowedHosts.includes(urlHost)) {
        throw new Error(`Refused: node_url host must be one of ${allowedHosts.join(', ')}. Got: "${urlHost}".`);
      }
      await invoke('install_custom_node', {
        nodeUrl,
        comfyDir: parsedArgs.comfy_dir || useSettingsStore.getState().settings.comfyDir || null
      });
      res = { status: "success", message: `Custom node installed: ${nodeUrl}` };

    } else if (fnName === 'check_comfyui_status') {
      // 从设置读取用户的 comfyUrl，而非让 Rust 兜底到 127.0.0.1
      const comfyUrl = useSettingsStore.getState().settings.comfyUrl || null;
      res = await invoke<any>('check_comfyui_status', { url: parsedArgs.url || comfyUrl });

    } else if (fnName === 'view_bookmarks') {
      res = await invoke<any[]>('list_favorite_characters', {
        tags: parsedArgs.tags || null, tagMatch: parsedArgs.tag_match || null,
        search: parsedArgs.search || null, limit: parsedArgs.limit ?? null, offset: parsedArgs.offset ?? null,
      });

    } else if (fnName === 'add_favorite_character') {
      res = await invoke<any>('add_favorite_character', {
        characterTag: parsedArgs.character_tag, source: parsedArgs.source || null,
        displayName: parsedArgs.display_name || null, trigger: parsedArgs.trigger || null,
        exampleImage: parsedArgs.example_image || null, notes: parsedArgs.notes || null,
        tags: parsedArgs.tags || null,
      });

    } else if (fnName === 'update_favorite_character') {
      await invoke('update_favorite_character', {
        id: parsedArgs.id, displayName: parsedArgs.display_name ?? null,
        trigger: parsedArgs.trigger ?? null, exampleImage: parsedArgs.example_image ?? null,
        notes: parsedArgs.notes ?? null,
      });
      res = { status: "success", id: parsedArgs.id };

    } else if (fnName === 'remove_favorite_character') {
      const removed = await invoke<boolean>('remove_favorite_character', {
        id: parsedArgs.id || null, characterTag: parsedArgs.character_tag || null,
      });
      res = { status: removed ? "success" : "not_found" };

    } else if (fnName === 'relink_favorite_character') {
      res = await invoke<any>('relink_favorite_character', { id: parsedArgs.id });
      useFavoriteLibraryStore.getState().refreshFavorites();

    } else if (fnName === 'add_tags_to_favorite_character') {
      const added = await invoke<number>('add_tags_to_favorite_character', {
        characterId: parsedArgs.character_id, tags: parsedArgs.tags,
      });
      res = { status: "success", added };

    } else if (fnName === 'remove_tag_from_favorite_character') {
      const removed = await invoke<boolean>('remove_tag_from_favorite_character', {
        characterId: parsedArgs.character_id, tag: parsedArgs.tag,
      });
      res = { status: removed ? "success" : "not_found" };

    } else if (fnName === 'set_favorite_character_tags') {
      const count = await invoke<number>('set_favorite_character_tags', {
        characterId: parsedArgs.character_id, tags: parsedArgs.tags,
      });
      res = { status: "success", count };

    } else if (fnName === 'list_favorite_character_tags') {
      res = await invoke<any[]>('list_favorite_character_tags', {});

    } else if (fnName === 'view_bookmarked_artists') {
      res = await invoke<any[]>('list_favorite_artists', {
        search: parsedArgs.search || null, limit: parsedArgs.limit ?? null, offset: parsedArgs.offset ?? null,
      });

    } else if (fnName === 'add_favorite_artist') {
      res = await invoke<any>('add_favorite_artist', {
        artistTag: parsedArgs.artist_tag, source: parsedArgs.source || null,
        displayName: parsedArgs.display_name || null, trigger: parsedArgs.trigger || null,
        exampleImage: parsedArgs.example_image || null, notes: parsedArgs.notes || null,
      });

    } else if (fnName === 'update_favorite_artist') {
      await invoke('update_favorite_artist', {
        id: parsedArgs.id, displayName: parsedArgs.display_name ?? null,
        trigger: parsedArgs.trigger ?? null, exampleImage: parsedArgs.example_image ?? null,
        notes: parsedArgs.notes ?? null,
      });
      res = { status: "success", id: parsedArgs.id };

    } else if (fnName === 'remove_favorite_artist') {
      const removed = await invoke<boolean>('remove_favorite_artist', {
        id: parsedArgs.id || null, artistTag: parsedArgs.artist_tag || null,
      });
      res = { status: removed ? "success" : "not_found" };

    } else {
      // Unknown tool — try MCP external tool dispatch
      const mcpTool = mcpTools.find((t: any) => t.function?.name === fnName || t.name === fnName);
      const mcpUrl = mcpTool?._mcp?.url || mcpTool?.function?._mcp?.url;
      if (mcpUrl) {
        try {
          const result = await invoke<string>('call_mcp_tool', {
            url: mcpUrl, name: fnName, arguments: parsedArgs
          });
          resultStr = result;
        } catch (mcpErr: any) {
          resultStr = JSON.stringify({ error: "MCP tool call failed: " + mcpErr.toString() });
        }
      } else {
        throw new Error("Unknown tool: " + fnName);
      }
    }

    if (!resultStr) resultStr = JSON.stringify(res);
  } catch (invokeErr: any) {
    resultStr = JSON.stringify({ error: invokeErr.toString() });
  }

  // Extract image paths from result for UI display
  let images: string[] | undefined;
  if (res && res.images && Array.isArray(res.images)) {
    images = res.images
      .map((img: any) => typeof img === 'string' ? img : (img.url || img.filePath || img.outputPath || img.path))
      .filter((s: any) => typeof s === 'string' && s.length > 0);
  } else if (res && res.videos && Array.isArray(res.videos)) {
    images = res.videos
      .map((v: any) => typeof v === 'string' ? v : (v.url || v.filePath || v.outputPath || v.path))
      .filter((s: any) => typeof s === 'string' && s.length > 0);
  } else if (Array.isArray(res) && res.length > 0 && res[0].url) {
    images = res.map((item: any) => item.url).filter(Boolean);
  }

  return { resultStr, images };
}
