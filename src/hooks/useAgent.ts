/**
 * AI Agent hook (Vercel AI SDK v7 experiment).
 *
 * Replaces the hand-rolled recursive callLLM loop on master with streamText +
 * tools(execute) + stopWhen + prepareStep(pruneMessages). All tool execution
 * logic is shared via agentToolExecutors.ts, so behavior is identical.
 *
 * Key improvements over the old loop:
 *   - prepareStep + pruneMessages: automatic context compaction when input tokens
 *     exceed a threshold, directly fixing the 15w+ input-token bloat problem.
 *   - The SDK manages tool_call/tool_call_id pairing internally — no more 400
 *     errors from broken message history.
 *   - Built-in stopWhen / maxSteps replaces the manual round counter.
 *   - abortSignal is first-class — no more "stuck thinking" after stop.
 */

import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAgentStore } from '../stores/agentStore';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { streamText, type ModelMessage, stepCountIs, pruneMessages, type ToolSet } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { jsonSchema } from 'ai';
import { executeTool } from '../lib/agentToolExecutors';
import { buildOutputSpec, type PromptSyntax } from '../lib/agentPrompts';
import { usePromptStore } from '../stores/promptStore';

// ── Fetch polyfill: Tauri webview on Android needs plugin-http for CORS ──
const smartFetch = async (input: RequestInfo | URL | string, init?: RequestInit) => {
  const isAndroid = navigator.userAgent.toLowerCase().includes('android');
  if (isAndroid && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      return await tauriFetch(input as string, init);
    } catch (e: any) {
      if (e.message && e.message.includes('not allowed on the configured scope')) {
        console.warn('tauriFetch scope error, falling back to window.fetch', e);
      } else {
        throw e;
      }
    }
  }
  return window.fetch(input, init);
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[];
  files?: ChatAttachment[];
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

export interface ChatAttachment {
  path: string;
  name: string;
  mime: string;
  isImage: boolean;
}

