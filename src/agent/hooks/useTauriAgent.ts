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
    { type: "function", function: { name: "search_prompts", description: "Search for prompts by tags, keywords, or filters.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, limit: { type: "number" } } } } },
    { type: "function", function: { name: "get_prompt", description: "Get a specific prompt by ID.", parameters: { type: "object", properties: { prompt_id: { type: "string" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "create_prompt", description: "Create a new prompt project. CHARACTER PROTECTION: For named characters, use ONLY the character name tag.", parameters: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, negative_prompt: { type: "string" }, artist_prompt: { type: "string" }, prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"] }, tags: { type: "array", items: { type: "string" } }, instance_images: { type: "array", items: { type: "string" } }, base_model: { type: "string" }, vae_model: { type: "string" }, lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } }, width: { type: "number" }, height: { type: "number" }, steps: { type: "number" }, cfg_scale: { type: "number" }, seed: { type: "string" }, sampler_name: { type: "string" }, scheduler: { type: "string" }, workflow_id: { type: "string" } }, required: ["content"] } } },
    { type: "function", function: { name: "update_prompt_content", description: "Update the textual content of an existing project.", parameters: { type: "object", properties: { prompt_id: { type: "string" }, title: { type: "string" }, positive_prompt: { type: "string" }, negative_prompt: { type: "string" }, artist_prompt: { type: "string" }, prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"] }, tags: { type: "array", items: { type: "string" } } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "update_prompt_settings", description: "Update configuration settings of an existing project.", parameters: { type: "object", properties: { prompt_id: { type: "string" }, base_model: { type: "string" }, vae_model: { type: "string" }, lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } }, width: { type: "number" }, height: { type: "number" }, steps: { type: "number" }, cfg_scale: { type: "number" }, seed: { type: "string" }, sampler_name: { type: "string" }, scheduler: { type: "string" }, workflow_id: { type: "string" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "delete_prompt", description: "Delete an existing prompt.", parameters: { type: "object", properties: { prompt_id: { type: "string" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "generate_image", description: "Generate an image. WAITS for completion and returns image paths.", parameters: { type: "object", properties: { prompt_id: { type: "string" }, batch_count: { type: "number" }, base_model: { type: "string" }, vae_model: { type: "string" }, lora_configs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, strength: { type: "number" }, enabled: { type: "boolean" } }, required: ["name", "strength", "enabled"] } }, width: { type: "number" }, height: { type: "number" }, steps: { type: "number" }, cfg_scale: { type: "number" }, seed: { type: "string" }, sampler_name: { type: "string" }, scheduler: { type: "string" }, positive_prompt: { type: "string" }, negative_prompt: { type: "string" }, artist_prompt: { type: "string" }, workflow_id: { type: "string" } }, required: ["prompt_id"] } } },
    { type: "function", function: { name: "generate_video_from_image", description: "Generate a video from an image. Source image taken from most recent image.", parameters: { type: "object", properties: { prompt: { type: "string" }, duration: { type: "number" }, fps: { type: "number" }, base_model: { type: "string" }, workflow_id: { type: "string" } }, required: ["prompt"] } } },
    { type: "function", function: { name: "get_queue_status", description: "Get generation queue status.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "search_workflows", description: "Search workflows.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, limit: { type: "number" } } } } },
    { type: "function", function: { name: "get_workflow", description: "Get workflow by ID.", parameters: { type: "object", properties: { workflow_id: { type: "string" } }, required: ["workflow_id"] } } },
    { type: "function", function: { name: "create_workflow", description: "Create a workflow.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, workflow_json: { type: "object" }, tags: { type: "array", items: { type: "string" } } }, required: ["title"] } } },
    { type: "function", function: { name: "update_workflow", description: "Update a workflow.", parameters: { type: "object", properties: { workflow_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, workflow_json: { type: "object" }, tags: { type: "array", items: { type: "string" } } }, required: ["workflow_id"] } } },
    { type: "function", function: { name: "delete_workflow", description: "Delete a workflow.", parameters: { type: "object", properties: { workflow_id: { type: "string" } }, required: ["workflow_id"] } } },
    { type: "function", function: { name: "get_generated_images", description: "Get generated images from history.", parameters: { type: "object", properties: { prompt_id: { type: "string" }, limit: { type: "number" } } } } },
    { type: "function", function: { name: "add_instance_image", description: "Add image to prompt's instance images.", parameters: { type: "object", properties: { prompt_id: { type: "string" }, image_url: { type: "string" } }, required: ["prompt_id", "image_url"] } } },
    { type: "function", function: { name: "auto_tag_all_prompts", description: "Batch auto-tag all prompts.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "list_local_models", description: "List local models.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "install_custom_node", description: "Install ComfyUI custom node.", parameters: { type: "object", properties: { node_url: { type: "string" }, comfy_dir: { type: "string" } }, required: ["node_url"] } } },
    { type: "function", function: { name: "check_comfyui_status", description: "Check ComfyUI status.", parameters: { type: "object", properties: { url: { type: "string" } } } } },
    { type: "function", function: { name: "list_character_series", description: "List character series.", parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } } },
    { type: "function", function: { name: "search_characters_in_series", description: "Search characters in series.", parameters: { type: "object", properties: { series: { type: "string" }, search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["series"] } } },
    { type: "function", function: { name: "search_artists", description: "Search artists.", parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } } },
    { type: "function", function: { name: "random_character_and_artist", description: "Random character + artist.", parameters: { type: "object", properties: { series: { type: "string" }, use_artist: { type: "boolean" } } } } },
    { type: "function", function: { name: "view_bookmarks", description: "ONLY for bookmarks.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, tag_match: { type: "string", enum: ["or", "and"] }, search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } } },
    { type: "function", function: { name: "add_favorite_character", description: "Add favorite character.", parameters: { type: "object", properties: { character_tag: { type: "string" }, source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"] }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["character_tag"] } } },
    { type: "function", function: { name: "update_favorite_character", description: "Update favorite character.", parameters: { type: "object", properties: { id: { type: "string" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: { name: "remove_favorite_character", description: "Remove favorite character.", parameters: { type: "object", properties: { id: { type: "string" }, character_tag: { type: "string" } } } } },
    { type: "function", function: { name: "relink_favorite_character", description: "Relink favorite character.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: { name: "add_tags_to_favorite_character", description: "Add tags to favorite.", parameters: { type: "object", properties: { character_id: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["character_id", "tags"] } } },
    { type: "function", function: { name: "remove_tag_from_favorite_character", description: "Remove tag from favorite.", parameters: { type: "object", properties: { character_id: { type: "string" }, tag: { type: "string" } }, required: ["character_id", "tag"] } } },
    { type: "function", function: { name: "set_favorite_character_tags", description: "Set favorite tags.", parameters: { type: "object", properties: { character_id: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["character_id", "tags"] } } },
    { type: "function", function: { name: "list_favorite_character_tags", description: "List favorite tags.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "view_bookmarked_artists", description: "Bookmarked artists.", parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } } },
    { type: "function", function: { name: "add_favorite_artist", description: "Add favorite artist.", parameters: { type: "object", properties: { artist_tag: { type: "string" }, source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"] }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["artist_tag"] } } },
    { type: "function", function: { name: "update_favorite_artist", description: "Update favorite artist.", parameters: { type: "object", properties: { id: { type: "string" }, display_name: { type: "string" }, trigger: { type: "string" }, example_image: { type: "string" }, notes: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: { name: "remove_favorite_artist", description: "Remove favorite artist.", parameters: { type: "object", properties: { id: { type: "string" }, artist_tag: { type: "string" } } } } },
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
  const tokenUsageRef = useRef<TokenUsage | null>(null);
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
      + "\n\n## 工具路由规则"
      + "\n用户问\"有什么角色\" → list_character_series"
      + "\n用户问\"有什么画师\" → search_artists"
      + "\nsearch_tags 等是可选 MCP 工具，可能不可用。报错时不要重试，改用自己的知识。"
      + "\n\n## 人机交互标记（重要）"
      + "\n你可以在回复文本中输出特殊标记来触发富 UI 交互。标记不会显示给用户，而是被前端拦截并渲染为交互卡片。"
      + "\n标记格式：<<<MARKER_NAME:JSON>>>"
      + "\n"
      + "\n### 1. 生图流程（专注模式）"
      + (agentSettings.focusMode
        ? "\n⚠️ 专注模式已开启。当你准备好生成图片时，【直接调用 generate_image 工具】，不要用文本说\"确认生成\"等用户回复。"
        + "\n系统会自动拦截 generate_image 调用，弹出参数预览卡片让用户确认/修改，用户确认后系统自动执行生成。"
        + "\n你不需要输出任何标记，不需要等用户回复\"确认\"。直接调工具即可。"
        + "\n❌ 错误做法：输出\"确认没问题跟我说确认生成\"然后等用户回复"
        + "\n✅ 正确做法：直接调用 generate_image(prompt_id=...) 工具"
        : "\n当你准备调用 generate_image 时，直接调用即可，不需要等用户确认。")
      + "\n"
      + "\n### 2. 生成后建议（suggestion）"
      + "\n每次调用 generate_image 完成后，【必须】在回复末尾输出 suggestion 标记，给出 4 个后续建议。"
      + "\n⚠️ 建议的前 3 个必须是以下三个维度（根据当前画面给出具体内容），第 4 个自由发挥："
      + "\n  1. 换场景 — 给出具体的新场景，如\"换成浴室场景，加上 tiles、shower、wet_skin\""
      + "\n  2. 换姿势 — 给出具体的新姿势，如\"改成 missionary 传教士姿势、正面视角\""
      + "\n  3. 换角色/服装 — 给出具体的角色或服装变化，如\"换成比基尼\"或\"换成拉菲改造版\""
      + "\n  4. 自由建议 — 画师风格、构图、其他"
      + "\n⚠️ message 字段是用户点击后直接发给你的完整指令——必须写清楚具体改什么，不能笼统。"
      + "\n⚠️ title 字段只放纯文字标签，不要加 emoji 图标（emoji 会自动从 message 匹配）。"
      + "\n格式：<<<SUGGESTION:[{\"title\":\"浴室场景\",\"message\":\"把场景换成浴室，加上 tiles、shower、wet_skin 重新生成\"},{\"title\":\"传教士\",\"message\":\"改成 missionary 传教士姿势、正面视角重新生成\"},{\"title\":\"换比基尼\",\"message\":\"服装换成比基尼重新生成\"},{\"title\":\"横版\",\"message\":\"改成横版 1216×832 重新生成\"}]>>>"
      + "\n⚠️ 不要把建议写成普通文本！必须用 <<<SUGGESTION:...>>> 标记输出，否则不会显示为可点击的建议条。"
      + "\n"
      + "\n### 3. 角色选择器（自动触发，无需你输出标记）"
      + "\n当你调用 search_characters_in_series 或 search_artists 后，系统会【自动】弹出角色/画师选择器（全屏 Modal，直连本地 36,492 角色 + 15,000 画师图鉴，支持搜索/作品筛选/多选）。用户在里面选好后会发消息告诉你选了谁，你再据此生成。"
      + "\n⚠️ 你不需要、也不应该输出 <<<CHARACTER_PICKER:>>> 标记。搜索完角色后直接用文字总结结果即可，选择器会自动出现。"
      + "\n"
      + "\n⚠️ 标记（<<<SUGGESTION:>>>）必须在一行内完整输出，不要跨行。JSON 必须合法。标记外的文本正常显示。";
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
      getAgentSettings: () => agentSettings,
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
  const sendMessage = useCallback(async (text: string, imagesOrAttachments?: string[] | ChatAttachment[]) => {
    const attachments: ChatAttachment[] = [];
    if (imagesOrAttachments && imagesOrAttachments.length > 0) {
      for (const item of imagesOrAttachments) {
        if (typeof item === "string") attachments.push({ path: item, name: "image", mime: "", isImage: true });
        else attachments.push(item);
      }
    }
    if (!text.trim() && attachments.length === 0) return;

    const inlineTextExtensions = ["txt", "md", "json", "yaml", "yml", "csv", "html", "css", "js", "ts", "tsx", "jsx", "py", "rs", "java", "c", "cpp", "h", "sh", "xml", "svg", "log"];
    let finalContent = text;
    const imagePaths: string[] = [];
    for (const att of attachments) {
      if (att.isImage) { imagePaths.push(att.path); continue; }
      const ext = att.name.split(".").pop()?.toLowerCase() || "";
      if (inlineTextExtensions.includes(ext)) {
        try {
          const fileContent = await invoke<string>("read_text_file", { path: att.path });
          const truncated = fileContent.length > 20000 ? fileContent.substring(0, 20000) + `\n... [truncated]` : fileContent;
          finalContent += `\n\n--- ${att.name} ---\n\`\`\`\n${truncated}\n\`\`\`\n`;
        } catch (e) { finalContent += `\n\n[Attachment ${att.name} read failed]`; }
      } else {
        finalContent += `\n\n[Attached file: ${att.name}]`;
      }
    }

    // ── 按照官方模式：构建 AG-UI user message，push 到 agent.messages ──
    const userMsgId = `user_${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: finalContent,
    } as Message;

    // 同步到 zustand store（用 ChatMessage 格式）
    const userChatMsg: ChatMessage = {
      id: userMsgId, role: "user", content: finalContent,
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
              // 替换而非追加：每次 generate_image 后只展示一组建议，避免重复
              setSuggestions([...(event.value || [])]);
            } else if (event.name === "gen_preview") {
              setActivePreview(event.value);
            } else if (event.name === "character_picker") {
              // AI 搜索后触发：带 kind + series（作品范围），Modal 用 series 预选筛选显示 LLM 搜出的那批
              setCharacterModal({
                open: true,
                kind: event.value?.kind === "artist" ? "artist" : "character",
                series: event.value?.series || null,
              });
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
      agentRef.current.abortRun();
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
  }, [activeSessionId]);

  // ── 审批操作 ──
  // approvePreview: 用户确认预览后，把确认意图 + userNote 作为用户消息发给 LLM，
  // 让 LLM 处理修改需求并自己调 generate_image。
  // 设置 skipNextPreview 让 TauriAgent 跳过下一次 generate_image 的预览拦截。
  const approvePreview = useCallback((editedPreview?: GenerationPreviewAttachment, userNote?: string) => {
    const preview = editedPreview || activePreview;
    if (!preview) return;
    setActivePreview(null);

    // 设置跳过标记 — 下次 generate_image 直接执行，不再弹预览
    const agent = getOrCreateAgent();
    agent.skipNextPreview = true;

    // 构建用户消息发给 LLM
    let msg = "已确认生成预览，请直接调用 generate_image 执行生成。";
    if (userNote) {
      msg += `\n用户额外需求：${userNote}`;
    }
    sendMessage(msg);
  }, [activePreview, getOrCreateAgent, sendMessage]);

  const rejectPreview = useCallback(() => {
    setActivePreview(null);
  }, []);

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

  // refineSuggestion: 模糊建议（如"换场景"）点击 → 让 LLM 针对当前画面展开成
  // 一组具体选项（浴室/教室/海边…），不生图。LLM 应以 <<<SUGGESTION:...>>> 标记
  // 回复具体选项，标记解析器会替换 SuggestionBar 内容，用户再点选其一执行。
  const refineSuggestion = useCallback((sug: Suggestion) => {
    // 清空当前建议条，避免点击后停留在旧的模糊建议上
    setSuggestions([]);
    sendMessage(`我想${sug.title}，但还没想好具体内容。请基于当前画面给我 4 个${sug.title}的具体方案，每个方案直接写清楚具体怎么改（不要笼统）。用 <<<SUGGESTION:...>>> 标记输出。不要生成图片，等我选定后再生成。`);
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
