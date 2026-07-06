import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { usePromptStore } from "../stores/promptStore";
import { useQueueStore } from "../stores/queueStore";
import { useWorkflowStore } from "../stores/workflowStore";

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
      }>("mcp-generate-request", async (event) => {
        const { prompt_id, batch_count, reply_key } = event.payload;
        if (cancelled) return;

        // Try to resolve the prompt: first from the local store, then from the backend.
        let prompt = usePromptStore.getState().prompts.find((p) => p.id === prompt_id);
        if (!prompt) {
          try {
            const rustPrompt = await invoke<any>("get_prompt", { id: prompt_id });
            if (rustPrompt) {
              // Convert from Rust camelCase format using the store's mapper.
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

        // Resolve a workflow to use.
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
