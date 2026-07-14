/**
 * MessageBubble — 统一消息渲染组件
 * 处理: 用户消息、助手消息（含 markdown + reasoning）、工具调用卡片、工具结果（含图片）
 */
import { memo, useState } from "react";
import { PhotoView } from "react-photo-view";
import { ChevronDown, ChevronUp, Bot, Wrench, Zap, Brain, ImageIcon, FileText } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { ResultActions } from "./ResultActions";
import { getImgSrc } from "../../utils/imageUtils";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ChatMessage } from "../types";

const VIDEO_EXTS = new Set(["mp4", "webm", "avi", "mov", "mkv", "m4v"]);

function ChatImage({ src }: { src: string }) {
  const privacyMode = useSettingsStore((s) => s.settings.privacyMode);
  const imgSrc = getImgSrc(src);
  const isVideo = VIDEO_EXTS.has((src.split("?")[0].split(".").pop() || "").toLowerCase());

  if (isVideo) {
    return <video src={imgSrc} controls className="max-w-full max-h-[300px] rounded-xl border border-[var(--glass-border)]" />;
  }
  return (
    <PhotoView src={imgSrc}>
      <img src={imgSrc} alt="" className={`max-w-full max-h-[300px] rounded-xl border border-[var(--glass-border)] cursor-zoom-in object-cover ${privacyMode ? "blur-lg hover:blur-none transition-all duration-300" : ""}`} />
    </PhotoView>
  );
}

function ReasoningBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <Brain size={11} />
        <span>推理过程</span>
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {expanded && (
        <div className="mt-1 p-2 bg-[var(--bg-layer-0)]/50 rounded-lg text-[10px] text-[var(--text-muted)] font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto custom-scrollbar border-l-2 border-[var(--accent-2)]/30">
          {content}
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ name, args }: { name: string; args: string }) {
  const [expanded, setExpanded] = useState(false);
  let prettyArgs = args;
  try { prettyArgs = JSON.stringify(JSON.parse(args), null, 2); } catch {}

  return (
    <div className="my-1 p-2.5 rounded-xl bg-[var(--accent-2)]/10 border border-[var(--accent-2)]/20">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left">
        <Zap size={12} className="text-[var(--accent-2)] flex-shrink-0" />
        <span className="text-[11px] font-bold text-[var(--accent-2)] truncate">{name}</span>
        {expanded ? <ChevronUp size={11} className="text-[var(--text-muted)] ml-auto" /> : <ChevronDown size={11} className="text-[var(--text-muted)] ml-auto" />}
      </button>
      {expanded && prettyArgs !== "{}" && (
        <pre className="mt-1.5 p-2 bg-[var(--bg-layer-0)]/60 rounded-lg text-[10px] font-mono text-[var(--text-secondary)] overflow-x-auto custom-scrollbar whitespace-pre-wrap break-all">
          {prettyArgs}
        </pre>
      )}
    </div>
  );
}

function ToolResultCard({ name, content }: { name: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  let parsed: any = null;
  try { parsed = JSON.parse(content); } catch {}

  const isError = parsed?.error;
  const isCompleted = parsed?.status === "completed" || parsed?.status === "success";
  const summary = isError ? parsed.error : isCompleted ? (parsed.message || "完成") : content.substring(0, 120);

  return (
    <div className="my-1 p-2.5 rounded-xl bg-[var(--accent-1)]/8 border border-[var(--accent-1)]/15">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isError ? "bg-red-500/20" : isCompleted ? "bg-green-500/20" : "bg-[var(--accent-1)]/20"}`}>
          <Wrench size={11} className={isError ? "text-red-400" : isCompleted ? "text-green-400" : "text-[var(--accent-1)] animate-spin"} />
        </div>
        <span className="text-[11px] font-bold text-[var(--text-secondary)]">{name}</span>
        <button onClick={() => setExpanded(!expanded)} className="ml-auto">
          {expanded ? <ChevronUp size={11} className="text-[var(--text-muted)]" /> : <ChevronDown size={11} className="text-[var(--text-muted)]" />}
        </button>
      </div>
      <p className={`text-[10px] truncate ${isError ? "text-red-400" : "text-[var(--text-secondary)]"}`}>{summary}</p>
      {expanded && (
        <pre className="mt-1.5 p-2 bg-[var(--bg-layer-0)]/60 rounded-lg text-[10px] font-mono text-[var(--text-muted)] overflow-x-auto custom-scrollbar max-h-[150px] whitespace-pre-wrap break-all">
          {content}
        </pre>
      )}
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({ msg, onAction }: { msg: ChatMessage; onAction?: (message: string) => void }) {
  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";
  const isTool = msg.role === "tool";

  // 工具消息
  if (isTool) {
    // 判断是否为图片生成结果（有 images 字段）→ 显示 ResultActions
    const hasImages = msg.images && msg.images.length > 0;
    // 从 tool 结果 JSON 里提取 prompt_id，用于"设为示范"
    let promptId: string | undefined;
    if (hasImages && msg.content) {
      try {
        const parsed = JSON.parse(msg.content);
        promptId = parsed.prompt_id;
      } catch {}
    }
    return (
      <div className="w-full px-1">
        <ToolResultCard name={msg.name || "tool"} content={msg.content} />
        {hasImages && onAction && (
          <ResultActions images={msg.images!} promptId={promptId} onAction={onAction} />
        )}
      </div>
    );
  }

  // 用户消息
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          {msg.images && msg.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 justify-end">
              {msg.images.map((img, i) => <ChatImage key={i} src={img} />)}
            </div>
          )}
          {msg.files && msg.files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 justify-end">
              {msg.files.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--accent-1)]/20">
                  <FileText size={13} className="text-[var(--accent-1)] flex-shrink-0" />
                  <span className="text-[11px] text-[var(--text-secondary)] max-w-[120px] truncate">{file.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="bg-[var(--glass-bg)] rounded-2xl rounded-tr-sm border border-[var(--accent-1)]/30 backdrop-blur-md p-4 shadow-[0_4px_15px_rgba(var(--accent-1-rgb),0.1)]">
            <div className="text-[14px] text-[var(--text-primary)] whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
          <div className="text-right text-[10px] font-mono text-[var(--text-muted)] mt-0.5 mr-1">YOU</div>
        </div>
      </div>
    );
  }

  // 助手消息
  const hasContent = msg.content && msg.content.trim().length > 0;
  const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
  const isThinking = !hasContent && !hasToolCalls;

  if (isThinking) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Bot size={16} className="text-[var(--accent-1)]" />
        <span className="text-[13px] text-[var(--text-secondary)]">思考中</span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Bot avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-1)]/30 to-[var(--accent-2)]/30 border border-[var(--accent-1)]/20 flex items-center justify-center mt-0.5">
        <Bot size={16} className="text-[var(--accent-1)]" />
      </div>
      <div className="flex-1 min-w-0 text-[14px]">
        {msg.reasoning_content && <ReasoningBlock content={msg.reasoning_content} />}
        {hasToolCalls && msg.tool_calls!.map((tc) => (
          <ToolCallCard key={tc.id} name={tc.function.name} args={tc.function.arguments} />
        ))}
        {hasContent && (
          <div className="bg-[var(--glass-bg)] rounded-2xl rounded-tl-sm border border-[var(--glass-border)] backdrop-blur-xl p-4">
            <MarkdownContent content={msg.content} />
          </div>
        )}
        <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 ml-1">AI</div>
      </div>
    </div>
  );
});