// Keep the embedded tool-call parser — some models still emit text-mode calls.
function parseEmbeddedToolCalls(content: string): {
  calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  remaining: string;
} {
  const calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
  let remaining = content;

  const blockRe = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  const blocks = [...content.matchAll(blockRe)];
  if (blocks.length > 0) {
    for (let i = 0; i < blocks.length; i++) {
      const raw = blocks[i][1].trim();
      let name = '';
      let argsObj: any = {};
      try {
        const json = JSON.parse(raw);
        if (json && typeof json === 'object') {
          name = String(json.name || json.function || '');
          if (json.arguments && typeof json.arguments === 'object') argsObj = json.arguments;
          else if (typeof json.arguments === 'string') { try { argsObj = JSON.parse(json.arguments); } catch { argsObj = {}; } }
          else if (json.parameters) argsObj = json.parameters;
        }
      } catch {
        const fnMatch = raw.match(/<function=([^>\s]+)>([\s\S]*?)<\/function>/);
        if (fnMatch) {
          name = fnMatch[1].trim();
          const inner = fnMatch[2] || '';
          const paramRe = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;
          for (const p of inner.matchAll(paramRe)) {
            const key = p[1].trim();
            let val: any = p[2].trim();
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === 'null') val = null;
            else { try { const parsed = JSON.parse(val); val = typeof parsed === 'number' || typeof parsed === 'object' ? parsed : val; } catch {} }
            argsObj[key] = val;
          }
        }
      }
      if (name) calls.push({ id: `recovered_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(argsObj) } });
    }
    remaining = remaining.replace(blockRe, '');
  }

  const DSML = '\uFF5C\uFF5C';
  const dsmlBlockRe = new RegExp(`<${DSML}DSML${DSML}tool_calls>([\\s\\S]*?)<\\/${DSML}DSML${DSML}tool_calls>`, 'g');
  for (const block of content.matchAll(dsmlBlockRe)) {
    const invokeRe = new RegExp(`<${DSML}DSML${DSML}invoke\\s+name="([^"]+)">([\\s\\S]*?)<\\/${DSML}DSML${DSML}invoke>`, 'g');
    let invokeMatch: RegExpExecArray | null;
    let dsmlIdx = 0;
    while ((invokeMatch = invokeRe.exec(block[1])) !== null) {
      const name = invokeMatch[1].trim();
      const paramRe = new RegExp(`<${DSML}DSML${DSML}parameter\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${DSML}DSML${DSML}parameter>`, 'g');
      const argsObj: any = {};
      let paramMatch: RegExpExecArray | null;
      while ((paramMatch = paramRe.exec(invokeMatch[2])) !== null) {
        const key = paramMatch[1].trim();
        let val: any = paramMatch[2].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val === 'null') val = null;
        else { try { const parsed = JSON.parse(val); val = typeof parsed === 'number' || typeof parsed === 'object' ? parsed : val; } catch {} }
        argsObj[key] = val;
      }
      calls.push({ id: `dsml_${Date.now()}_${dsmlIdx}_${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(argsObj) } });
      dsmlIdx++;
    }
    remaining = remaining.replace(dsmlBlockRe, '');
  }

  return { calls, remaining };
}

// ── Tool schema definitions (JSON Schema objects, shared shape) ──
// The AI SDK's tool() helper takes a `parameters` jsonSchema. We define each schema
// once here and reuse for both tool definitions and (if needed) validation.
const TOOL_SCHEMAS: Record<string, any> = {
  search_prompts: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, limit: { type: "number" } } },
  get_prompt: { type: "object", properties: { prompt_id: { type: "string" } }, required: ["prompt_id"] },
  create_prompt: { type: "object", properties: {
    title: { type: "string" }, content: { type: "string" }, negative_prompt: { type: "string" },
    artist_prompt: { type: "string" }, prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"] },
    tags: { type: "array", items: { type: "string" } }, instance_images: { type: "array", items: { type: "string" } },
    base_model: { type: "string" }, vae_model: { type: "string" },
    lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } },
    width: { type: "number" }, height: { type: "number" }, steps: { type: "number" }, cfg_scale: { type: "number" },
    seed: { type: "string" }, sampler_name: { type: "string" }, scheduler: { type: "string" }, workflow_id: { type: "string" }
  }, required: ["content"] },
  update_prompt_content: { type: "object", properties: {
    prompt_id: { type: "string" }, title: { type: "string" }, positive_prompt: { type: "string" },
    negative_prompt: { type: "string" }, artist_prompt: { type: "string" },
    prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"] }, tags: { type: "array", items: { type: "string" } }
  }, required: ["prompt_id"] },
  update_prompt_settings: { type: "object", properties: {
    prompt_id: { type: "string" }, base_model: { type: "string" }, vae_model: { type: "string" },
    lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } },
    width: { type: "number" }, height: { type: "number" }, steps: { type: "number" }, cfg_scale: { type: "number" },
    seed: { type: "string" }, sampler_name: { type: "string" }, scheduler: { type: "string" }, workflow_id: { type: "string" }
  }, required: ["prompt_id"] },
  delete_prompt: { type: "object", properties: { prompt_id: { type: "string" } }, required: ["prompt_id"] },
  generate_image: { type: "object", properties: {
    prompt_id: { type: "string" }, batch_count: { type: "number" },
    base_model: { type: "string" }, vae_model: { type: "string" },
    lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } },
    width: { type: "number" }, height: { type: "number" }, steps: { type: "number" }, cfg_scale: { type: "number" },
    seed: { type: "string" }, sampler_name: { type: "string" }, scheduler: { type: "string" },
    positive_prompt: { type: "string" }, negative_prompt: { type: "string" }, artist_prompt: { type: "string" }, workflow_id: { type: "string" }
  }, required: ["prompt_id"] },
  generate_video_from_image: { type: "object", properties: {
    prompt: { type: "string" }, duration: { type: "number" }, fps: { type: "number" },
    base_model: { type: "string" }, workflow_id: { type: "string" }
  }, required: ["prompt"] },
  get_queue_status: { type: "object", properties: {} },
  search_workflows: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, limit: { type: "number" } } },
  get_workflow: { type: "object", properties: { workflow_id: { type: "string" } }, required: ["workflow_id"] },
  create_workflow: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, workflow_json: { type: "object" }, tags: { type: "array", items: { type: "string" } } }, required: ["title"] },
  update_workflow: { type: "object", properties: { workflow_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, workflow_json: { type: "object" }, tags: { type: "array", items: { type: "string" } } }, required: ["workflow_id"] },
  delete_workflow: { type: "object", properties: { workflow_id: { type: "string" } }, required: ["workflow_id"] },
  get_generated_images: { type: "object", properties: { prompt_id: { type: "string" }, limit: { type: "number" } } },
  add_instance_image: { type: "object", properties: { prompt_id: { type: "string" }, image_url: { type: "string" } }, required: ["prompt_id", "image_url"] },
  auto_tag_all_prompts: { type: "object", properties: {} },
  list_local_models: { type: "object", properties: {} },
  install_custom_node: { type: "object", properties: { node_url: { type: "string" }, comfy_dir: { type: "string" } }, required: ["node_url"] },
  check_comfyui_status: { type: "object", properties: { url: { type: "string" } } },
  list_character_series: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } },
  search_characters_in_series: { type: "object", properties: { series: { type: "string" }, search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["series"] },
  search_artists: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } },
  random_character_and_artist: { type: "object", properties: { series: { type: "string" }, use_artist: { type: "boolean" } } },
  view_bookmarks: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, tag_match: { type: "string", enum: ["or", "and"] }, search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } },
  add_favorite_character: { type: "object", properties: { character_tag: { type: "string" }, source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"] }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["character_tag"] },
  update_favorite_character: { type: "object", properties: { id: { type: "string" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["id"] },
  remove_favorite_character: { type: "object", properties: { id: { type: "string" }, character_tag: { type: "string" } } },
  relink_favorite_character: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  add_tags_to_favorite_character: { type: "object", properties: { character_id: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["character_id", "tags"] },
  remove_tag_from_favorite_character: { type: "object", properties: { character_id: { type: "string" }, tag: { type: "string" } }, required: ["character_id", "tag"] },
  set_favorite_character_tags: { type: "object", properties: { character_id: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["character_id", "tags"] },
  list_favorite_character_tags: { type: "object", properties: {} },
  view_bookmarked_artists: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } },
  add_favorite_artist: { type: "object", properties: { artist_tag: { type: "string" }, source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"] }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["artist_tag"] },
  update_favorite_artist: { type: "object", properties: { id: { type: "string" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["id"] },
  remove_favorite_artist: { type: "object", properties: { id: { type: "string" }, artist_tag: { type: "string" } } },
};

// Full descriptions from the original ALL_TOOLS (kept here so the experiment branch is self-contained).
const TOOL_DESCRIPTIONS: Record<string, string> = {
  search_prompts: "Search for prompts by tags, keywords, or filters.",
  get_prompt: "Get a specific prompt by ID.",
  create_prompt: "Create a new prompt project. CHARACTER PROTECTION: If the scene mentions a known character, DO NOT add hair/eye/body tags — use ONLY the character name tag. Verify unknown names via search_tags first. Group multi-character tags contiguously.",
  update_prompt_content: "Update the textual content (prompts, title, tags) of an existing project. CHARACTER PROTECTION rules apply.",
  update_prompt_settings: "Update the configuration settings (model, LoRAs, resolution, etc) of an existing project.",
  delete_prompt: "Delete an existing prompt.",
  generate_image: "Generate an image using a specific prompt project. WAITS for completion and returns image paths directly. All override parameters are optional.",
  generate_video_from_image: "Generate a video from an image using an img2video workflow. Source image is taken automatically from the most recent image in the conversation.",
  get_queue_status: "Get the status of the generation queue.",
  search_workflows: "Search for workflows by tags or limit.",
  get_workflow: "Get a specific workflow by ID.",
  create_workflow: "Create a new workflow.",
  update_workflow: "Update an existing workflow.",
  delete_workflow: "Delete an existing workflow.",
  get_generated_images: "Get the list of generated images from history.",
  add_instance_image: "Add a generated history image to a prompt project's instance/reference images.",
  auto_tag_all_prompts: "Batch auto-generate Chinese tags for all prompts.",
  list_local_models: "List all local models (checkpoints, loras, vaes).",
  install_custom_node: "Install a ComfyUI custom node by git cloning it into custom_nodes/.",
  check_comfyui_status: "Check if a ComfyUI server is online and return its system stats.",
  list_character_series: "List character series/copyrights (e.g. 原神) with character counts, paginated.",
  search_characters_in_series: "Search for characters WITHIN a specific series. `series` is REQUIRED.",
  search_artists: "Search the artist library (15k+ artists with trigger tags).",
  random_character_and_artist: "Pick a RANDOM character and a RANDOM artist from the library.",
  view_bookmarks: "ONLY use when user explicitly says 收藏/bookmark/favorite. Shows bookmarked characters.",
  add_favorite_character: "ONLY use when user EXPLICITLY says 收藏 a specific character. Does NOT generate images.",
  update_favorite_character: "Update editable fields of a favorite character.",
  remove_favorite_character: "Remove a favorite character by id or character_tag.",
  relink_favorite_character: "Re-attempt gallery match for a favorite character.",
  add_tags_to_favorite_character: "Append tags to a favorite character. Idempotent.",
  remove_tag_from_favorite_character: "Remove a single tag from a favorite character.",
  set_favorite_character_tags: "Overwrite all tags of a favorite character.",
  list_favorite_character_tags: "List all distinct tags used across favorite characters.",
  view_bookmarked_artists: "ONLY use when user explicitly says 收藏画师/bookmark artist.",
  add_favorite_artist: "ONLY use when user EXPLICITLY says 收藏 a specific artist. Does NOT generate anything.",
  update_favorite_artist: "Update editable fields of a favorite artist.",
  remove_favorite_artist: "Remove a favorite artist by id or artist_tag.",
};

export function useAgent() {
  const { sessions, activeSessionId, addMessage, setMessages, settings: agentSettings, isGenerating, setIsGenerating } = useAgentStore();
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];
  const abortControllerRef = useRef<AbortController | null>(null);
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(false);

  // image base64 cache (same N² IO optimization as master)
  const imageBase64CacheRef = useRef<Map<string, string>>(new Map());
  // cumulative token usage
  const tokenUsageRef = useRef<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>(null);
  const precheckRef = useRef<string>("");

  // ── MCP tool discovery (unchanged from master) ──
  const sanitizeSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return { type: "object", properties: {} };
    if (Array.isArray(schema)) return schema.map(sanitizeSchema);
    const cleaned: any = {};
    for (const key of Object.keys(schema)) {
      if (key === '$defs' || key === '$ref' || key === '$schema') continue;
      const val = schema[key];
      if (key === 'anyOf' && Array.isArray(val)) cleaned.type = 'string';
      else if (key === 'allOf' && Array.isArray(val)) Object.assign(cleaned, sanitizeSchema(val.find((v: any) => v.type) || val[0] || {}));
      else if (key === 'enum' && Array.isArray(val)) {
        cleaned[key] = val.filter((v: any) => typeof v === 'string').slice(0, 50);
        if (cleaned[key].length === 0) delete cleaned[key];
      } else if (typeof val === 'object' && val !== null) cleaned[key] = sanitizeSchema(val);
      else cleaned[key] = val;
    }
    if (!cleaned.type) cleaned.type = "object";
    return cleaned;
  };

  useEffect(() => {
    let cancelled = false;
    const fetchMcpTools = async () => {
      const { mcpServers } = useSettingsStore.getState().settings;
      const enabledServers = mcpServers?.filter(s => s.enabled) || [];
      if (enabledServers.length === 0) { setMcpTools([]); setMcpEnabled(false); return; }
      const allTools: any[] = [];
      for (const server of enabledServers) {
        try {
          const rustTools = await invoke<any[]>('list_mcp_tools', { url: server.url });
          for (const t of rustTools) {
            allTools.push({
              type: "function",
              function: { name: t.name, description: (t.description || "").substring(0, 1024), parameters: sanitizeSchema(t.input_schema) || { type: "object", properties: {} } },
              _mcp: { url: server.url }
            });
          }
        } catch (e) { console.warn(`[Agent] MCP server "${server.name}" failed:`, e); }
      }
      if (!cancelled) { setMcpTools(allTools); setMcpEnabled(allTools.length > 0); }
    };
    fetchMcpTools();
    const unsub = useSettingsStore.subscribe((s, prev) => { if (s.settings.mcpServers !== prev.settings.mcpServers) fetchMcpTools(); });
    return () => { cancelled = true; unsub(); };
  }, []);

  // ── Convert ChatMessage[] → AI SDK CoreMessage[] ──
  // Strips old image base64 (only last 3 msgs keep images), strips old reasoning_content.
  const convertToCoreMessages = async (chatMessages: ChatMessage[]): Promise<ModelMessage[]> => {
    const VIDEO_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v']);
    const isVideoExt = (p: string) => VIDEO_EXTS.has((p.split('?')[0].split('.').pop() || '').toLowerCase());
    const total = chatMessages.length;
    const IMAGE_CUTOFF = total - 3;

    const result: ModelMessage[] = [];
    for (let idx = 0; idx < chatMessages.length; idx++) {
      const msg = chatMessages[idx];

      // Build content parts
      if (msg.role === 'tool') {
        // Tool result message
        result.push({
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: msg.tool_call_id || '', output: { type: 'text', value: msg.content } }],
        } as ModelMessage);
        continue;
      }

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Assistant message with tool calls
        const contentParts: any[] = [];
        if (msg.content) contentParts.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
          contentParts.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.function?.name || '',
            input: args,
          });
        }
        // Preserve reasoning_content for recent messages only
        if (msg.reasoning_content && idx >= IMAGE_CUTOFF) {
          contentParts.unshift({ type: 'reasoning', text: msg.reasoning_content, providerMetadata: undefined });
        }
        result.push({ role: 'assistant', content: contentParts } as ModelMessage);
        continue;
      }

      // User or plain assistant message — may have images
      const parts: any[] = [];
      if (msg.content) parts.push({ type: 'text', text: msg.content });

      if (idx >= IMAGE_CUTOFF) {
        const imageOnly = (msg.images || []).filter(p => !isVideoExt(p));
        for (const urlOrPath of imageOnly) {
          try {
            let dataUrl = urlOrPath;
            if (!urlOrPath.startsWith('data:')) {
              const cached = imageBase64CacheRef.current.get(urlOrPath);
              if (cached) {
                dataUrl = cached;
              } else {
                if (urlOrPath.startsWith('http')) {
                  const res = await fetch(urlOrPath);
                  const blob = await res.blob();
                  dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                } else {
                  dataUrl = await invoke<string>('read_image_base64', { path: urlOrPath });
                }
                if (dataUrl && dataUrl.startsWith('data:')) imageBase64CacheRef.current.set(urlOrPath, dataUrl);
              }
            }
            parts.push({ type: 'image', image: dataUrl });
          } catch { /* skip broken image */ }
        }
      }

      if (parts.length === 0) parts.push({ type: 'text', text: '' });
      result.push({ role: msg.role as 'user' | 'assistant' | 'system', content: parts } as ModelMessage);
    }
    return result;
  };

  // ── Pre-check: query rewrite + character detection (unchanged) ──
  const rewriteQueryAndDetectCharacters = async (userText: string): Promise<string> => {
    const { llm } = useSettingsStore.getState().settings;
    if (!llm.apiKey) return "";

    const precheckPrompt = `Analyze the user's image-generation request and extract structured information.
Output ONLY a valid JSON object, no markdown fences, no explanation:
{
  "has_named_character": boolean,
  "character_names": ["..."],
  "provided_tags": ["1girl", "white_hair"],
  "search_dimensions": ["维度1", "维度2"]
}

Rules:
1. has_named_character: true ONLY if the text mentions a known IP character.
2. character_names: detected character names in their original language.
3. provided_tags: English Danbooru tags explicitly provided by the user.
4. search_dimensions: split the remaining scene description into 2-4 concise Chinese search dimensions.

User input: ${userText}`;

    let apiUrl = llm.apiUrl || 'https://apihub.agnes-ai.com/v1';
    if (!apiUrl.endsWith('/chat/completions')) apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';

    try {
      const resp = await smartFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llm.apiKey}` },
        body: JSON.stringify({ model: llm.model || 'agnes-2.0-flash', messages: [{ role: 'user', content: precheckPrompt }], temperature: 0.2, max_tokens: 400 }),
        signal: abortControllerRef.current?.signal,
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      const content = (data.choices?.[0]?.message?.content || "").replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(content);
      const parts: string[] = [];
      if (parsed.has_named_character && Array.isArray(parsed.character_names) && parsed.character_names.length > 0) {
        parts.push(`⚠ NAMED CHARACTERS DETECTED: ${parsed.character_names.join(', ')}\nCRITICAL: DO NOT add ANY appearance tags for these characters.`);
      }
      if (Array.isArray(parsed.provided_tags) && parsed.provided_tags.length > 0) {
        parts.push(`📋 USER-PROVIDED TAGS (trust directly): ${parsed.provided_tags.join(', ')}`);
      }
      if (Array.isArray(parsed.search_dimensions) && parsed.search_dimensions.length > 0) {
        parts.push(`🔍 SEARCH DIMENSIONS:\n` + parsed.search_dimensions.map((d: string, i: number) => `  ${i + 1}. ${d}`).join('\n'));
      }
      return parts.length > 0 ? "\n\n[PRE-CHECK ANALYSIS:]\n" + parts.join('\n\n') : "";
    } catch { return ""; }
  };

  // ── Build system prompt (same logic as master) ──
  const buildSystemPrompt = (mcpToolsPrompt: string) => {
    let systemContext = `\n\n[System Context]`;
    const match = window.location.pathname.match(/\/prompts\/(p_[a-zA-Z0-9_-]+)/);
    if (match) {
      const activePromptId = match[1];
      systemContext += `\nThe user is currently viewing/editing Prompt Project ID: ${activePromptId}.\nCRITICAL: You MUST USE update_prompt_content or update_prompt_settings on this ID. DO NOT create a new prompt.`;
      // Check prompt store for syntax
      const activePrompt = usePromptStore.getState().prompts.find((p: any) => p.id === activePromptId);
      if (activePrompt) {
        systemContext += `\n\n## SYNTAX MODE RESTRICTION (${activePrompt.promptSyntax.toUpperCase()})`;
        if (activePrompt.promptSyntax === 'danbooru') {
          systemContext += `\n- Strictly use Danbooru tags (comma-separated, underscores). Artist tags must start with @.`;
        } else if (activePrompt.promptSyntax === 'natural') {
          systemContext += `\n- Use beautifully constructed natural language English sentences.`;
        } else if (activePrompt.promptSyntax === 'xml') {
          systemContext += `\n- Output a structured XML block containing <character>, <general_tags>, etc.`;
        }
        systemContext += buildOutputSpec(activePrompt.promptSyntax as PromptSyntax);
      }
    } else {
      systemContext += `\nThe user is NOT viewing a specific prompt. If they ask to generate a scene, use create_prompt.`;
      systemContext += buildOutputSpec('danbooru');
    }

    return agentSettings.systemPrompt + mcpToolsPrompt + systemContext + precheckRef.current
      + "\n\n## 工具路由规则（必须遵守）"
      + "\n用户问\"有什么角色\" → list_character_series（全库）。view_bookmarks 只返回收藏夹"
      + "\n用户问\"有什么画师\" → search_artists"
      + "\n用户说\"随便来一张\" → random_character_and_artist"
      + "\n用户要创建角色图片 → 直接用 Danbooru 知识构建 tag 调 create_prompt"
      + "\n搜索返回空 → 继续用你的知识创建，不要卡住"
      + "\n⚠️ search_tags/get_related_tags/get_artist_recommendations/get_custom_styles 这些工具不存在";
  };

  // ── Build AI SDK tools object from schema definitions + executeTool ──
  const buildAiSdkTools = (): ToolSet => {
    const tools: any = {};
    for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
      tools[name] = {
        description: TOOL_DESCRIPTIONS[name] || name,
        parameters: jsonSchema(schema),
        execute: async (args: any) => {
          const { resultStr } = await executeTool(name, args, {
            currentMessages: messages,
            mcpTools,
            addMessage,
          });
          // Return the JSON result string; the onChunk tool-result handler will
          // parse images/videos out of it for UI display.
          return resultStr;
        },
      };
    }
    // Add MCP tools dynamically
    for (const mcpTool of mcpTools) {
      const fn = mcpTool.function || mcpTool;
      if (!tools[fn.name]) {
        tools[fn.name] = {
          description: (fn.description || "").substring(0, 1024),
          parameters: jsonSchema(sanitizeSchema(fn.parameters) || { type: "object", properties: {} }),
          execute: async (args: any) => {
            const { resultStr } = await executeTool(fn.name, args, { currentMessages: messages, mcpTools, addMessage });
            return resultStr;
          },
        };
      }
    }
    return tools as ToolSet;
  };

  const runAgent = async (allMessages: ChatMessage[]) => {
    const { llm } = useSettingsStore.getState().settings;
    const { effort, maxRounds } = agentSettings;
    const effectiveMaxSteps = effort === 'low' ? 2 : (maxRounds || 8);

    const abortController = abortControllerRef.current || new AbortController();
    abortControllerRef.current = abortController;
    if (abortController.signal.aborted) return;

    // Create the OpenAI-compatible provider pointing at the user's LLM endpoint
    const provider = createOpenAICompatible({
      name: 'agnes',
      baseURL: (llm.apiUrl || 'https://apihub.agnes-ai.com/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, ''),
      apiKey: llm.apiKey || '',
      fetch: smartFetch as any,
    });
    const model = provider.chatModel(llm.model || 'agnes-2.0-flash');

    // Convert history
    const coreMessages = await convertToCoreMessages(allMessages);

    // MCP tools prompt
    const mcpToolsPrompt = mcpTools.length > 0
      ? `\n\n## AVAILABLE MCP TOOLS\n${mcpTools.map((t: any) => `- ${t.function?.name || t.name}(${Object.keys((t.function?.parameters || t.inputSchema)?.properties || {}).join(', ')}): ${t.function?.description || t.description}`).join('\n')}`
      : '';

    const system = buildSystemPrompt(mcpToolsPrompt);
    const tools = buildAiSdkTools();

    // UI streaming: accumulate text/reasoning into a live assistant message
    let liveContent = '';
    let liveReasoning = '';
    let liveToolCalls: any[] = [];
    let liveToolResults: { id: string; name: string; result: string; images?: string[] }[] = [];
    let rafScheduled = false;
    let rafId: number | null = null;
    const baseMessages = [...allMessages];

    const flushRender = () => {
      rafScheduled = false;
      rafId = null;
      // Build the current assistant message from accumulated state
      const assistantMsg: ChatMessage = {
        id: 'streaming_' + Date.now(),
        role: 'assistant',
        content: liveContent,
        reasoning_content: liveReasoning || undefined,
        tool_calls: liveToolCalls.length > 0 ? liveToolCalls : undefined,
      };
      // Append tool result messages after the assistant message
      const toolMsgs: ChatMessage[] = liveToolResults.map(tr => ({
        id: 'tool_' + tr.id,
        role: 'tool' as const,
        content: tr.result,
        tool_call_id: tr.id,
        name: tr.name,
        images: tr.images,
      }));
      setMessages([...baseMessages, assistantMsg, ...toolMsgs]);
    };
    const scheduleRender = () => {
      if (!rafScheduled) {
        rafScheduled = true;
        if (typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(flushRender);
        else rafId = setTimeout(flushRender, 16) as unknown as number;
      }
    };

    try {
      const result = streamText({
        model,
        system,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(effectiveMaxSteps),
        abortSignal: abortController.signal,
        temperature: llm.temperature !== undefined ? llm.temperature : 0.7,
        maxOutputTokens: llm.maxTokens !== undefined ? llm.maxTokens : 4096,
        // ── Context compaction: prune old messages when input tokens exceed threshold ──
        // pruneMessages in AI SDK v7 strips reasoning text and old tool call/result details
        // from earlier messages, keeping the context lean without losing factual content.
        // We trigger it when the previous step's input tokens crossed 20k.
        prepareStep: async ({ messages, steps }) => {
          const lastStep = steps.at(-1);
          if (lastStep?.usage?.inputTokens && lastStep.usage.inputTokens > 20000) {
            return {
              messages: pruneMessages({
                messages,
                reasoning: 'before-last-message',
                toolCalls: 'before-last-message',
                emptyMessages: 'remove',
              }),
            };
          }
          return {};
        },
        onError: (event) => {
          console.error('[Agent] streamText error:', event.error);
        },
        onChunk: (event) => {
          if (abortController.signal.aborted) return;
          const chunk = event.chunk;
          switch (chunk.type) {
            case 'text-delta':
              liveContent += chunk.text;
              scheduleRender();
              break;
            case 'reasoning-delta':
              // Accumulate reasoning text (provider-specific thinking models)
              liveReasoning += chunk.text;
              break;
            case 'tool-call':
              liveToolCalls.push({
                id: chunk.toolCallId,
                type: 'function',
                function: { name: chunk.toolName, arguments: JSON.stringify(chunk.input) },
              });
              scheduleRender();
              break;
            case 'tool-result': {
              // The SDK executed a tool; capture its result for UI display.
              // `output` is the raw return from the tool's execute() — a JSON string.
              const rawOutput = (chunk as any).output;
              const resultStr = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);
              let images: string[] | undefined;
              try {
                const parsed = JSON.parse(resultStr);
                if (parsed?.images && Array.isArray(parsed.images)) {
                  images = parsed.images.map((img: any) => typeof img === 'string' ? img : (img.url || img.filePath || img.outputPath)).filter(Boolean);
                } else if (parsed?.videos && Array.isArray(parsed.videos)) {
                  images = parsed.videos.map((v: any) => typeof v === 'string' ? v : (v.url || v.filePath || v.outputPath)).filter(Boolean);
                }
              } catch {}
              liveToolResults.push({ id: chunk.toolCallId, name: chunk.toolName, result: resultStr, images });
              scheduleRender();
              break;
            }
          }
        },
        onStepEnd: ({ text, usage, reasoningText, toolCalls }) => {
          // Accumulate token usage across all steps
          if (usage) {
            tokenUsageRef.current = {
              promptTokens: (tokenUsageRef.current?.promptTokens || 0) + (usage.inputTokens || 0),
              completionTokens: (tokenUsageRef.current?.completionTokens || 0) + (usage.outputTokens || 0),
              totalTokens: (tokenUsageRef.current?.totalTokens || 0) + (usage.totalTokens || 0),
            };
          }
          // After each step, carry forward the text/reasoning as the new baseline
          if (text) liveContent = text;
          if (reasoningText) liveReasoning = reasoningText;
          // If the step produced tool results but no final text, clear content
          if (toolCalls && toolCalls.length > 0 && !text) liveContent = '';
        },
      });

      // Wait for the full multi-step stream to complete
      await result.text;

      // Final flush
      if (rafId !== null) {
        if (typeof cancelAnimationFrame === 'function' && rafScheduled) cancelAnimationFrame(rafId);
        else if (typeof clearTimeout === 'function' && rafScheduled) clearTimeout(rafId);
        rafId = null; rafScheduled = false;
      }

      // Build the final assistant message(s)
      const finalAssistant: ChatMessage = {
        id: 'final_' + Date.now(),
        role: 'assistant',
        content: liveContent,
        reasoning_content: liveReasoning || undefined,
        tool_calls: liveToolCalls.length > 0 ? liveToolCalls : undefined,
      };
      const finalToolMsgs: ChatMessage[] = liveToolResults.map(tr => ({
        id: 'tool_final_' + tr.id,
        role: 'tool' as const,
        content: tr.result,
        tool_call_id: tr.id,
        name: tr.name,
        images: tr.images,
      }));

      // Hermes-style fallback: if no content and no tool calls, try parsing embedded calls
      if ((!finalAssistant.tool_calls || finalAssistant.tool_calls.length === 0)
          && finalAssistant.content
          && (finalAssistant.content.includes('<tool_call>') || finalAssistant.content.includes('\uFF5C\uFF5CDSML\uFF5C\uFF5Ctool_calls'))) {
        const parsed = parseEmbeddedToolCalls(finalAssistant.content);
        if (parsed.calls.length > 0) {
          finalAssistant.tool_calls = parsed.calls;
          finalAssistant.content = parsed.remaining.trim();
          console.warn(`[Agent] recovered ${parsed.calls.length} embedded tool_call(s) from content text`);
        }
      }

      // If the SDK completed tool calls but we need to manually execute embedded-recovered calls
      if (finalAssistant.tool_calls && finalAssistant.tool_calls.length > 0 && liveToolResults.length === 0) {
        // Execute recovered tool calls manually (the SDK didn't see them)
        for (const call of finalAssistant.tool_calls) {
          if (abortController.signal.aborted) break;
          let args: any = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
          const { resultStr, images } = await executeTool(call.function.name, args, {
            currentMessages: allMessages,
            mcpTools,
            addMessage,
          });
          finalToolMsgs.push({
            id: 'tool_recovered_' + call.id,
            role: 'tool',
            content: resultStr,
            tool_call_id: call.id,
            name: call.function.name,
            images,
          });
        }
        // Recurse: feed tool results back into a new round
        setMessages([...baseMessages, finalAssistant, ...finalToolMsgs]);
        if (!abortController.signal.aborted && finalAssistant.tool_calls.length > 0) {
          await runAgent([...allMessages, finalAssistant, ...finalToolMsgs]);
          return;
        }
      }

      setMessages([...baseMessages, finalAssistant, ...finalToolMsgs]);

      // Fallback token estimation if the provider didn't return usage
      if (!tokenUsageRef.current) {
        const inputChars = JSON.stringify(coreMessages).length;
        const outputChars = liveContent.length + JSON.stringify(liveToolCalls).length;
        tokenUsageRef.current = {
          promptTokens: Math.round(inputChars / 2.5),
          completionTokens: Math.round(outputChars / 2.5),
          totalTokens: Math.round((inputChars + outputChars) / 2.5),
        };
      }

    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('[Agent] error:', error);
      const raw = error.message || String(error);
      let friendly: string;
      if (/HTTP 5\d\d/.test(raw)) friendly = "AI 服务暂时不可用，请稍后重试。";
      else if (/Failed to fetch|NetworkError|timeout|ETIMEDOUT|ECONNRESET/i.test(raw)) friendly = "网络连接失败，请检查网络后重试。";
      else if (/HTTP 4\d\d/.test(raw)) friendly = "请求参数有误，请检查 LLM 配置或稍后重试。";
      else friendly = "AI 处理失败，请稍后重试。";
      setMessages([...allMessages, { id: Date.now().toString(), role: 'assistant', content: friendly }]);
    }
  };

  const sendMessage = async (text: string, imagesOrAttachments?: string[] | ChatAttachment[]) => {
    const attachments: ChatAttachment[] = [];
    if (imagesOrAttachments && imagesOrAttachments.length > 0) {
      for (const item of imagesOrAttachments) {
        if (typeof item === 'string') attachments.push({ path: item, name: 'image', mime: '', isImage: true });
        else attachments.push(item);
      }
    }

    if (!text.trim() && attachments.length === 0) return;

    const inlineTextExtensions = ['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'xml', 'svg', 'log'];
    let finalContent = text;
    const imagePaths: string[] = [];

    for (const att of attachments) {
      if (att.isImage) { imagePaths.push(att.path); continue; }
      const ext = att.name.split('.').pop()?.toLowerCase() || '';
      if (inlineTextExtensions.includes(ext)) {
        try {
          const fileContent = await invoke<string>('read_text_file', { path: att.path });
          const truncated = fileContent.length > 20000
            ? fileContent.substring(0, 20000) + `\n... [truncated, ${fileContent.length - 20000} more chars]`
            : fileContent;
          finalContent += `\n\n--- ${att.name} ---\n\`\`\`\n${truncated}\n\`\`\`\n`;
        } catch (e) { finalContent += `\n\n[Attachment ${att.name} could not be read: ${String(e)}]`; }
      } else {
        finalContent += `\n\n[Attached file: ${att.name} (binary, ${att.mime || ext})]`;
      }
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: finalContent,
      images: imagePaths.length > 0 ? imagePaths : undefined,
      files: attachments.filter(a => !a.isImage).length > 0 ? attachments.filter(a => !a.isImage) : undefined,
    };

    addMessage(userMsg);
    const newMessages = [...messages, userMsg];
    setIsGenerating(true);

    // Placeholder for "thinking..." feedback
    const placeholderId = 'pending_' + Date.now().toString();
    setMessages([...newMessages, { id: placeholderId, role: 'assistant', content: '', tool_calls: [] }]);

    abortControllerRef.current = new AbortController();
    tokenUsageRef.current = null;

    const trimmed = finalContent.trim();
    const looksLikeSceneRequest = trimmed.length > 12
      && !/^(你好|hello|hi|删除|生成图片|列表|帮助|help|谢谢|再见|bye|ok|好的|嗯|是|否)/i.test(trimmed.toLowerCase());

    try {
      if (looksLikeSceneRequest) {
        precheckRef.current = await rewriteQueryAndDetectCharacters(finalContent);
      } else {
        precheckRef.current = "";
      }
      await runAgent(newMessages);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      precheckRef.current = "";
    }
  };

  const stopGenerating = () => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort();
    }
    // Remove empty assistant placeholder
    const sess = useAgentStore.getState();
    if (sess.activeSessionId) {
      const current = sess.sessions.find(s => s.id === sess.activeSessionId);
      if (current) {
        const cleaned = current.messages.filter(m =>
          !(m.role === 'assistant' && (m.content ?? '') === '' && (!m.tool_calls || m.tool_calls.length === 0))
        );
        if (cleaned.length !== current.messages.length) {
          useAgentStore.getState().setMessages(cleaned);
        }
      }
    }
    setIsGenerating(false);
  };

  return {
    messages,
    isGenerating,
    sendMessage,
    stopGenerating,
    getTokenUsage: () => tokenUsageRef.current,
    resetTokenUsage: () => { tokenUsageRef.current = null; },
  };
}
