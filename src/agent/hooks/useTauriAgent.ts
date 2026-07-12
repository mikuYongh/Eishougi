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
import type { ChatMessage, ChatAttachment, TokenUsage, Suggestion, GenerationPreviewAttachment } from "../types";

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
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activePreview, setActivePreview] = useState<GenerationPreviewAttachment | null>(null);
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
      + "\n⚠️ search_tags/get_related_tags 不存在";
  }, [agentSettings.systemPrompt]);

  // ── 创建/复用 TauriAgent ──
  const getOrCreateAgent = useCallback((): TauriAgent => {
    if (agentRef.current) return agentRef.current;
    const agent = new TauriAgent({
      getLlmConfig: () => {
        const { llm } = useSettingsStore.getState().settings;
        return { apiUrl: llm.apiUrl, apiKey: llm.apiKey, model: llm.model, temperature: llm.temperature, maxTokens: llm.maxTokens, provider: llm.provider, reasoningEnabled: llm.reasoningEnabled ?? true };
      },
      getSystemPrompt: buildSystemPrompt,
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
  }, [agentSettings, mcpTools, buildSystemPrompt]);

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
    tokenUsageRef.current = null;
    setTokenUsage(null);

    const agent = getOrCreateAgent();

    // 设置 agent 的 messages 为当前会话的消息（AG-UI Message 格式）
    // 注意：syncAgentMessagesToStore 已将 reasoning/activity 消息过滤并合并到 assistant.reasoning_content，
    // 所以 store 里的 ChatMessage 只有 user/assistant/tool/system 角色。
    const currentChatMessages = useAgentStore.getState().sessions.find((s) => s.id === useAgentStore.getState().activeSessionId)?.messages || [];
    agent.messages = currentChatMessages.map((m: ChatMessage) => {
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
              setSuggestions((prev) => [...prev, ...(event.value || [])]);
            } else if (event.name === "gen_preview") {
              setActivePreview(event.value);
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
        const cleaned = current.messages.filter((m) => !(m.role === "assistant" && (m.content ?? "") === "" && (!m.tool_calls || m.tool_calls.length === 0)));
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
  }, [activeSessionId]);

  // ── 审批操作 ──
  const approvePreview = useCallback(() => {
    if (activePreview) {
      setActivePreview(null);
      sendMessage(`确认生成: ${activePreview.prompt}`);
    }
  }, [activePreview, sendMessage]);

  const rejectPreview = useCallback(() => {
    setActivePreview(null);
  }, []);

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
    activePreview,
    approvePreview,
    rejectPreview,
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
