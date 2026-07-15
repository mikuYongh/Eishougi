/**
 * useTauriAgent — 核心 React hook，桥接 TauriAgent (AG-UI) 和 React UI。
 *
 * 严格按照 AG-UI 官方文档和 CLI 示例的模式：
 * - agent.messages 是消息的唯一真相源
 * - 先 agent.messages.push(userMsg)，再调 agent.runAgent({}, subscriber)
 * - 通过 subscriber 的类型化回调（onTextMessageContentEvent 等）驱动 UI 更新
 * - onMessagesChanged 回调同步 agent.messages → zustand store 供 React 渲染
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Message } from "@ag-ui/core";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAgentStore } from "../../stores/agentStore";
import { usePromptStore } from "../../stores/promptStore";
import { invoke } from "@tauri-apps/api/core";
import { TauriAgent, type ToolDef } from "../TauriAgent";
import { buildOutputSpec, type PromptSyntax } from "../../lib/agentPrompts";
import type { ChatMessage, ChatAttachment, TokenUsage, Suggestion, GenerationPreviewAttachment, CharacterCard } from "../types";

// ── Tool schema definitions ──
export function getToolDefinitions(): ToolDef[] {
  return [
    { type: "function", function: { name: "search_prompts", description: "Search for prompts by tags, keywords, or filters.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" }, description: "Tag list to filter by" }, limit: { type: "number", description: "Max results (default 20)" } } } } },
    { type: "function", function: { name: "get_prompt", description: "Get a specific prompt by ID.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "The prompt project ID (e.g. p_xxx)" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "create_prompt", description: "Create a new prompt project. CHARACTER PROTECTION: For named characters, use ONLY the character name tag.", parameters: { type: "object", properties: { title: { type: "string", description: "Project title" }, content: { type: "string", description: "Positive prompt text (Danbooru tags)" }, negative_prompt: { type: "string", description: "Negative prompt" }, artist_prompt: { type: "string", description: "Artist style tags" }, prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"], description: "Syntax mode" }, tags: { type: "array", items: { type: "string" }, description: "Category tags for organization" }, instance_images: { type: "array", items: { type: "string" }, description: "Reference image paths" }, base_model: { type: "string", description: "Checkpoint/base model filename" }, vae_model: { type: "string", description: "VAE model filename" }, lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string", description: "LoRA filename" }, strength: { type: "number", description: "Strength 0.0-2.0 (default 1.0)" }, enabled: { type: "boolean", description: "Whether this LoRA is active" } }, required: ["name", "strength", "enabled"] } }, width: { type: "number", description: "Image width px (e.g. 512, 768, 1024)" }, height: { type: "number", description: "Image height px" }, steps: { type: "number", description: "Sampling steps (typically 20-40)" }, cfg_scale: { type: "number", description: "CFG scale 1.0-20.0 (typically 5-8)" }, seed: { type: "string", description: "Random seed as string. Use '-1' for random." }, sampler_name: { type: "string", description: "Sampler name (e.g. euler, dpmpp_2m)" }, scheduler: { type: "string", description: "Scheduler (e.g. karras, normal)" }, workflow_id: { type: "string", description: "Custom workflow ID" } }, required: ["content"] } } },
    { type: "function", function: { name: "update_prompt_content", description: "Update the textual content of an existing project.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "The project ID to update" }, title: { type: "string", description: "New title" }, positive_prompt: { type: "string", description: "New positive prompt" }, negative_prompt: { type: "string", description: "New negative prompt" }, artist_prompt: { type: "string", description: "New artist tags" }, prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"], description: "Syntax mode" }, tags: { type: "array", items: { type: "string" }, description: "New tags" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "update_prompt_settings", description: "Update configuration settings of an existing project.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "The project ID to update" }, base_model: { type: "string", description: "Checkpoint filename" }, vae_model: { type: "string", description: "VAE filename" }, lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string", description: "LoRA filename" }, strength: { type: "number", description: "Strength 0.0-2.0" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } }, width: { type: "number", description: "Width px" }, height: { type: "number", description: "Height px" }, steps: { type: "number", description: "Sampling steps" }, cfg_scale: { type: "number", description: "CFG scale" }, seed: { type: "string", description: "Seed string ('-1' = random)" }, sampler_name: { type: "string", description: "Sampler" }, scheduler: { type: "string", description: "Scheduler" }, workflow_id: { type: "string", description: "Workflow ID" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "delete_prompt", description: "Delete an existing prompt.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "Project ID to delete" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "generate_image", description: "Generate an image. WAITS for completion and returns image paths. CRITICAL: Only pass prompt_id — all other params (model, size, steps, cfg, prompt, etc.) are read from the project's saved settings. Do NOT pass any optional param unless the user explicitly asked to change that specific param. Never invent or auto-fill parameters.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "The project to generate from" }, batch_count: { type: "number", description: "Number of images (default 1). Only set if user asks for multiple." }, base_model: { type: "string", description: "ONLY set if user explicitly asked to change the model. Otherwise omit — uses project's saved model." }, vae_model: { type: "string", description: "ONLY set if user explicitly asked to change VAE. Otherwise omit." }, lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } }, width: { type: "number", description: "ONLY set if user explicitly asked to change size. Otherwise omit." }, height: { type: "number", description: "ONLY set if user explicitly asked to change size. Otherwise omit." }, steps: { type: "number", description: "ONLY set if user explicitly asked to change steps. Otherwise omit." }, cfg_scale: { type: "number", description: "ONLY set if user explicitly asked to change CFG. Otherwise omit." }, seed: { type: "string", description: "ONLY set if user explicitly asked to use a specific seed. Otherwise omit (random)." }, sampler_name: { type: "string", description: "ONLY set if user explicitly asked to change sampler. Otherwise omit." }, scheduler: { type: "string", description: "ONLY set if user explicitly asked to change scheduler. Otherwise omit." }, positive_prompt: { type: "string", description: "ONLY set if user explicitly asked to modify the prompt. Otherwise omit — uses project's saved prompt." }, negative_prompt: { type: "string", description: "ONLY set if user explicitly asked to change negative prompt. Otherwise omit." }, artist_prompt: { type: "string", description: "ONLY set if user explicitly asked to change artist. Otherwise omit." }, workflow_id: { type: "string", description: "ONLY set if user explicitly asked to use a specific workflow. Otherwise omit." } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "generate_video_from_image", description: "Generate a video from an image. Source image is taken from the most recently generated image in the conversation.", parameters: { type: "object", properties: { prompt: { type: "string", description: "Motion/action description for the video" }, duration: { type: "number", description: "Video duration in seconds" }, fps: { type: "number", description: "Frames per second" }, base_model: { type: "string", description: "Video model" }, workflow_id: { type: "string", description: "Custom workflow ID" } }, required: ["prompt"] } } },
    { type: "function", function: { name: "get_queue_status", description: "Get generation queue status.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "search_workflows", description: "Search workflows.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" }, description: "Tags to filter" }, limit: { type: "number", description: "Max results" } } } } },
    { type: "function", function: { name: "get_workflow", description: "Get workflow by ID.", parameters: { type: "object", properties: { workflow_id: { type: "string", description: "Workflow ID" } }, required: ["workflow_id"] } } },
    { type: "function", function: { name: "create_workflow", description: "Create a workflow.", parameters: { type: "object", properties: { title: { type: "string", description: "Workflow name" }, description: { type: "string", description: "Description" }, workflow_json: { type: "object", description: "ComfyUI API JSON" }, tags: { type: "array", items: { type: "string" } } }, required: ["title"] } } },
    { type: "function", function: { name: "update_workflow", description: "Update a workflow.", parameters: { type: "object", properties: { workflow_id: { type: "string", description: "Workflow ID" }, title: { type: "string" }, description: { type: "string" }, workflow_json: { type: "object", description: "New ComfyUI API JSON" }, tags: { type: "array", items: { type: "string" } } }, required: ["workflow_id"] } } },
    { type: "function", function: { name: "delete_workflow", description: "Delete a workflow.", parameters: { type: "object", properties: { workflow_id: { type: "string", description: "Workflow ID" } }, required: ["workflow_id"] } } },
    { type: "function", function: { name: "get_generated_images", description: "Get generated images from history.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "Filter by project ID" }, limit: { type: "number", description: "Max images to return" } } } } },
    { type: "function", function: { name: "add_instance_image", description: "Add image to prompt's instance images (for img2img reference).", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "Project ID" }, image_url: { type: "string", description: "Image file path or URL" } }, required: ["prompt_id", "image_url"] } } },
    { type: "function", function: { name: "auto_tag_all_prompts", description: "Batch auto-tag all prompts using the tagger model.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "list_local_models", description: "List all local ComfyUI models (checkpoints, VAEs, LoRAs).", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "install_custom_node", description: "Install a ComfyUI custom node from a Git URL.", parameters: { type: "object", properties: { node_url: { type: "string", description: "Git repository URL" }, comfy_dir: { type: "string", description: "ComfyUI installation directory" } }, required: ["node_url"] } } },
    { type: "function", function: { name: "check_comfyui_status", description: "Check if ComfyUI is online and get system stats.", parameters: { type: "object", properties: { url: { type: "string", description: "Optional ComfyUI URL override (defaults to user settings)" } } } } },
    { type: "function", function: { name: "list_character_series", description: "List all available character series/copyrights (e.g. genshin_impact, blue_archive).", parameters: { type: "object", properties: { search: { type: "string", description: "Filter by name" }, limit: { type: "number", description: "Max results" }, offset: { type: "number", description: "Pagination offset" } } } } },
    { type: "function", function: { name: "search_characters_in_series", description: "Search for characters within a specific series.", parameters: { type: "object", properties: { series: { type: "string", description: "Series tag (e.g. genshin_impact)" }, search: { type: "string", description: "Character name to search" }, limit: { type: "number", description: "Max results" }, offset: { type: "number", description: "Pagination offset" } }, required: ["series"] } } },
    { type: "function", function: { name: "search_artists", description: "Search artists in the local database (15,000+ artists).", parameters: { type: "object", properties: { search: { type: "string", description: "Artist name to search" }, limit: { type: "number", description: "Max results" }, offset: { type: "number", description: "Pagination offset" } } } } },
    { type: "function", function: { name: "random_character_and_artist", description: "Get a random character and optionally a matching artist.", parameters: { type: "object", properties: { series: { type: "string", description: "Optional series to pick from" }, use_artist: { type: "boolean", description: "Also return a matching artist" } } } } },
    { type: "function", function: { name: "view_bookmarks", description: "View bookmarked/favorite characters ONLY.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" }, description: "Filter by tags" }, tag_match: { type: "string", enum: ["or", "and"], description: "Tag matching mode" }, search: { type: "string", description: "Search query" }, limit: { type: "number", description: "Max results" }, offset: { type: "number", description: "Pagination offset" } } } } },
    { type: "function", function: { name: "add_favorite_character", description: "Add a character to the favorites/bookmarks library.", parameters: { type: "object", properties: { character_tag: { type: "string", description: "Danbooru character tag" }, source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"], description: "Where the character was sourced from" }, display_name: { type: "string", description: "Display name" }, trigger: { type: "string", description: "Trigger words for LoRA" }, example_image: { type: "string", description: "Example image path (must already exist)" }, notes: { type: "string", description: "Notes" }, tags: { type: "array", items: { type: "string" }, description: "Tags" } }, required: ["character_tag"] } } },
    { type: "function", function: { name: "update_favorite_character", description: "Update a favorite character entry.", parameters: { type: "object", properties: { id: { type: "string", description: "Entry ID" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: { name: "remove_favorite_character", description: "Remove a character from favorites.", parameters: { type: "object", properties: { id: { type: "string", description: "Entry ID" }, character_tag: { type: "string", description: "Character tag (alternative to ID)" } } } } },
    { type: "function", function: { name: "relink_favorite_character", description: "Relink a favorite character to its source.", parameters: { type: "object", properties: { id: { type: "string", description: "Entry ID" } }, required: ["id"] } } },
    { type: "function", function: { name: "add_tags_to_favorite_character", description: "Add tags to a favorite character.", parameters: { type: "object", properties: { character_id: { type: "string", description: "Entry ID" }, tags: { type: "array", items: { type: "string" }, description: "Tags to add" } }, required: ["character_id", "tags"] } } },
    { type: "function", function: { name: "remove_tag_from_favorite_character", description: "Remove a tag from a favorite character.", parameters: { type: "object", properties: { character_id: { type: "string", description: "Entry ID" }, tag: { type: "string", description: "Tag to remove" } }, required: ["character_id", "tag"] } } },
    { type: "function", function: { name: "set_favorite_character_tags", description: "Set (replace) all tags for a favorite character.", parameters: { type: "object", properties: { character_id: { type: "string", description: "Entry ID" }, tags: { type: "array", items: { type: "string" }, description: "New tag list" } }, required: ["character_id", "tags"] } } },
    { type: "function", function: { name: "list_favorite_character_tags", description: "List all tags used across favorite characters.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "view_bookmarked_artists", description: "View bookmarked/favorite artists ONLY.", parameters: { type: "object", properties: { search: { type: "string", description: "Search query" }, limit: { type: "number", description: "Max results" }, offset: { type: "number", description: "Pagination offset" } } } } },
    { type: "function", function: { name: "add_favorite_artist", description: "Add an artist to favorites.", parameters: { type: "object", properties: { artist_tag: { type: "string", description: "Danbooru artist tag" }, source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"], description: "Source" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["artist_tag"] } } },
    { type: "function", function: { name: "update_favorite_artist", description: "Update a favorite artist entry.", parameters: { type: "object", properties: { id: { type: "string", description: "Entry ID" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: { name: "remove_favorite_artist", description: "Remove an artist from favorites.", parameters: { type: "object", properties: { id: { type: "string", description: "Entry ID" }, artist_tag: { type: "string", description: "Artist tag" } } } } },
    // ── 人机交互工具（client-defined tools）──
    // 这些工具由 AI 主动调用来触发前端 UI 交互。前端拦截这些调用，
    // 弹出对应的选择器/预览/建议 UI，用户交互后结果通过新消息返回给 AI。
    { type: "function", function: { name: "select_characters", description: "Open the character/artist library picker for the user to select from the local database of 36,000+ characters or 15,000+ artists. Use this when the user needs to choose specific characters or artists from search results. The picker supports multi-select, search, and series filtering.", parameters: { type: "object", properties: { kind: { type: "string", enum: ["character", "artist"], description: "Whether to show the character picker or artist picker" }, series: { type: "string", description: "Optional series/copyright filter to pre-select (e.g. 'genshin_impact', 'wuthering_waves')" } }, required: ["kind"] } } },
    { type: "function", function: { name: "show_suggestions", description: "Display a set of clickable suggestion buttons to the user. Each suggestion has a title (short Chinese name) and a message (full modification instruction with Danbooru tags). The user clicks one to apply it. Use this when you want to offer the user multiple differentiated options (e.g. different poses, scenes, outfits, expressions).", parameters: { type: "object", properties: { suggestions: { type: "array", items: { type: "object", properties: { title: { type: "string", description: "Short Chinese name (2-5 chars)" }, message: { type: "string", description: "Full modification instruction with Danbooru English tags, e.g. 'Change scene to bathroom, add tiles, shower, wet_skin and regenerate'" } }, required: ["title", "message"] } } }, required: ["suggestions"] } } },
    { type: "function", function: { name: "select_model", description: "Open a model picker for the user to choose a base model (checkpoint), VAE, or LoRA from their local ComfyUI models. ONLY use when the user explicitly mentions changing the MODEL ('换个模型', '换base model', '换checkpoint', '换VAE'). Do NOT use this for changing art style — '换画师风格'/'换画风' means changing the artist_prompt tags, use update_prompt_content instead.", parameters: { type: "object", properties: { prompt_id: { type: "string", description: "The prompt project to apply the selected model to" }, kind: { type: "string", enum: ["checkpoint", "vae", "lora"], description: "Type of model to pick. Default: checkpoint (base model)." } }, required: [] } } },
  ];
}

// ── AG-UI Message → ChatMessage 转换 ──
function aguiMessageToChatMessage(m: Message): ChatMessage {
  const msg: ChatMessage = {
    id: m.id,
    role: m.role as any,
    content: (m as any).content || "",
  };
  if ((m as any).toolCalls) {
    msg.tool_calls = (m as any).toolCalls.map((tc: any) => ({
      id: tc.id, type: "function", function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
  }
  if ((m as any).toolCallId) msg.tool_call_id = (m as any).toolCallId;
  if ((m as any).name) msg.name = (m as any).name;
  return msg;
}

export function useTauriAgent() {
  const { sessions, activeSessionId, addMessage, setMessages, settings: agentSettings, isGenerating, setIsGenerating } = useAgentStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  // 用 ref 持有最新的 agentSettings，让缓存的 TauriAgent 能读到实时值（如 focusMode 开关）
  const agentSettingsRef = useRef(agentSettings);
  agentSettingsRef.current = agentSettings;

  const agentRef = useRef<TauriAgent | null>(null);
  // systemPromptRef 始终指向最新的 buildSystemPrompt — agent 创建后不再重建，
  // 但 getSystemPrompt 回调通过 ref 读取最新值，确保 focusMode 等设置变更即时生效。
  const systemPromptRef = useRef<() => string>(() => "");
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activePreview, setActivePreview] = useState<GenerationPreviewAttachment | null>(null);
  // 角色/画师选择 Modal 状态：null=关闭；{open,kind}=打开
  const [characterModal, setCharacterModal] = useState<{ open: boolean; kind: "character" | "artist"; series?: string | null } | null>(null);
  // 模型选择器状态：null=关闭；{open,kind,promptId}=打开
  const [modelModal, setModelModal] = useState<{ open: boolean; kind: "checkpoint" | "vae" | "lora"; promptId?: string | null } | null>(null);
  const tokenUsageRef = useRef<TokenUsage | null>(null);
  // 当前 refine 维度（用户点了"推荐xx"后设置），用于 LLM 输出标记后追加"换一批"等操作
  const refineDimRef = useRef<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  // ── MCP tool discovery ──
  useEffect(() => {
    let cancelled = false;
    const sanitizeSchema = (schema: any): any => {
      if (!schema || typeof schema !== "object") return { type: "object", properties: {} };
      const cleaned: any = {};
      for (const key of Object.keys(schema)) {
        if (key === "$defs" || key === "$ref" || key === "$schema") continue;
        const val = schema[key];
        if (key === "anyOf" && Array.isArray(val)) cleaned.type = "string";
        else if (key === "allOf" && Array.isArray(val)) Object.assign(cleaned, sanitizeSchema(val.find((v: any) => v.type) || val[0] || {}));
        else if (key === "enum" && Array.isArray(val)) { cleaned[key] = val.filter((v: any) => typeof v === "string").slice(0, 50); if (!cleaned[key].length) delete cleaned[key]; }
        else if (typeof val === "object" && val !== null) cleaned[key] = sanitizeSchema(val);
        else cleaned[key] = val;
      }
      if (!cleaned.type) cleaned.type = "object";
      return cleaned;
    };
    const fetchMcpTools = async () => {
      const { mcpServers } = useSettingsStore.getState().settings;
      const enabled = mcpServers?.filter((s: any) => s.enabled) || [];
      if (!enabled.length) { setMcpTools([]); setMcpEnabled(false); return; }
      const all: any[] = [];
      for (const server of enabled) {
        try {
          const rustTools = await invoke<any[]>("list_mcp_tools", { url: server.url });
          for (const t of rustTools) {
            all.push({ type: "function", function: { name: t.name, description: (t.description || "").substring(0, 1024), parameters: sanitizeSchema(t.input_schema) || { type: "object", properties: {} } }, _mcp: { url: server.url } });
          }
        } catch (e) { console.warn(`[Agent] MCP "${server.name}" failed:`, e); }
      }
      if (!cancelled) { setMcpTools(all); setMcpEnabled(all.length > 0); }
    };
    fetchMcpTools();
    const unsub = useSettingsStore.subscribe((s, prev) => { if (s.settings.mcpServers !== prev.settings.mcpServers) fetchMcpTools(); });
    return () => { cancelled = true; unsub(); };
  }, []);

  // ── System prompt builder ──
  const buildSystemPrompt = useCallback(() => {
    let systemContext = "\n\n[System Context]";
    const match = window.location.pathname.match(/\/prompts\/(p_[a-zA-Z0-9_-]+)/);
    if (match) {
      systemContext += `\nThe user is viewing Prompt Project ID: ${match[1]}. Use update_prompt_content or update_prompt_settings on this ID.`;
      const activePrompt = usePromptStore.getState().prompts.find((p: any) => p.id === match[1]);
      if (activePrompt) {
        systemContext += `\n\n## SYNTAX MODE (${activePrompt.promptSyntax.toUpperCase()})`;
        systemContext += buildOutputSpec(activePrompt.promptSyntax as PromptSyntax);
      }
    } else {
      systemContext += "\nThe user is NOT viewing a specific prompt.";
      systemContext += buildOutputSpec("danbooru");
    }
    return agentSettings.systemPrompt + systemContext
      + "\n\n## ⛔ 生成参数保护规则（最高优先级）"
      + "\n**调用 generate_image 时，严禁擅自修改任何参数。** 只传 prompt_id，其余参数（model/width/height/steps/cfg/seed/sampler/prompt 等）全部留空，让系统从项目保存的设置读取。"
      + "\n只有在以下情况才能传某个参数：用户**明确**说了要改那个参数（如『把尺寸改成1024』『换个seed』）。"
      + "\n❌ 错误：generate_image(prompt_id=\"xxx\", width=1024, height=1024, steps=30) — 用户没要求改这些！"
      + "\n✅ 正确：generate_image(prompt_id=\"xxx\") — 用项目已有设置生成。"
      + "\n⚠️ 即使你觉得某个参数值不理想，也绝对不要自作主张调整——除非用户说了。"
      + "\n\n## 工具路由规则"
      + "\n用户问\"有什么角色\" → list_character_series"
      + "\n用户问\"有什么画师\" → search_artists"
      + "\nsearch_tags 等是可选 MCP 工具，可能不可用。报错时不要重试，改用自己的知识。"
      + "\n\n## 角色搜索兜底（重要）"
      + "\n本地角色图鉴只有 36,492 个角色，冷门角色可能搜不到。search_characters_in_series 返回空数组时："
      + "\n1. 先尝试用 MCP search_tags 搜索角色名（query=\"角色中文名\"），拿到准确的 Danbooru 英文 tag"
      + "\n2. 如果 search_tags 不可用或报错，最多再试 1 次 search_characters_in_series 用英文/日文原名"
      + "\n3. 都搜不到 → 用你自己的 Danbooru 知识推断角色 tag，创建 prompt 生成，告诉用户'用了推断的 tag，不准请纠正'"
      + "\n⚠️ 绝对不要因为搜不到角色就卡住问用户——先用自己的知识生成，让用户看结果再说。"
      + "\n\n## 人机交互工具（client-defined tools）"
      + "\n你有 4 个专门的交互工具，用于在需要时让用户参与决策。**由你决定何时调用**，不要等待用户指令。"
      + "\n"
      + "\n### select_characters（角色/画师选择器）"
      + "\n**搜索到角色后，直接调用 select_characters 让用户选。** 不要用文本列表展示角色让用户打字选——文本列表体验差，选择器支持搜索、多选、图片预览。"
      + "\n正确流程：用户说\"有什么角色\"→ search_characters_in_series 搜索 → 如果有结果，立即调用 select_characters(kind=\"character\", series=\"xxx\")。"
      + "\n选择器会弹出全屏界面，用户选好后会发消息告诉你选了谁，你再据此生成。"
      + "\n⚠️ 搜索返回空数组时不调 select_characters（空的选择器没意义）。"
      + "\n⚠️ 不要问用户\"要不要打开选择器\"——直接调。"
      + "\n"
      + "\n### 生图流程（专注模式）"
      + (agentSettings.focusMode
        ? "\n⚠️ 专注模式已开启。当你准备好生成图片时，【直接调用 generate_image 工具】，只传 prompt_id，不要传其他参数。"
        + "\n系统会自动拦截 generate_image 调用，从项目数据库读取真实参数弹出预览卡片让用户确认/修改，用户确认后系统自动执行生成。"
        + "\n你不需要等用户回复\"确认\"，也不需要调任何额外工具。直接调 generate_image(prompt_id=...) 即可。"
        + "\n❌ 错误做法：输出\"确认没问题跟我说\"然后等用户回复，或调用 confirm_generation"
        + "\n✅ 正确做法：直接调用 generate_image(prompt_id=...) 工具"
        : "\n当你准备调用 generate_image 时，直接调用即可，只传 prompt_id。系统会从项目读取已有参数，不需要你传。")
      + "\n"
      + "\n### show_suggestions（推荐方案）"
      + "\n当你想给用户展示多个可选的修改方案时调用（如推荐不同姿势/场景/服装/表情/玩法）。"
      + "\n⚠️ **每次 generate_image 成功生成图片后，必须调用 show_suggestions 展示后续建议。** 这是标准流程：生图 → 展示图片 → 调 show_suggestions 给出修改方向。"
      + "\n建议内容：4 个不同维度的修改方案（如换场景、换姿势、换服装、换表情），每个 title 简短中文名（2-5字），message 完整修改指令含 Danbooru 英文 tag。"
      + "\n用户点击其中一个后会发消息应用该方案。"
      + "\n示例：show_suggestions(suggestions=[{title:\"浴室\",message:\"把场景换成浴室，加上 tiles, shower, wet_skin 重新生成\"}, ...])"
      + "\n⚠️ 调用 show_suggestions 时不要同时调用 generate_image 或其他修改工具。"
      + "\n"
      + "\n### select_model（模型选择器）"
      + "\n当用户想换基础模型/VAE/LoRA 时调用。**仅在用户明确提到『模型』二字时使用**，例如\"换个模型\"、\"用XX模型\"、\"换个checkpoint\"。"
      + "\n⚠️ 区分：用户说\"换画师风格\"、\"换画风\"、\"换个风格\" → 这是改 artist_prompt（画师标签），用 update_prompt_content，**不是** select_model。"
      + "\n⚠️ 区分：用户说\"换LoRA\"、\"换个角色LoRA\" → 可以用 select_model(kind=\"lora\")。"
      + "\n用户选好后会发消息告诉你选了哪个模型，你再据此 update_prompt_settings。";
  }, [agentSettings.systemPrompt, agentSettings.focusMode]);

  // 保持 ref 指向最新的 buildSystemPrompt
  systemPromptRef.current = buildSystemPrompt;

  // ── 创建/复用 TauriAgent ──
  const getOrCreateAgent = useCallback((): TauriAgent => {
    if (agentRef.current) return agentRef.current;
    const agent = new TauriAgent({
      getLlmConfig: () => {
        const { llm } = useSettingsStore.getState().settings;
        return { apiUrl: llm.apiUrl, apiKey: llm.apiKey, model: llm.model, temperature: llm.temperature, maxTokens: llm.maxTokens, provider: llm.provider, reasoningEnabled: llm.reasoningEnabled ?? true };
      },
      getSystemPrompt: () => systemPromptRef.current(),
      getTools: getToolDefinitions,
      getMcpTools: () => mcpTools,
      getAgentSettings: () => {
        const s = agentSettingsRef.current;
        return { effort: s.effort, maxRounds: s.maxRounds, focusMode: s.focusMode };
      },
      onTokenUsage: (usage) => {
        tokenUsageRef.current = tokenUsageRef.current
          ? { promptTokens: tokenUsageRef.current.promptTokens + usage.promptTokens, completionTokens: tokenUsageRef.current.completionTokens + usage.completionTokens, totalTokens: tokenUsageRef.current.totalTokens + usage.totalTokens }
          : usage;
        setTokenUsage(tokenUsageRef.current);
      },
      addMessage: (msg) => {
        // video status messages etc.
        const sess = useAgentStore.getState();
        if (sess.activeSessionId) {
          const current = sess.sessions.find((s) => s.id === sess.activeSessionId);
          if (current) {
            useAgentStore.getState().setMessages([...current.messages, msg]);
          }
        }
      },
      getMessages: () => useAgentStore.getState().sessions.find((s) => s.id === useAgentStore.getState().activeSessionId)?.messages || [],
    });
    agentRef.current = agent;
    return agent;
  }, [agentSettings, mcpTools]);

  // ── 发送消息 ──
  // text: UI 显示的文本（也是默认 LLM 收到的内容）
  // options.displayText: 如果提供，UI 显示用 displayText，LLM 收到 text（用于内部指令）
  const sendMessage = useCallback(async (text: string, imagesOrAttachments?: string[] | ChatAttachment[], options?: { displayText?: string }) => {
    const displayText = options?.displayText || text;
    const attachments: ChatAttachment[] = [];
    if (imagesOrAttachments && imagesOrAttachments.length > 0) {
      for (const item of imagesOrAttachments) {
        if (typeof item === "string") attachments.push({ path: item, name: "image", mime: "", isImage: true });
        else attachments.push(item);
      }
    }
    if (!text.trim() && attachments.length === 0) return;

    const inlineTextExtensions = ["txt", "md", "json", "yaml", "yml", "csv", "html", "css", "js", "ts", "tsx", "jsx", "py", "rs", "java", "c", "cpp", "h", "sh", "xml", "svg", "log", "go", "kt", "swift", "php", "rb", "toml", "ini", "conf"];
    // LLM 收到的内容（含文件内容）；UI 显示只用原始 text
    let llmContent = text;
    const imagePaths: string[] = [];
    // 文件截断阈值 — 根据用户 maxTokens 设置动态计算，避免小 context 时上传大文件撑爆
    // 20000 字符 ≈ 5000 token（英文）/ 10000 token（中文），约占 8192 maxTokens 的 60-120%
    // 对小 context 用户适当降低，大 context 用户适当提高
    const maxTokens = useSettingsStore.getState().settings.llm.maxTokens ?? 8192;
    const fileCharLimit = Math.min(100000, Math.max(20000, Math.floor(maxTokens * 4)));
    for (const att of attachments) {
      if (att.isImage) { imagePaths.push(att.path); continue; }
      const ext = att.name.split(".").pop()?.toLowerCase() || "";
      if (inlineTextExtensions.includes(ext)) {
        try {
          const fileContent = await invoke<string>("read_text_file", { path: att.path });
          const truncated = fileContent.length > fileCharLimit
            ? fileContent.substring(0, fileCharLimit) + `\n... [truncated, original ${fileContent.length} chars, showed ${fileCharLimit}]`
            : fileContent;
          llmContent += `\n\n--- ${att.name} ---\n\`\`\`\n${truncated}\n\`\`\`\n`;
        } catch (e) { llmContent += `\n\n[Attachment ${att.name} read failed]`; }
      } else {
        llmContent += `\n\n[Attached file: ${att.name}]`;
      }
    }

    // ── 按照官方模式：构建 AG-UI user message，push 到 agent.messages ──
    const userMsgId = `user_${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: llmContent,
    } as Message;

    // 同步到 zustand store（用 ChatMessage 格式）— UI 只显示用户输入的文字，
    // 文件作为附件标签展示（files 字段），不把原始内容塞进 content
    const userChatMsg: ChatMessage = {
      id: userMsgId, role: "user", content: displayText,
      images: imagePaths.length > 0 ? imagePaths : undefined,
      files: attachments.filter((a) => !a.isImage).length > 0 ? attachments.filter((a) => !a.isImage) : undefined,
    };
    addMessage(userChatMsg);

    setIsGenerating(true);
    setSuggestions([]);
    setActivePreview(null);
    setCharacterModal(null);
    tokenUsageRef.current = null;
    setTokenUsage(null);

    const agent = getOrCreateAgent();

    // 设置 agent 的 messages 为当前会话的消息（AG-UI Message 格式）
    // 注意：syncAgentMessagesToStore 已将 reasoning/activity 消息过滤并合并到 assistant.reasoning_content，
    // 所以 store 里的 ChatMessage 只有 user/assistant/tool/system 角色。
    const rawMessages = useAgentStore.getState().sessions.find((s) => s.id === useAgentStore.getState().activeSessionId)?.messages || [];

    // 过滤悬空的 tool_calls / tool 结果 — 用户中途停止生成时可能留下
    // assistant 有 tool_calls 但后面没有对应的 tool 响应消息，这会让 API 报 400
    const validMessages = rawMessages.filter((m: ChatMessage) => {
      // tool 消息必须有 tool_call_id 且对应一条 assistant tool_calls，否则 API 报 400
      if (m.role === "tool") {
        // 没有 tool_call_id 的孤儿 tool 消息（静默执行 generate_image 产生的）直接移除
        if (!m.tool_call_id) return false;
        const hasMatchingCall = rawMessages.some((msg) =>
          msg.role === "assistant" && msg.tool_calls?.some((tc) => tc.id === m.tool_call_id)
        );
        if (!hasMatchingCall) return false;
      }
      if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        const hasAllResults = m.tool_calls.every((tc) =>
          rawMessages.some((msg) => msg.role === "tool" && msg.tool_call_id === tc.id)
        );
        if (!hasAllResults) return false;
      }
      return true;
    });

    // 如果过滤移除了坏消息，把清理后的列表写回 store（持久化修复，避免下次还出错）
    if (validMessages.length !== rawMessages.length) {
      setMessages(validMessages);
    }

    agent.messages = validMessages.map((m: ChatMessage) => {
      if (m.role === "tool") return { id: m.id, role: "tool" as const, content: m.content, toolCallId: m.tool_call_id || "" } as Message;
      if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        return { id: m.id, role: "assistant" as const, content: m.content || undefined, toolCalls: m.tool_calls.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.function.name, arguments: tc.function.arguments } })) } as Message;
      }
      // 刚 addMessage 的这条 user 消息：store 里 content 只有用户文字，
      // 但 LLM 需要含文件内容的 llmContent — 用 id 匹配替换
      // 同时带上 images 字段，供 TauriAgent 转成 OpenAI vision 多模态格式
      if (m.id === userMsgId) {
        return { id: m.id, role: "user" as const, content: llmContent, images: imagePaths.length > 0 ? imagePaths : undefined } as Message;
      }
      return { id: m.id, role: m.role as any, content: m.content || "" } as Message;
    });

    // 构建工具列表
    const tools = getToolDefinitions();
    const allTools = [...tools, ...mcpTools];

    try {
      // ── 按照官方 CLI 示例模式：runAgent({}, subscriber) ──
      // 关键：不手动改 agent.messages！apply() 内部会根据事件自动管理消息。
      // 我们只在 onMessagesChanged 里节流同步到 zustand store。
      let renderScheduled = false;
      const scheduleSync = () => {
        if (!renderScheduled) {
          renderScheduled = true;
          requestAnimationFrame(() => {
            renderScheduled = false;
            syncAgentMessagesToStore(agent, setMessages, activeSessionId);
          });
        }
      };

      // 收集 tool result 的 images（apply() 不知道 images，需要我们额外挂）
      const toolImagesMap = new Map<string, string[]>();

      await agent.runAgent(
        {
          tools: allTools.map((t: any) => ({
            name: t.function?.name || t.name,
            description: t.function?.description || t.description || "",
            parameters: t.function?.parameters || t.parameters || {},
          })),
        },
        {
          // ── 消息变更：节流同步到 store ──
          // apply() 会在每个 TEXT_MESSAGE_CHUNK / TOOL_CALL 等事件后更新 agent.messages，
          // 然后调用 onMessagesChanged。我们用 requestAnimationFrame 节流避免每 token 全量重渲染。
          onMessagesChanged: () => {
            scheduleSync();
          },
          // ── 工具结果：提取 images ──
          onToolCallResultEvent: ({ event }: any) => {
            try {
              const parsed = JSON.parse(event.content || "");
              if (parsed?.images && Array.isArray(parsed.images)) {
                toolImagesMap.set(event.toolCallId, parsed.images.map((img: any) => typeof img === "string" ? img : (img.url || img.filePath || img.outputPath)).filter(Boolean));
              } else if (parsed?.videos && Array.isArray(parsed.videos)) {
                toolImagesMap.set(event.toolCallId, parsed.videos.map((v: any) => typeof v === "string" ? v : (v.url || v.filePath || v.outputPath)).filter(Boolean));
              }
            } catch {}
            scheduleSync();
          },
          // ── 自定义事件 ──
          onCustomEvent: ({ event }: any) => {
            if (event.name === "suggestion") {
              const val = event.value;
              const FIXED_DIMS = [
                { title: "推荐场景", message: "推荐场景", confirm: true },
                { title: "推荐姿势", message: "推荐姿势", confirm: true },
                { title: "推荐服装", message: "推荐服装", confirm: true },
                { title: "推荐表情", message: "推荐表情", confirm: true },
                { title: "推荐玩法", message: "推荐玩法", confirm: true },
              ];
              if (val?._auto) {
                // generate_image 后兜底注入：只追加固定维度，不清空已有建议
                // （AI 可能已经通过 show_suggestions 给了具体建议，不应被覆盖）
                setSuggestions((prev) => {
                  // 如果已有 AI 给的具体建议（非纯固定维度），只追加固定维度中尚未出现的
                  if (prev.length > 0) {
                    const existingTitles = new Set(prev.map((s) => s.title));
                    const newDims = FIXED_DIMS.filter((d) => !existingTitles.has(d.title));
                    return newDims.length > 0 ? [...prev, ...newDims] : prev;
                  }
                  return [...val.items];
                });
              } else {
                // AI 通过 show_suggestions 给的具体建议 + 追加固定维度
                const aiSuggestions = [...(val || [])];
                if (refineDimRef.current && aiSuggestions.length > 0) {
                  const dim = refineDimRef.current;
                  aiSuggestions.push(
                    { title: `🔄 再推荐${dim}`, message: `__refine_again:${dim}`, confirm: true },
                    { title: "↩ 返回", message: `__refine_back`, confirm: true },
                  );
                  refineDimRef.current = null;
                }
                setSuggestions([...aiSuggestions, ...FIXED_DIMS]);
              }
            } else if (event.name === "gen_preview") {
              setActivePreview(event.value);
            } else if (event.name === "character_picker") {
              // AI 搜索后触发：带 kind + series（作品范围），Modal 用 series 预选筛选显示 LLM 搜出的那批
              setCharacterModal({
                open: true,
                kind: event.value?.kind === "artist" ? "artist" : "character",
                series: event.value?.series || null,
              });
            } else if (event.name === "model_picker") {
              setModelModal({
                open: true,
                kind: event.value?.kind || "checkpoint",
                promptId: event.value?.promptId || null,
              });
            } else if (event.name === "tool_images") {
              // 工具执行返回的图片路径 — 挂到 toolImagesMap 供后续 syncAgentMessagesToStore 使用
              if (event.value?.toolCallId && Array.isArray(event.value?.images)) {
                toolImagesMap.set(event.value.toolCallId, event.value.images);
              }
            }
          },
        },
      );

      // 最终同步一次（确保 tool images 挂上）
      syncAgentMessagesToStore(agent, setMessages, activeSessionId, toolImagesMap);
    } catch (error: any) {
      console.error("[useTauriAgent] runAgent error:", error);
      const raw = error.message || String(error);
      let friendly: string;
      // 尝试提取 API 返回的 JSON error message
      const httpMatch = raw.match(/HTTP (\d+).*?\{.*"message"\s*:\s*"([^"]+)"/s);
      if (httpMatch) {
        const status = parseInt(httpMatch[1]);
        const apiMsg = httpMatch[2];
        if (status >= 500) friendly = `AI 服务暂时不可用 (HTTP ${status})：${apiMsg}`;
        else if (status >= 400) friendly = `请求错误 (HTTP ${status})：${apiMsg}`;
        else friendly = `AI 处理失败：${apiMsg}`;
      } else if (/Failed to fetch|NetworkError|timeout|ETIMEDOUT|ECONNRESET/i.test(raw)) {
        friendly = "网络连接失败，请检查网络后重试。";
      } else {
        friendly = `AI 处理失败：${raw.substring(0, 200)}`;
      }
      // 把错误信息追加到当前 store（不碰 agent.messages，避免和 apply 打架）
      const sess = useAgentStore.getState();
      if (sess.activeSessionId) {
        const current = sess.sessions.find((s) => s.id === sess.activeSessionId);
        if (current) {
          setMessages([...current.messages, { id: `err_${Date.now()}`, role: "assistant", content: friendly }]);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  }, [activeSessionId, addMessage, setMessages, setIsGenerating, getOrCreateAgent, mcpTools]);

  // ── 停止生成 ──
  const stopGenerating = useCallback(() => {
    if (agentRef.current) {
      // AG-UI 的正确停止方式：detachActiveRun() 触发 activeRunDetach$ 信号，
      // 管道里的 takeUntil 立即取消订阅 → run() 的 teardown 执行 → aborted = true。
      // AbstractAgent.abortRun() 是空方法，不会做任何事。
      agentRef.current.detachActiveRun();
    }
    const sess = useAgentStore.getState();
    if (sess.activeSessionId) {
      const current = sess.sessions.find((s) => s.id === sess.activeSessionId);
      if (current) {
        const cleaned = current.messages.filter((m) => {
          // 清理空 content 的 assistant 占位符
          if (m.role === "assistant" && (m.content ?? "") === "" && (!m.tool_calls || m.tool_calls.length === 0)) {
            return false;
          }
          // 清理悬空的 tool_calls — assistant 有 tool_calls 但后面没有对应的 tool 结果
          // 这会在用户中途停止生成时留下，导致下次发消息时 API 400
          if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
            const toolCallIds = m.tool_calls.map((tc) => tc.id);
            const hasAllResults = toolCallIds.every((id) =>
              current.messages.some((msg) => msg.role === "tool" && msg.tool_call_id === id)
            );
            if (!hasAllResults) return false;
          }
          // 同时清理悬空的 tool 结果（对应的 assistant tool_calls 已被移除）
          if (m.role === "tool" && m.tool_call_id) {
            const hasMatchingCall = current.messages.some((msg) =>
              msg.role === "assistant" && msg.tool_calls?.some((tc) => tc.id === m.tool_call_id)
            );
            if (!hasMatchingCall) return false;
          }
          return true;
        });
        if (cleaned.length !== current.messages.length) {
          useAgentStore.getState().setMessages(cleaned);
        }
      }
    }
    setIsGenerating(false);
  }, [setIsGenerating]);

  // ── 会话切换时重置 ──
  useEffect(() => {
    tokenUsageRef.current = null;
    setTokenUsage(null);
    setSuggestions([]);
    setActivePreview(null);
    setCharacterModal(null);
    setModelModal(null);
    refineDimRef.current = null;
    // 切会话时清空 agent 实例（释放 _imageCache 内存，避免旧会话图片缓存串扰新会话）
    if (agentRef.current) {
      agentRef.current = null;
    }
  }, [activeSessionId]);

  // ── 审批操作 ──
  // approvePreview: 用户确认预览后，把用户编辑过的参数先持久化到 DB，
  // 再唤醒当前等待中的 generate_image 工具调用。
  const approvePreview = useCallback(async (editedPreview?: GenerationPreviewAttachment) => {
    const preview = editedPreview || activePreview;
    if (!preview) return;
    setActivePreview(null);

    // 用户在预览界面编辑过参数 → 先写回 DB，否则 LLM 后续 generate_image 只会读到旧值
    if (editedPreview && preview.promptId) {
      try {
        const current = await invoke("get_prompt", { id: preview.promptId }) as any;
        if (current) {
          const updated = {
            ...current,
            positivePrompt: editedPreview.prompt ?? current.positivePrompt,
            negativePrompt: editedPreview.negativePrompt ?? current.negativePrompt,
            artistPrompt: editedPreview.artistPrompt ?? current.artistPrompt,
            baseModel: editedPreview.model ?? current.baseModel,
            width: editedPreview.width ?? current.width,
            height: editedPreview.height ?? current.height,
            steps: editedPreview.steps ?? current.steps,
            cfgScale: editedPreview.cfgScale ?? current.cfgScale,
            samplerName: editedPreview.sampler ?? current.samplerName ?? current.sampler,
            sampler: editedPreview.sampler ?? current.sampler ?? current.samplerName,
            scheduler: editedPreview.scheduler ?? current.scheduler,
            loraConfigs: editedPreview.loras ? JSON.stringify(editedPreview.loras) : current.loraConfigs,
            updatedAt: Date.now(),
          };
          await invoke("update_prompt", { prompt: updated });
          usePromptStore.getState().fetchPrompts();
        }
      } catch (e) {
        console.error("[approvePreview] 持久化用户编辑失败:", e);
      }
    }

    const agent = getOrCreateAgent();
    const resumed = agent.resolveGenerationPreview(preview.previewId, true);
    if (!resumed) {
      console.warn("[approvePreview] 预览请求已结束，未发送重复确认请求", preview.previewId);
    }
  }, [activePreview, getOrCreateAgent]);

  const rejectPreview = useCallback(() => {
    if (activePreview) {
      getOrCreateAgent().resolveGenerationPreview(activePreview.previewId, false);
    }
    setActivePreview(null);
  }, [activePreview, getOrCreateAgent]);

  // ── 角色/画师选择（多选）──
  // confirmCharacters: Modal 确认后把选中项作为用户消息发给 LLM
  const confirmCharacters = useCallback((cards: CharacterCard[]) => {
    setCharacterModal(null);
    if (cards.length === 0) return;
    const isArtist = characterModal?.kind === "artist";
    const names = cards.map((c) => c.name).join("、");
    const triggers = cards.map((c) => c.trigger || c.nameEn || c.name).join(", ");
    const noun = isArtist ? "画师" : "角色";
    const message =
      cards.length === 1
        ? `我选择${noun} ${cards[0].name}（触发词: ${triggers}），请用这个${noun}继续`
        : `我选择了以下 ${cards.length} 个${noun}：${names}（触发词: ${triggers}），请结合这些${noun}继续`;
    sendMessage(message);
  }, [sendMessage, characterModal?.kind]);

  // openCharacterLibrary: 用户主动从工具栏打开 Modal
  const openCharacterLibrary = useCallback((kind: "character" | "artist" = "character") => {
    setCharacterModal({ open: true, kind });
  }, []);

  // closeCharacterModal: 关闭 Modal（取消）
  const closeCharacterModal = useCallback(() => {
    setCharacterModal(null);
  }, []);

  // confirmModel: 用户选好模型后，把选择作为消息发给 AI
  const confirmModel = useCallback((modelName: string, kind: string) => {
    setModelModal(null);
    if (!modelName) return;
    const kindLabel = kind === "vae" ? "VAE" : kind === "lora" ? "LoRA" : "基础模型";
    const message = `我选择了${kindLabel}：${modelName}${modelModal?.promptId ? `（项目 ${modelModal.promptId}）` : ""}，请用这个模型继续。`;
    sendMessage(message);
  }, [sendMessage, modelModal?.promptId]);

  const closeModelModal = useCallback(() => {
    setModelModal(null);
  }, []);

  // refineSuggestion: 用户点击模糊建议（如"推荐场景"）→ 让 AI 推荐具体方案。
  // AI 会调用 show_suggestions 工具展示具体选项，用户再点选其中一个执行。
  const refineSuggestion = useCallback((sug: Suggestion) => {
    // 特殊操作：返回
    if (sug.message === "__refine_back") {
      setSuggestions([]);
      return;
    }
    // 换一批
    if (sug.message?.startsWith("__refine_again:")) {
      const dim = sug.message.replace("__refine_again:", "");
      refineDimRef.current = dim;
      setSuggestions([]);
      sendMessage(
        `用户对上一批${dim}推荐不满意，请重新推荐 4 个完全不同的${dim}方案。调用 show_suggestions 展示，不要直接生成图片。`,
        undefined,
        { displayText: `再推荐${dim}` }
      );
      return;
    }
    setSuggestions([]);
    // "推荐场景" → "场景"
    const dim = sug.title.replace(/^推荐/, "").replace(/^[^\u4e00-\u9fa5a-z]+/i, "").trim();
    refineDimRef.current = dim;
    sendMessage(
      `用户想让你推荐${dim}方案。请基于当前画面推荐 4 个不同的${dim}方案，调用 show_suggestions 工具展示给用户。不要直接生成图片。`,
      undefined,
      { displayText: `推荐${dim}` }
    );
  }, [sendMessage]);

  return {
    messages,
    isGenerating,
    sendMessage,
    stopGenerating,
    getTokenUsage: () => tokenUsage,
    resetTokenUsage: () => { tokenUsageRef.current = null; setTokenUsage(null); },
    tokenUsage,
    suggestions,
    clearSuggestions: () => setSuggestions([]),
    refineSuggestion,
    activePreview,
    approvePreview,
    rejectPreview,
    characterModal,
    confirmCharacters,
    openCharacterLibrary,
    closeCharacterModal,
    modelModal,
    confirmModel,
    closeModelModal,
    mcpEnabled,
  };
}

// ── 辅助：把 agent.messages 同步到 zustand store ──
// AG-UI apply() 会为 reasoning 内容创建独立的 role:"reasoning" 消息（有自己的 messageId）。
// 我们需要把这些 reasoning 消息的内容合并到相邻的 assistant 消息的 reasoning_content 字段里，
// 而不是让它们作为独立消息渲染（MessageBubble 不处理 role:"reasoning" 独立渲染）。
function syncAgentMessagesToStore(
  agent: TauriAgent,
  setMessages: (msgs: ChatMessage[]) => void,
  activeSessionId: string | null,
  toolImagesMap?: Map<string, string[]>,
) {
  if (!activeSessionId) return;
  // 取 store 里现有的消息，用于保留 user 消息的 UI content（不含文件内容）
  const existingMsgs = useAgentStore.getState().sessions.find((s) => s.id === activeSessionId)?.messages || [];
  const existingMap = new Map(existingMsgs.map((m) => [m.id, m]));

  const rawMsgs = agent.messages;
  // 收集 reasoning 消息内容，按顺序合并到下一个 assistant 消息
  const reasoningContents: string[] = [];
  const chatMsgs: ChatMessage[] = [];

  for (const m of rawMsgs) {
    // reasoning 消息不直接渲染，收集内容
    if (m.role === "reasoning") {
      const content = (m as any).content || "";
      if (content) reasoningContents.push(content);
      continue;
    }
    // activity 消息也不直接渲染
    if (m.role === "activity") continue;

    const cm = aguiMessageToChatMessage(m);

    // user 消息：agent.messages 里的 content 含文件内容（给 LLM 的），
    // 但 UI 只应显示用户输入的文字 — 保留 store 里原有的 content / files / images
    if (m.role === "user" && existingMap.has(m.id)) {
      const existing = existingMap.get(m.id)!;
      cm.content = existing.content;
      if (existing.files) cm.files = existing.files;
      if (existing.images) cm.images = existing.images;
    }

    // 如果是 assistant 消息且有待合并的 reasoning 内容，附加上去
    if (m.role === "assistant" && reasoningContents.length > 0) {
      cm.reasoning_content = reasoningContents.join("\n");
      reasoningContents.length = 0; // 清空
    }

    // 把 tool result 提取的 images 挂到对应的 tool 消息上
    if (m.role === "tool" && (m as any).toolCallId && toolImagesMap) {
      const imgs = toolImagesMap.get((m as any).toolCallId);
      if (imgs) cm.images = imgs;
    }
    chatMsgs.push(cm);
  }

  // 如果 reasoning 内容没找到对应的 assistant 消息（如纯 reasoning 后出错），
  // 也不丢弃——附加到最后一条 assistant 消息上，或创建一条占位消息
  if (reasoningContents.length > 0) {
    const lastAssistant = [...chatMsgs].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      lastAssistant.reasoning_content = (lastAssistant.reasoning_content || "")
        ? lastAssistant.reasoning_content + "\n" + reasoningContents.join("\n")
        : reasoningContents.join("\n");
    }
  }

  setMessages(chatMsgs);
}
