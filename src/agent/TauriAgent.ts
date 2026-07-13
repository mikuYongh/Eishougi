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
  // 专注模式：用户确认预览后设为 true，下次 generate_image 直接执行不拦截。
  // 执行后自动重置为 false。
  public skipNextPreview = false;
  // 记录 generate_image 完成的轮次，用于下一轮自动注入 suggestion
  public _lastGenImageRound: number | undefined;

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
    const IMAGE_CUTOFF = totalMsgs - 3;

    const apiMessages: any[] = [{ role: "system", content: systemPrompt }];

    for (let idx = 0; idx < input.messages.length; idx++) {
      const msg = input.messages[idx] as any;
      // AG-UI Message → OpenAI message
      if (msg.role === "tool") {
        apiMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId || msg.tool_call_id || "",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        const m: any = { role: "assistant" };
        if (msg.content) m.content = msg.content;
        m.tool_calls = msg.toolCalls.map((tc: any) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function?.name || tc.toolName || "", arguments: tc.function?.arguments || JSON.stringify(tc.args || {}) },
        }));
        apiMessages.push(m);
      } else {
        apiMessages.push({ role: msg.role, content: msg.content || "" });
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
    // 本轮流是否已通过标记发射过 suggestion（避免兜底逻辑重复发射）
    let hadSuggestionMarker = false;

    // ── 人机交互标记拦截 ──
    // LLM 在文本流中输出特殊标记（<<<SUGGESTION:...>>>, <<<GEN_PREVIEW:...>>>, <<<CHARACTER_PICKER:...>>>）
    // 我们在流过程中检测这些标记：标记内容不作为 TEXT_MESSAGE_CHUNK 转发（不显示给用户），
    // 而是解析后作为 CUSTOM 事件发射，前端据此渲染富 UI 组件。
    //
    // 由于标记可能跨多个 SSE chunk 边界，我们用一个 pending buffer 暂存可能不完整的标记头部。
    // 完整标记被截获后触发 CUSTOM 事件；非标记文本正常逐 token 转发（保持流式渲染体验）。
    let pendingBuffer = "";  // 暂存可能不完整的标记片段
    const MARKERS = ["<<<SUGGESTION:", "<<<GEN_PREVIEW:", "<<<CHARACTER_PICKER:"];
    const END_MARKER = ">>>";

    const flushText = (text: string) => {
      if (!text) return;
      assistantContent += text;
      observer.next({ type: EventType.TEXT_MESSAGE_CHUNK, messageId, role: "assistant", delta: text } as BaseEvent);
    };

    const processTextDelta = (deltaText: string) => {
      let combined = pendingBuffer + deltaText;
      pendingBuffer = "";

      while (combined.length > 0) {
        // 查找最近的开标记位置
        let earliestStart = -1;
        let matchedMarker = "";
        for (const marker of MARKERS) {
          // 标记可能部分出现在 combined 末尾（跨 chunk），需要检测前缀
          const fullIdx = combined.indexOf(marker);
          if (fullIdx !== -1 && (earliestStart === -1 || fullIdx < earliestStart)) {
            earliestStart = fullIdx;
            matchedMarker = marker;
          }
          // 检测 partial（combined 以 marker 的前缀结尾但还没完整出现）
          for (let prefixLen = Math.min(combined.length, marker.length - 1); prefixLen >= 1; prefixLen--) {
            if (combined.endsWith(marker.slice(0, prefixLen)) && marker.slice(0, prefixLen) !== "") {
              // 如果 combined 完全以 marker 前缀结尾且没有更早的完整标记，暂存
              if (earliestStart === -1) {
                pendingBuffer = combined;
                return;
              }
              break;
            }
          }
        }

        if (earliestStart === -1) {
          // 没有标记 — 全部转发
          flushText(combined);
          return;
        }

        // 先转发标记之前的普通文本
        if (earliestStart > 0) {
          flushText(combined.slice(0, earliestStart));
        }

        const afterMarker = combined.slice(earliestStart + matchedMarker.length);

        // 查找结束标记 >>>
        const endIdx = afterMarker.indexOf(END_MARKER);
        if (endIdx === -1) {
          // 标记尚未完整 — 暂存（连同标记头部）
          pendingBuffer = combined.slice(earliestStart);
          return;
        }

        // 完整标记！解析 JSON 内容并触发 CUSTOM 事件
        const jsonStr = afterMarker.slice(0, endIdx).trim();
        combined = afterMarker.slice(endIdx + END_MARKER.length);

        try {
          const parsed = JSON.parse(jsonStr);
          if (matchedMarker === "<<<SUGGESTION:") {
            // LLM 给出的建议是具体的（已写明改什么），点击直接执行，confirm=false
            const suggestions = (Array.isArray(parsed) ? parsed : [parsed]).map((s: any) => ({ confirm: false, ...s }));
            hadSuggestionMarker = true;
            observer.next({ type: EventType.CUSTOM, name: "suggestion", value: suggestions } as BaseEvent);
          } else if (matchedMarker === "<<<GEN_PREVIEW:") {
            observer.next({ type: EventType.CUSTOM, name: "gen_preview", value: { ...parsed, type: "generation_preview", status: "pending" } } as BaseEvent);
          } else if (matchedMarker === "<<<CHARACTER_PICKER:") {
            observer.next({ type: EventType.CUSTOM, name: "character_picker", value: { ...parsed, type: "character_picker" } } as BaseEvent);
          }
        } catch (e) {
          // JSON 解析失败 — 把标记内容作为普通文本输出（降级处理）
          console.warn("[TauriAgent] failed to parse marker JSON:", jsonStr, e);
          flushText(`[${matchedMarker}${jsonStr}${END_MARKER}]`);
        }
      }
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
            // 通过标记拦截器处理，而非直接转发
            processTextDelta(delta.content);
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

    // ── 流结束后刷新残留的 pendingBuffer（不完整标记的尾部文本）──
    if (pendingBuffer) {
      flushText(pendingBuffer);
      pendingBuffer = "";
    }

    // ── 自动注入 suggestion 标记（兜底）──
    // 如果 LLM 没有自己输出 SUGGESTION 标记（hadSuggestionMarker 仍为 false），
    // 注入一组模糊的维度建议（换姿势/场景/服装等）。这类建议是笼统的，需要用户确认具体内容。
    if (toolCalls.length > 0 && toolCalls.some((tc) => tc.function.name === "generate_image")) {
      // 记录 generate_image 完成事实，下一轮递归（纯文本回复）时检查
      this._lastGenImageRound = round;
    }
    if (toolCalls.length === 0 && assistantContent && this._lastGenImageRound !== undefined && this._lastGenImageRound === round - 1) {
      // 这是 generate_image 后的下一轮（纯文本回复），仅在 LLM 未自行输出建议标记时兜底
      if (!hadSuggestionMarker) {
        const defaultSuggestions = [
          { title: "换姿势", message: "换一个姿势重新生成这张图", confirm: true },
          { title: "换场景", message: "换一个场景重新生成这张图", confirm: true },
          { title: "换服装", message: "换一套服装重新生成这张图", confirm: true },
          { title: "横版", message: "改成横版 1216×832 重新生成", confirm: false },
        ];
        observer.next({ type: EventType.CUSTOM, name: "suggestion", value: defaultSuggestions } as BaseEvent);
      }
      this._lastGenImageRound = undefined;
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

        // ── 专注模式拦截：generate_image 调用前弹出预览卡片让用户确认 ──
        // 不依赖 LLM 输出标记 — 在工具执行层强制拦截，100% 可靠。
        // skipNextPreview 标记：用户已确认预览，直接执行不拦截（执行后重置）。
        if (!resultStr && call.function.name === "generate_image" && agentSettings.focusMode && !this.skipNextPreview) {
          // LLM 经常只传 prompt_id 不传 positive_prompt — 从数据库补全真实参数
          let dbPrompt: any = null;
          if (parsedArgs.prompt_id) {
            try {
              dbPrompt = await invoke("get_prompt", { id: parsedArgs.prompt_id });
            } catch {}
          }
          const previewValue = {
            type: "generation_preview",
            previewId: `preview_${call.id}`,
            prompt: parsedArgs.positive_prompt || dbPrompt?.positivePrompt || "",
            negativePrompt: parsedArgs.negative_prompt || dbPrompt?.negativePrompt,
            artistPrompt: parsedArgs.artist_prompt || dbPrompt?.artistPrompt,
            model: parsedArgs.base_model || dbPrompt?.baseModel,
            width: parsedArgs.width || dbPrompt?.width,
            height: parsedArgs.height || dbPrompt?.height,
            steps: parsedArgs.steps || dbPrompt?.steps,
            cfgScale: parsedArgs.cfg_scale || dbPrompt?.cfgScale,
            sampler: parsedArgs.sampler_name || dbPrompt?.sampler,
            scheduler: parsedArgs.scheduler || dbPrompt?.scheduler,
            loras: parsedArgs.lora_configs || dbPrompt?.loraConfigs,
            promptId: parsedArgs.prompt_id,
            status: "pending" as const,
          };
          observer.next({ type: EventType.CUSTOM, name: "gen_preview", value: previewValue } as BaseEvent);
          // 返回占位结果告诉 LLM 等待用户确认
          resultStr = JSON.stringify({ status: "pending", message: "已弹出生成预览，等待用户确认参数后执行。" });
          toolResults.push({ id: call.id, content: resultStr });
          observer.next({
            type: EventType.TOOL_CALL_RESULT,
            messageId,
            toolCallId: call.id,
            content: resultStr,
            role: "tool",
          } as BaseEvent);
          continue;
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

        // ── 角色搜索结果自动触发 character_picker 选择器 ──
        // 不依赖 LLM 输出标记 — 工具执行后自动检测返回的是角色/画师列表
        // 发 kind + series 信号：Modal 内部用 series 预选作品筛选，显示 LLM 搜出的那批角色
        // （本地重新拉，数据完整、图片 URL 正确）。用户仍可清掉筛选浏览全部。
        if (call.function.name === "search_characters_in_series" || call.function.name === "search_artists") {
          const isArtist = call.function.name === "search_artists";
          const series = !isArtist ? (parsedArgs.series as string | undefined) : undefined;
          observer.next({
            type: EventType.CUSTOM,
            name: "character_picker",
            value: { type: "character_picker", kind: isArtist ? "artist" : "character", series },
          } as BaseEvent);
        }

        toolResults.push({ id: call.id, content: resultStr });

        // generate_image 执行完毕后重置 skipNextPreview
        if (call.function.name === "generate_image") {
          this.skipNextPreview = false;
        }

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
