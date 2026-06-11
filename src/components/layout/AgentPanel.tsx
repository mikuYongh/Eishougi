import { Bot, Send, Sparkles, Settings, Plus, History, ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";

export function AgentPanel() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="flex-shrink-0 flex flex-col relative z-10 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-[var(--glass-bg)] border-l border-[var(--glass-border)] shadow-[-4px_0_30px_rgba(0,0,0,0.1)]"
      style={{
        width: isExpanded ? "var(--spacing-agent-w)" : "60px",
        backdropFilter: "blur(24px)",
      }}
    >
      {/* Decorative inner border glow */}
      <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent pointer-events-none" />

      {/* Collapse/Expand Handle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute top-1/2 -translate-y-1/2 -left-[18px] w-[18px] h-[60px] flex items-center justify-center bg-[var(--glass-bg)] hover:bg-[var(--accent-1)]/20 border border-[var(--glass-border)] border-r-transparent hover:border-[var(--accent-1)]/30 text-[var(--text-muted)] hover:text-[var(--accent-1)] rounded-l-md cursor-pointer transition-all duration-300 backdrop-blur-xl z-20 shadow-[-2px_0_10px_rgba(0,0,0,0.2)]"
      >
        {isExpanded ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Header */}
      <div
        className={`flex items-center px-4 py-4 flex-shrink-0 transition-all duration-300 border-b border-[var(--glass-border)] ${isExpanded ? "justify-start" : "justify-center"}`}
      >
        {isExpanded ? (
          <>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--accent-1)]/20 text-[var(--accent-1)]">
                <Bot size={14} />
              </div>
              <span className="text-[13px] font-bold text-[var(--text-primary)]">AI 助手</span>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2.5 ml-auto text-[var(--text-muted)]">
              <button className="hover:text-[var(--text-primary)] transition-colors cursor-pointer" title="历史记录">
                <History size={14} />
              </button>
              <button className="hover:text-[var(--text-primary)] transition-colors cursor-pointer" title="配置">
                <Settings size={14} />
              </button>
              <button className="hover:text-[var(--accent-1)] transition-colors cursor-pointer" title="新建对话">
                <Plus size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-6 items-center pt-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--accent-1)]/20 text-[var(--accent-1)] group relative">
              <Bot size={16} />
            </div>
            <div className="w-6 h-px bg-white/10" />
            <button className="text-[var(--text-muted)] hover:text-[var(--accent-1)] transition-colors cursor-pointer" title="新建对话">
              <Plus size={18} />
            </button>
            <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer" title="历史记录">
              <History size={16} />
            </button>
            <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer" title="配置">
              <Settings size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Content Area (Messages & Input) */}
      <div 
        className="flex-1 flex flex-col overflow-hidden transition-opacity duration-300"
        style={{ 
          opacity: isExpanded ? 1 : 0, 
          pointerEvents: isExpanded ? "auto" : "none",
          width: "var(--spacing-agent-w)" // Force content width to prevent reflow jumping
        }}
      >
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-col gap-3">
            <div
              className="p-3.5 rounded-xl text-xs leading-relaxed relative overflow-hidden bg-white/5 text-[var(--text-primary)] border border-[var(--glass-border)]"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--accent-1)] to-[var(--accent-2)]" />
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-[var(--accent-1)]" />
                <span className="font-bold text-[var(--text-primary)]">你好！我是 詠唱机 EISHOUGI AI</span>
              </div>
              我可以帮你搜索提示词、创建提示词、触发生成任务等。在设置页配置 API Key 后即可开始对话。
            </div>
          </div>
        </div>

        {/* Input */}
        <div
          className="p-4 flex-shrink-0 border-t border-[var(--glass-border)]"
        >
          <div className="flex items-end gap-2 p-1.5 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] shadow-[inset_0_2px_10px_rgba(0,0,0,0.1)] focus-within:border-[var(--accent-1)]/30 focus-within:bg-white/5 transition-all">
            <textarea
              className="flex-1 resize-none bg-transparent px-3 py-2 text-xs outline-none font-sans h-9 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              placeholder="输入消息... (Ctrl+Enter 发送)"
              rows={1}
            />
            <button
              className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0 transition-transform hover:scale-105 shadow-[0_0_10px_rgba(var(--accent-1-rgb), 0.4)]"
              style={{
                background: "linear-gradient(135deg, #FF6B9D, #B388FF)",
                color: "#fff",
              }}
            >
              <Send size={14} className="-ml-0.5 mt-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
