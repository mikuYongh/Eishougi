/**
 * TauriAgent — AG-UI AbstractAgent 的进程内实现。
 *
 * 直连 OpenAI-compatible 流式 API（Agnes/DeepSeek），将 LLM 响应实时映射为 AG-UI 标准事件。
 * 工具调用在进程内执行（复用 agentToolExecutors.ts），执行结果通过 TOOL_CALL_RESULT 事件回传。
 * Token 使用量通过 CUSTOM 事件发射（AG-UI 协议本身没有 token 事件）。
 *
 * 参考: https://docs.ag-ui.com/quickstart/middleware (OpenAIAgent 示例)
 */

import { AbstractAgent } from "@ag-ui/client";
import { EventType, type BaseEvent, type Message, type RunAgentInput } from "@ag-ui/core";
import { Observable } from "rxjs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke, Channel } from "@tauri-apps/api/core";
import { executeTool } from "../lib/agentToolExecutors";
import { buildOutputSpec, type PromptSyntax } from "../lib/agentPrompts";
import type { ChatMessage, TokenUsage } from "./types";

// ── Tauri webview fetch polyfill (Android CORS 绕过) ──
const smartFetch = async (input: string, init?: RequestInit) => {
  const isAndroid = navigator.userAgent.toLowerCase().includes("android");
  if (isAndroid && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      return await tauriFetch(input, init);
    } catch (e: any) {
      if (e.message && e.message.includes("not allowed on the configured scope")) {
        // fallthrough to window.fetch
      } else {
        throw e;
      }
    }
  }
  return window.fetch(input, init);
};

// ── Tool schema definitions (复用 AI SDK 分支的 TOOL_SCHEMAS) ──
// 工具定义在这里以 OpenAI function-calling 格式声明，传给 LLM API。
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface TauriAgentConfig {
  /** 获取当前 LLM 配置（每次 run 时动态读取，因为用户可能随时改设置） */
  getLlmConfig: () => { apiUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number; provider: string; reasoningEnabled: boolean };
  /** 获取 system prompt */
  getSystemPrompt: () => string;
  /** 获取工具定义列表 */
  getTools: () => ToolDef[];
  /** 获取 MCP 工具列表 */
  getMcpTools: () => any[];
  /** 获取当前 agent 设置（effort, maxRounds, reasoningEffort, focusMode） */
  getAgentSettings: () => { effort: string; maxRounds: number; reasoningEffort: string; focusMode: boolean };
  /** 回调：token 使用量更新 */
  onTokenUsage?: (usage: TokenUsage) => void;
  /** 回调：添加消息到 store */
  addMessage: (msg: ChatMessage) => void;
  /** 获取当前消息列表（用于工具执行上下文） */
  getMessages: () => ChatMessage[];
}

