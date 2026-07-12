/**
 * AgentChat — 消息列表（Virtuoso 虚拟化）+ 空状态欢迎
 */
import { useRef, useCallback } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Bot, Sparkles, ImageIcon, Palette, Wand2 } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "../types";

interface AgentChatProps {
  messages: ChatMessage[];
}

export function AgentChat({ messages }: AgentChatProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const renderMessage = useCallback((index: number) => {
    const msg = messages[index];
    if (!msg) return <div />;
    const isUser = msg.role === "user";
    return (
      <div className={`px-3 py-1.5 ${isUser ? "" : ""}`}>
        <MessageBubble msg={msg} />
      </div>
    );
  }, [messages]);

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
    <div className="flex-1 min-h-0">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        itemContent={renderMessage}
        followOutput="smooth"
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        className="h-full"
        components={{
          Footer: () => <div className="h-1" />,
        }}
        atBottomStateChange={(atBottom) => {
          // Auto-scroll handled by followOutput
        }}
      />
    </div>
  );
}
