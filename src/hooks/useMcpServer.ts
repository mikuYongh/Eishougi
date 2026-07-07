import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { usePromptStore } from "../stores/promptStore";
import type { PromptProject } from "../stores/promptStore";
import { useQueueStore } from "../stores/queueStore";
import { useWorkflowStore } from "../stores/workflowStore";
import { comfyService } from "../services/comfyService";

// Default negative prompt used in direct-generation mode when none is supplied.
const DEFAULT_NEGATIVE = "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry";

/**
 * Build a throwaway PromptProject from raw MCP params (direct-generation mode).
 * Nothing is persisted; this object only exists long enough to drive addJob + injectParameters.
 *
 * IMPORTANT: sampler / scheduler / baseModel / vaeModel are seeded from the bound workflow's own
 * nodes (via analyzeWorkflow) — NOT left as empty strings. injectParameters treats "" as a real
 * value and would write it into the workflow, making ComfyUI reject the prompt with an invalid
 * sampler/model. When the caller doesn't override them, we want the workflow's original values
 * to survive, which means pre-filling them here from the workflow JSON.
 */
function buildTempProject(params: any): PromptProject {
  const now = Date.now();
  const workflows = useWorkflowStore.getState().workflows;
  const defaultWorkflowId =
    params.workflow_id ||
    workflows.find((w) => w.type === "text2img" && w.isDefault)?.id;
  const defaultWorkflow = workflows.find((w) => w.id === defaultWorkflowId);

  // Parse the default workflow so unset generation fields inherit the workflow's real values
  // (sampler, scheduler, baseModel, vae, size). This mirrors what PromptEdit does on new-project.
  let wfSampler = "";
  let wfScheduler = "";
  let wfBaseModel = "";
  let wfVae = "";
  let wfLoras: any[] = [];
  let wfWidth: number | null = null;
  let wfHeight: number | null = null;
  if (defaultWorkflow?.jsonContent) {
    try {
      const a = comfyService.analyzeWorkflow(defaultWorkflow.jsonContent);
      wfSampler = a.samplerName || "";
      wfScheduler = a.scheduler || "";
      wfBaseModel = a.baseModel || "";
      wfVae = a.vaeModel || "";
      wfLoras = a.loras || [];
      wfWidth = a.width;
      wfHeight = a.height;
    } catch (e) {
      console.warn("[MCP direct-gen] failed to analyze default workflow:", e);
    }
  }

  // Default size: prefer the workflow's native latent size; otherwise fall back to a portrait
  // 832×1216 (the most common SDXL/illustration aspect — taller than wide), NOT a square. The
  // MCP schema's resolution rule keeps both edges ≤ ~1024 by default.
  const defaultWidth = wfWidth ?? 832;
  const defaultHeight = wfHeight ?? 1216;

  return {
    id: `mcp_temp_${now}`,
    title: params.title || "MCP 直接生成",
    description: "",
    positivePrompt: params.positive_prompt || "",
    negativePrompt: params.negative_prompt ?? DEFAULT_NEGATIVE,
    artistPrompt: params.artist_prompt || "",
    promptSyntax: "danbooru",
    width: Number(params.width) || defaultWidth,
    height: Number(params.height) || defaultHeight,
    resolution: params.resolution,
    steps: Number(params.steps) || 25,
    cfgScale: Number(params.cfg_scale) || 5.0,
    seed: params.seed != null ? String(params.seed) : "-1",
    sampler: params.sampler_name || wfSampler,
    scheduler: params.scheduler || wfScheduler,
    baseModel: params.base_model || wfBaseModel,
    vaeModel: params.vae_model || wfVae || "auto",
    loraConfigs: Array.isArray(params.lora_configs) ? params.lora_configs : wfLoras,
    workflowId: defaultWorkflowId,
    tags: [],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    instanceImages: [],
  };
}

export interface McpServerStatus {
  running: boolean;
  port: number;
  url: string;
  token: string | null;
  core: boolean;
  query: boolean;
  write: boolean;
}