// ── 旧的 parseEmbeddedToolCalls 兼容（DeepSeek DSML 等文本化工具调用兜底）──
function parseEmbeddedToolCalls(content: string): {
  calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  remaining: string;
} {
  const calls: { id: string; type: "function"; function: { name: string; arguments: string } }[] = [];
  let remaining = content;

  // Hermes <tool_call> 格式
  const blockRe = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  for (const block of content.matchAll(blockRe)) {
    const raw = block[1].trim();
    let name = "";
    let argsObj: any = {};
    try {
      const json = JSON.parse(raw);
      if (json && typeof json === "object") {
        name = String(json.name || json.function || "");
        if (json.arguments && typeof json.arguments === "object") argsObj = json.arguments;
        else if (typeof json.arguments === "string") { try { argsObj = JSON.parse(json.arguments); } catch { argsObj = {}; } }
        else if (json.parameters) argsObj = json.parameters;
      }
    } catch {
      const fnMatch = raw.match(/<function=([^>\s]+)>([\s\S]*?)<\/function>/);
      if (fnMatch) {
        name = fnMatch[1].trim();
        for (const p of (fnMatch[2] || "").matchAll(/<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g)) {
          const key = p[1].trim();
          let val: any = p[2].trim();
          if (val === "true") val = true; else if (val === "false") val = false; else if (val === "null") val = null;
          else { try { const parsed = JSON.parse(val); val = typeof parsed === "number" || typeof parsed === "object" ? parsed : val; } catch {} }
          argsObj[key] = val;
        }
      }
    }
    if (name) calls.push({ id: `recovered_${Date.now()}_${calls.length}_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(argsObj) } });
  }
  remaining = remaining.replace(blockRe, "");

  // DeepSeek DSML 格式
  const DSML = "\uFF5C\uFF5C";
  const dsmlBlockRe = new RegExp(`<${DSML}DSML${DSML}tool_calls>([\\s\\S]*?)<\\/${DSML}DSML${DSML}tool_calls>`, "g");
  for (const block of content.matchAll(dsmlBlockRe)) {
    const invokeRe = new RegExp(`<${DSML}DSML${DSML}invoke\\s+name="([^"]+)">([\\s\\S]*?)<\\/${DSML}DSML${DSML}invoke>`, "g");
    let invokeMatch: RegExpExecArray | null;
    let dsmlIdx = 0;
    while ((invokeMatch = invokeRe.exec(block[1])) !== null) {
      const name = invokeMatch[1].trim();
      const paramRe = new RegExp(`<${DSML}DSML${DSML}parameter\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${DSML}DSML${DSML}parameter>`, "g");
      const argsObj: any = {};
      let paramMatch: RegExpExecArray | null;
      while ((paramMatch = paramRe.exec(invokeMatch[2])) !== null) {
        const key = paramMatch[1].trim();
        let val: any = paramMatch[2].trim();
        if (val === "true") val = true; else if (val === "false") val = false; else if (val === "null") val = null;
        else { try { const parsed = JSON.parse(val); val = typeof parsed === "number" || typeof parsed === "object" ? parsed : val; } catch {} }
        argsObj[key] = val;
      }
      calls.push({ id: `dsml_${Date.now()}_${dsmlIdx}_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(argsObj) } });
      dsmlIdx++;
    }
  }
  remaining = remaining.replace(dsmlBlockRe, "");

  return { calls, remaining };
}

// ── TauriAgent ──

export class TauriAgent extends AbstractAgent {
  private config: TauriAgentConfig;
  // 图片路径 → data URL 缓存，避免同一轮 / 跨轮重复读取文件
  private _imageCache = new Map<string, string>();

  constructor(config: TauriAgentConfig) {
    super({
      agentId: "tauri-agent",
      description: "Eishougi in-process agent",
    });
    this.config = config;
  }

  /**
   * 核心方法 — 实现 AG-UI AbstractAgent.run()
   * 返回一个 Observable<BaseEvent>，在内部驱动 LLM → 工具 → LLM 循环。
   */
  run(input: RunAgentInput): Observable<BaseEvent> {
    const { threadId, runId } = input;

    return new Observable<BaseEvent>((observer) => {
      let aborted = false;

      // 立即发射 RUN_STARTED
      observer.next({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);

      // 用 setTimeout(0) 把 agent 循环推迟到下一个宏任务。
      // Android 上 new Channel() 需要 window.__TAURI_INTERNALS__.transformCallback，
      // 它在 RxJS Observable 的微任务回调里可能还没就绪。推到宏任务确保 Tauri
      // 内部桥接已完成初始化。
      const timer = setTimeout(() => {
        this.runAgentLoop(input, observer, () => aborted)
          .then(() => {
            if (!aborted) {
              observer.next({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
              observer.complete();
            }
          })
          .catch((error) => {
            if (!aborted) {
              observer.next({ type: EventType.RUN_ERROR, message: error.message || String(error) } as BaseEvent);
              observer.error(error);
            }
          });
      }, 0);

      // teardown: abort + clear timer
      return () => {
        aborted = true;
        clearTimeout(timer);
      };
    });
  }

  /**
   * Agent 循环：LLM 调用 → 解析 → 工具执行 → 递归。
   * 直接操作 observer 发射 AG-UI 事件。
   */
  private async runAgentLoop(
    input: RunAgentInput,
    observer: any,
    isAborted: () => boolean,
    round = 0,
  ): Promise<void> {
    if (isAborted()) return;

    const llmConfig = this.config.getLlmConfig();
    const agentSettings = this.config.getAgentSettings();
    const effectiveMaxRounds = agentSettings.effort === "low" ? 1 : (agentSettings.maxRounds || 8);
    if (round >= effectiveMaxRounds) return;

    // ── 构建请求 ──
    const systemPrompt = this.config.getSystemPrompt();
    const tools = this.config.getTools();
    const mcpTools = this.config.getMcpTools();
    const allTools = [...tools, ...mcpTools.map((t: any) => ({ type: "function" as const, function: t.function || t, _mcp: t._mcp }))];

    // 构建消息（AG-UI Message → OpenAI 格式）
    const VIDEO_EXTS = new Set(["mp4", "webm", "avi", "mov", "mkv", "m4v"]);
    const isVideo = (p: string) => VIDEO_EXTS.has((p.split("?")[0].split(".").pop() || "").toLowerCase());

    const totalMsgs = input.messages.length;
    // 图片只在最近 3 条消息保留
    const IMAGE_CUTOFF = totalMsgs - 3;
    // 上下文裁剪：最近 N 条消息保留完整内容，更早的 tool 结果做截断。
    // 原理：search_characters 等工具可能返回几千字符的 JSON，多轮对话后这些历史结果
    // 反复发给 API 导致 token 暴涨。只保留最近几轮的完整 tool 结果，更早的截断到 200 字符摘要。
    const FULL_CONTENT_CUTOFF = totalMsgs - 8;
    const TOOL_RESULT_MAX_CHARS = 200;

    const apiMessages: any[] = [{ role: "system", content: systemPrompt }];

    for (let idx = 0; idx < input.messages.length; idx++) {
      const msg = input.messages[idx] as any;
      const isOld = idx < FULL_CONTENT_CUTOFF;

      // AG-UI Message → OpenAI message
      if (msg.role === "tool") {
        let toolContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        // 旧 tool 结果截断 — 保留开头摘要，丢弃冗长的历史 JSON
        if (isOld && toolContent.length > TOOL_RESULT_MAX_CHARS) {
          toolContent = toolContent.substring(0, TOOL_RESULT_MAX_CHARS) + "... [truncated]";
        }
        apiMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId || msg.tool_call_id || "",
          content: toolContent,
        });
      } else if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        const m: any = { role: "assistant" };
        // 旧 assistant 消息如果只有 tool_calls 没有实际文本，跳过 content（减少噪音）
        if (msg.content && msg.content.trim()) m.content = msg.content;
        m.tool_calls = msg.toolCalls.map((tc: any) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function?.name || tc.toolName || "", arguments: tc.function?.arguments || JSON.stringify(tc.args || {}) },
        }));
        // 旧的 tool_calls 参数也可以截断（arguments 可能很长）
        if (isOld) {
          m.tool_calls = m.tool_calls.map((tc: any) => ({
            ...tc,
            function: {
              ...tc.function,
              arguments: tc.function.arguments.length > 200
                ? tc.function.arguments.substring(0, 200) + "... [truncated]"
                : tc.function.arguments,
            },
          }));
        }
        apiMessages.push(m);
      } else {
        // 检查是否有图片附件 — 需要转成 OpenAI vision 多模态格式
        const images: string[] = msg.images || [];
        const imagePaths = (idx >= IMAGE_CUTOFF) ? images.filter((p: string) => !isVideo(p)) : [];

        if (imagePaths.length > 0) {
          // 构建 OpenAI vision content parts: text + image_url[]
          const contentParts: any[] = [];
          if (msg.content) contentParts.push({ type: "text", text: msg.content });
          for (const imgPath of imagePaths) {
            try {
              let dataUrl = imgPath;
              if (!imgPath.startsWith("data:")) {
                const cached = this._imageCache.get(imgPath);
                if (cached) {
                  dataUrl = cached;
                } else {
                  dataUrl = await invoke<string>("read_image_base64", { path: imgPath });
                  if (dataUrl && dataUrl.startsWith("data:")) this._imageCache.set(imgPath, dataUrl);
                }
              }
              contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
            } catch { /* skip broken image */ }
          }
          if (contentParts.length === 0) contentParts.push({ type: "text", text: msg.content || "" });
          apiMessages.push({ role: msg.role, content: contentParts });
        } else {
          apiMessages.push({ role: msg.role, content: msg.content || "" });
        }
      }
    }

    // 构建请求体
    let apiUrl = llmConfig.apiUrl || "https://apihub.agnes-ai.com/v1";
    if (!apiUrl.endsWith("/chat/completions")) {
      apiUrl = apiUrl.replace(/\/$/, "") + "/chat/completions";
    }

    const payload: any = {
      model: llmConfig.model || "agnes-2.0-flash",
      messages: apiMessages,
      stream: true,
      temperature: llmConfig.temperature ?? 0.7,
      max_tokens: llmConfig.maxTokens || 8192,
      // 思考模型开关 — false 时 API 不返回 reasoning_content，节省大量 token
      enable_thinking: llmConfig.reasoningEnabled ?? true,
    };
    if (round < effectiveMaxRounds) {
      payload.tools = allTools.map((t: any) => {
        const { _mcp, ...rest } = t;
        return rest;
      });
    }

    const bodyJson = JSON.stringify(payload);

    // ── 流式调用（通过 Tauri call_llm_proxy Channel）──
    const channel = new Channel<string>();
    let assistantContent = "";
    let assistantReasoning = "";
    let toolCalls: any[] = [];
    let toolCallState: any = null;
    let tokenUsage: TokenUsage | null = null;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // reasoning 消息需要独立 messageId — AG-UI apply() 按 id 查找消息追加 content，
    // 如果 TEXT 和 REASONING 共用同一 id，两者 content 会拼到同一条消息里。
    const reasoningMessageId = `reasoning_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // SSE 缓冲
    let sseBuffer = "";

    const flushText = (text: string) => {
      if (!text) return;
      assistantContent += text;
      observer.next({ type: EventType.TEXT_MESSAGE_CHUNK, messageId, role: "assistant", delta: text } as BaseEvent);
    };

    const processChunk = (chunk: string) => {
      if (isAborted()) return;
      sseBuffer += chunk;
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line === "data: [DONE]") continue;
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.usage) {
            tokenUsage = {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            };
          }
          const delta = data.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            // 直接转发文本（人机交互改用 client-defined tools，不再需要标记拦截）
            flushText(delta.content);
          }
          if (delta.reasoning_content && llmConfig.reasoningEnabled !== false) {
            assistantReasoning += delta.reasoning_content;
            observer.next({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: reasoningMessageId, delta: delta.reasoning_content } as BaseEvent);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id) {
                const tcId = tc.id;
                const tcName = tc.function?.name || "";
                toolCalls.push({ id: tcId, type: "function", function: { name: tcName, arguments: tc.function?.arguments || "" } });
                toolCallState = toolCalls[toolCalls.length - 1];
                observer.next({ type: EventType.TOOL_CALL_START, toolCallId: tcId, toolCallName: tcName, parentMessageId: messageId } as BaseEvent);
                if (tc.function?.arguments) {
                  observer.next({ type: EventType.TOOL_CALL_ARGS, toolCallId: tcId, delta: tc.function.arguments } as BaseEvent);
                }
              } else if (tc.function?.arguments && toolCallState) {
                toolCallState.function.arguments += tc.function.arguments;
                observer.next({ type: EventType.TOOL_CALL_ARGS, toolCallId: toolCallState.id, delta: tc.function.arguments } as BaseEvent);
              }
            }
          }
        } catch {}
      }
    };

    channel.onmessage = processChunk;

    try {
      await invoke("call_llm_proxy", { apiUrl, apiKey: llmConfig.apiKey || "", bodyJson, onChunk: channel });
    } catch (e: any) {
      // 错误信息提取 — 优先从 HTTP 错误体中解析 API 返回的具体错误，展示给用户
      const raw = e.toString();
      let friendly: string;
      // 尝试提取 API 返回的 JSON error message（如 "Invalid max_tokens value..."）
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
      console.error("[TauriAgent] LLM proxy error:", raw);
      observer.next({ type: EventType.TEXT_MESSAGE_CHUNK, messageId, role: "assistant", delta: friendly } as BaseEvent);
      // 发射 token usage（如果有）
      if (tokenUsage) {
        this.config.onTokenUsage?.(tokenUsage);
        observer.next({ type: EventType.CUSTOM, name: "token_usage", value: tokenUsage } as BaseEvent);
      }
      return;
    }

    // ── Token 使用量通过 CUSTOM 事件发射 ──
    if (tokenUsage) {
      this.config.onTokenUsage?.(tokenUsage);
      observer.next({ type: EventType.CUSTOM, name: "token_usage", value: tokenUsage } as BaseEvent);
    } else {
      // Fallback estimation
      const inputChars = JSON.stringify(apiMessages).length;
      const outputChars = assistantContent.length + JSON.stringify(toolCalls).length;
      const estimated: TokenUsage = {
        promptTokens: Math.round(inputChars / 2.5),
        completionTokens: Math.round(outputChars / 2.5),
        totalTokens: Math.round((inputChars + outputChars) / 2.5),
      };
      this.config.onTokenUsage?.(estimated);
      observer.next({ type: EventType.CUSTOM, name: "token_usage", value: estimated } as BaseEvent);
    }

    // ── Hermes/DSML 兜底解析 ──
    if (toolCalls.length === 0 && assistantContent) {
      if (assistantContent.includes("<tool_call>") || assistantContent.includes("\uFF5C\uFF5CDSML\uFF5C\uFF5Ctool_calls")) {
        const parsed = parseEmbeddedToolCalls(assistantContent);
        if (parsed.calls.length > 0) {
          toolCalls = parsed.calls;
          assistantContent = parsed.remaining.trim();
          console.warn(`[TauriAgent] recovered ${parsed.calls.length} embedded tool_call(s)`);
          for (const tc of toolCalls) {
            observer.next({ type: EventType.TOOL_CALL_START, toolCallId: tc.id, toolCallName: tc.function.name, parentMessageId: messageId } as BaseEvent);
            observer.next({ type: EventType.TOOL_CALL_ARGS, toolCallId: tc.id, delta: tc.function.arguments } as BaseEvent);
            observer.next({ type: EventType.TOOL_CALL_END, toolCallId: tc.id } as BaseEvent);
          }
        }
      }
    }

    // ── 工具执行 ──
    if (toolCalls.length > 0 && !isAborted()) {
      // 为已完成的 tool_call 发射 END
      for (const tc of toolCalls) {
        observer.next({ type: EventType.TOOL_CALL_END, toolCallId: tc.id } as BaseEvent);
      }

      const currentMessages = this.config.getMessages();

      // 收集每个 tool call 的执行结果，用于递归时传给下一轮 LLM
      const toolResults: { id: string; content: string }[] = [];

      for (const call of toolCalls) {
        if (isAborted()) break;

        let parsedArgs: any = {};
        let resultStr = "";
        let images: string[] | undefined;

        try {
          parsedArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          resultStr = JSON.stringify({ error: "Invalid JSON arguments" });
        }

        // ── Client-defined tools 拦截 ──
        // 这 3 个工具不执行 executeTool，而是发 CUSTOM 事件触发前端 UI，
        // 用户交互后结果通过新消息返回给 AI。
        if (!resultStr) {
          if (call.function.name === "select_characters") {
            // 角色/画师选择器
            observer.next({
              type: EventType.CUSTOM,
              name: "character_picker",
              value: {
                type: "character_picker",
                kind: parsedArgs.kind === "artist" ? "artist" : "character",
                series: parsedArgs.series || null,
              },
            } as BaseEvent);
            resultStr = JSON.stringify({ status: "pending", message: "已弹出角色选择器，等待用户选择。" });
            toolResults.push({ id: call.id, content: resultStr });
            observer.next({ type: EventType.TOOL_CALL_RESULT, messageId, toolCallId: call.id, content: resultStr, role: "tool" } as BaseEvent);
            continue;
          }

          if (call.function.name === "confirm_generation") {
            // 生图参数确认 — 从 DB 补全参数（LLM 可能只传 prompt_id）
            let dbPrompt: any = null;
            if (parsedArgs.prompt_id) {
              try {
                dbPrompt = await invoke("get_prompt", { id: parsedArgs.prompt_id });
              } catch {}
            }
            let loraConfigs: any[] | undefined;
            if (Array.isArray(parsedArgs.loras)) {
              loraConfigs = parsedArgs.loras;
            } else if (dbPrompt?.loraConfigs) {
              try {
                const parsed = typeof dbPrompt.loraConfigs === "string"
                  ? JSON.parse(dbPrompt.loraConfigs)
                  : dbPrompt.loraConfigs;
                loraConfigs = Array.isArray(parsed) ? parsed : undefined;
              } catch {}
            }
            const previewValue = {
              type: "generation_preview",
              previewId: `preview_${call.id}`,
              prompt: parsedArgs.prompt || dbPrompt?.positivePrompt || "",
              negativePrompt: parsedArgs.negative_prompt || dbPrompt?.negativePrompt,
              artistPrompt: parsedArgs.artist_prompt || dbPrompt?.artistPrompt,
              model: parsedArgs.model || dbPrompt?.baseModel,
              width: parsedArgs.width || dbPrompt?.width,
              height: parsedArgs.height || dbPrompt?.height,
              steps: parsedArgs.steps || dbPrompt?.steps,
              cfgScale: parsedArgs.cfg_scale || dbPrompt?.cfgScale,
              sampler: parsedArgs.sampler || dbPrompt?.samplerName || dbPrompt?.sampler,
              scheduler: parsedArgs.scheduler || dbPrompt?.scheduler,
              loras: loraConfigs,
              promptId: parsedArgs.prompt_id,
              status: "pending" as const,
            };
            observer.next({ type: EventType.CUSTOM, name: "gen_preview", value: previewValue } as BaseEvent);
            resultStr = JSON.stringify({ status: "pending", message: "已弹出参数预览，等待用户确认后执行生成。" });
            toolResults.push({ id: call.id, content: resultStr });
            observer.next({ type: EventType.TOOL_CALL_RESULT, messageId, toolCallId: call.id, content: resultStr, role: "tool" } as BaseEvent);
            continue;
          }

          if (call.function.name === "show_suggestions") {
            // 推荐方案 — 立即完成（用户点击建议时走新消息，不是 tool result）
            const suggestions = (parsedArgs.suggestions || []).map((s: any) => ({ confirm: false, ...s }));
            if (suggestions.length === 0) {
              // AI 传了空参数 — 返回错误提示，要求重新调用并带上 suggestions 数组
              resultStr = JSON.stringify({ status: "error", message: "show_suggestions 需要至少 1 个 suggestion。请带上 suggestions 参数重新调用，例如：show_suggestions(suggestions=[{title:\"浴室\",message:\"...\"}])" });
            } else {
              observer.next({ type: EventType.CUSTOM, name: "suggestion", value: suggestions } as BaseEvent);
              resultStr = JSON.stringify({ status: "shown", message: "已向用户展示建议按钮。" });
            }
            toolResults.push({ id: call.id, content: resultStr });
            observer.next({ type: EventType.TOOL_CALL_RESULT, messageId, toolCallId: call.id, content: resultStr, role: "tool" } as BaseEvent);
            continue;
          }
        }

        if (!resultStr) {
          try {
            const result = await executeTool(call.function.name, parsedArgs, {
              currentMessages,
              mcpTools,
              addMessage: this.config.addMessage,
            });
            resultStr = result.resultStr;
            images = result.images;
          } catch (e: any) {
            resultStr = JSON.stringify({ error: e.toString() });
          }
        }

        toolResults.push({ id: call.id, content: resultStr });

        // 发射 TOOL_CALL_RESULT
        observer.next({
          type: EventType.TOOL_CALL_RESULT,
          messageId,
          toolCallId: call.id,
          content: resultStr,
          role: "tool",
        } as BaseEvent);
      }

      // 递归：工具执行完毕后继续 LLM 调用
      if (!isAborted()) {
        // 把 assistant 消息 + tool 结果追加到 input.messages 中递归
        const newMessages: Message[] = [
          ...input.messages,
          {
            id: messageId,
            role: "assistant" as const,
            content: assistantContent || undefined,
            toolCalls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          } as Message,
          ...toolCalls.map((tc) => {
            const tr = toolResults.find((r) => r.id === tc.id);
            return {
              id: `toolmsg_${tc.id}`,
              role: "tool" as const,
              content: tr?.content || "",
              toolCallId: tc.id,
            } as Message;
          }),
        ];

        await this.runAgentLoop({ ...input, messages: newMessages }, observer, isAborted, round + 1);
      }
    }
  }
}
