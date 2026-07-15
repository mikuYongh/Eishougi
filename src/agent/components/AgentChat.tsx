/**
 * AgentChat — 消息列表（Virtuoso 虚拟化）+ 空状态欢迎 + 回到底部按钮
 */
import { useRef, useCallback, useState, useEffect } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Bot, Sparkles, ImageIcon, Palette, Wand2, ArrowDown } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "../types";

interface AgentChatProps {
  messages: ChatMessage[];
  onAction?: (message: string) => void;
  isGenerating?: boolean;
}

export function AgentChat({ messages, onAction, isGenerating }: AgentChatProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const previousMessageCountRef = useRef(messages.length);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const renderMessage = useCallback((index: number) => {
    const msg = messages[index];
    if (!msg) return <div />;
    const isUser = msg.role === "user";
    return (
      <div className={`px-4 py-2 ${isUser ? "" : ""}`}>
        <MessageBubble msg={msg} onAction={onAction} />
      </div>
    );
  }, [messages, onAction]);

  // 判断是否需要显示"思考中"指示器 — isGenerating 为 true 且
  // 最后一条消息不是正在流式输出的 assistant 消息（有内容或有 tool_calls）
  const lastMsg = messages[messages.length - 1];
  const isLastMsgStreaming = lastMsg?.role === "assistant" && (lastMsg.content?.trim() || (lastMsg.tool_calls?.length));
  const showThinking = isGenerating && !isLastMsgStreaming;

  // 新消息到来或生成状态变化时强制滚动到底部。
  // followOutput="smooth" 只在用户已在底部时跟随，用户一旦向上滚就不回来了。
  // 这里用 scrollToIndex 确保发消息 / AI 回复时总是跳到底部。
  useEffect(() => {
    if (messages.length > 0 && virtuosoRef.current) {
      const appendedUserMessage = messages.length > previousMessageCountRef.current
        && messages[messages.length - 1]?.role === "user";
      if (atBottomRef.current || appendedUserMessage) {
        const t = setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: "end", behavior: "smooth" });
        }, 50);
        previousMessageCountRef.current = messages.length;
        return () => clearTimeout(t);
      }
      previousMessageCountRef.current = messages.length;
    }
  }, [messages.length, isGenerating]);

  // 空状态
  if (messages.length === 0 || (messages.length === 1 && messages[0].role === "user" && !messages[0].content.trim())) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-[280px]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--accent-1)]/20 to-[var(--accent-2)]/20 border border-[var(--accent-1)]/15 flex items-center justify-center">
            <Bot size={32} className="text-[var(--accent-1)]" />
          </div>
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1">咏唱助手已就绪</h3>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-4">
            描述你想要的画面，或使用快捷预设开始创作
          </p>
          <div className="space-y-1.5 text-left">
            {[
              { icon: Palette, text: "生成角色插画 — \"一个蓝发少女在樱花树下\"" },
              { icon: ImageIcon, text: "基于图片生成 — 上传参考图后描述变化" },
              { icon: Wand2, text: "快速预设 — 点击输入栏网格图标选择尺寸/风格" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <item.icon size={12} className="text-[var(--accent-1)] flex-shrink-0 mt-0.5" />
                <span className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        itemContent={renderMessage}
        followOutput="smooth"
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        className="h-full"
        components={{
          Footer: () => (
            <div>
              {showThinking && (
                <div className="px-4 py-2">
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-1)]/30 to-[var(--accent-2)]/30 border border-[var(--accent-1)]/20 flex items-center justify-center mt-0.5">
                      <Bot size={16} className="text-[var(--accent-1)]" />
                    </div>
                    <span className="text-[13px] text-[var(--text-secondary)]">思考中</span>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="h-1" />
            </div>
          ),
        }}
         atBottomStateChange={(atBottom) => {
           atBottomRef.current = atBottom;
           setShowScrollBtn(!atBottom);
         }}
      />

      {/* 回到底部按钮 — 用户向上滚动时显示 */}
      {showScrollBtn && (
        <button
          onClick={() => virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: "end", behavior: "smooth" })}
          className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-[var(--accent-1)] text-white flex items-center justify-center hover:bg-[var(--accent-1)]/80 shadow-[0_4px_15px_rgba(var(--accent-1-rgb),0.5)] transition-all duration-300 cursor-pointer"
        >
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  );
}