/**
 * React hook for the MCP HTTP server feature.
 *
 * Responsibilities:
 *  - Poll the backend for the current server status (running / port / token / tool groups),
 *    so the UI can reflect the real state rather than its local mirror.
 *  - Listen for `mcp-generate-request` events. When an external MCP client calls
 *    `generate_image`, the Rust server can't run the frontend-only workflow injection, so it
 *    emits this event. Here we resolve the prompt + workflow and drive `addJob`, then emit the
 *    `mcp-generate-reply::<key>` event the server is awaiting.
 */
export function useMcpServer() {
  const [status, setStatus] = useState<McpServerStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<McpServerStatus>("mcp_server_status");
      setStatus(s);
    } catch (e) {
      console.warn("[MCP] failed to query server status:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-check periodically so the UI notices if the backend restarts the server.
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Bridge generate_image requests from external MCP clients to the frontend generation queue.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    const setup = async () => {
      unlisten = await listen<{
        prompt_id: string;
        batch_count: number;
        reply_key: string;
        params?: any;
      }>("mcp-generate-request", async (event) => {
        const { prompt_id, batch_count, reply_key, params } = event.payload;
        if (cancelled) return;

        // ---- Two modes ----
        // (A) prompt_id given: load the project (store → backend fallback), then apply param overrides.
        // (B) prompt_id empty: build a throwaway project directly from params (no DB row created).
        let prompt: PromptProject | undefined;

        if (prompt_id) {
          prompt = usePromptStore.getState().prompts.find((p) => p.id === prompt_id);
          if (!prompt) {
            try {
              const rustPrompt = await invoke<any>("get_prompt", { id: prompt_id });
              if (rustPrompt) {
                const { fromRustPrompt } = await import("../stores/promptStore");
                prompt = fromRustPrompt(rustPrompt);
              }
            } catch (e) {
              console.warn("[MCP] failed to fetch prompt from backend:", e);
            }
          }
          if (!prompt) {
            await emit(reply_key, { status: "error", message: `Prompt ${prompt_id} not found.` }).catch(() => {});
            return;
          }
          // Apply per-field overrides on top of the loaded project.
          if (params) {
            prompt = {
              ...prompt,
              ...(params.positive_prompt != null ? { positivePrompt: params.positive_prompt } : {}),
              ...(params.negative_prompt != null ? { negativePrompt: params.negative_prompt } : {}),
              ...(params.artist_prompt != null ? { artistPrompt: params.artist_prompt } : {}),
              ...(params.base_model != null ? { baseModel: params.base_model } : {}),
              ...(params.vae_model != null ? { vaeModel: params.vae_model } : {}),
              ...(Array.isArray(params.lora_configs) ? { loraConfigs: params.lora_configs } : {}),
              ...(params.width != null ? { width: Number(params.width) } : {}),
              ...(params.height != null ? { height: Number(params.height) } : {}),
              ...(params.steps != null ? { steps: Number(params.steps) } : {}),
              ...(params.cfg_scale != null ? { cfgScale: Number(params.cfg_scale) } : {}),
              ...(params.seed != null ? { seed: String(params.seed) } : {}),
              ...(params.sampler_name != null ? { sampler: params.sampler_name } : {}),
              ...(params.scheduler != null ? { scheduler: params.scheduler } : {}),
              ...(params.workflow_id != null ? { workflowId: params.workflow_id } : {}),
            };
          }
        } else {
          // Direct mode: params is required and must contain positive_prompt (backend validates this).
          prompt = buildTempProject(params || {});
        }

        // Resolve a workflow to use: the project's binding, or the default text2img workflow.
        const workflows = useWorkflowStore.getState().workflows;
        const workflowId =
          prompt.workflowId ||
          workflows.find((w) => w.type === "text2img" && w.isDefault)?.id ||
          undefined;

        try {
          const results = await useQueueStore
            .getState()
            .addJob(prompt, workflowId, Math.max(1, batch_count));
          // results is string[][] (one image-url set per batch item).
          const flat = results.flat();
          await emit(reply_key, { status: "completed", images: flat, count: flat.length }).catch(() => {});
        } catch (e: any) {
          await emit(reply_key, { status: "failed", message: e?.message || String(e) }).catch(() => {});
        }
      });
    };
    setup();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return { status, refresh };
}
