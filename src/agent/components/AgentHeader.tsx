/**
 * AgentHeader — 头部：标题 + 会话管理 + 设置入口
 */
import { Bot, Plus, History, Settings as SettingsIcon, ChevronLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAgentStore } from "../../stores/agentStore";

interface AgentHeaderProps {
  viewMode: "chat" | "history" | "settings";
  onViewChange: (view: "chat" | "history" | "settings") => void;
  onCollapse?: () => void;
  isMobile?: boolean;
}

export function AgentHeader({ viewMode, onViewChange, onCollapse, isMobile }: AgentHeaderProps) {
  const { sessions, activeSessionId, createSession, switchSession, deleteSession } = useAgentStore();
  const [showHistory, setShowHistory] = useState(false);

  if (viewMode === "history") {
    return (
      <div className="flex-shrink-0 p-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => onViewChange("chat")} className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
            <ChevronLeft size={16} />
            <span className="text-[12px]">返回</span>
          </button>
          <button
            onClick={() => { createSession(); onViewChange("chat"); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 transition-all cursor-pointer text-[11px] font-medium"
          >
            <Plus size={12} />
            新会话
          </button>
        </div>
        <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">会话历史</div>
      </div>
    );
  }

  if (viewMode === "settings") {
    return (
      <div className="flex-shrink-0 p-3 border-b border-[var(--glass-border)]">
        <button onClick={() => onViewChange("chat")} className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
          <ChevronLeft size={16} />
          <span className="text-[12px]">返回</span>
        </button>
      </div>
    );
  }

  // Chat view header
  return (
    <div className="flex-shrink-0 px-3 py-2.5 flex items-center justify-between border-b border-[var(--glass-border)]">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.3)]">
          <Bot size={15} className="text-white" />
        </div>
        <div>
          <div className="text-[12px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)]">咏唱助手</div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] text-[var(--text-muted)]">在线</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button onClick={() => { createSession(); }} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="新会话">
          <Plus size={14} />
        </button>
        <button onClick={() => onViewChange("history")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="历史">
          <History size={14} />
        </button>
        <button onClick={() => onViewChange("settings")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="设置">
          <SettingsIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// History list (rendered inside chat area when viewMode === 'history')
export function HistoryList({ onBack }: { onBack: () => void }) {
  const { sessions, activeSessionId, switchSession, deleteSession } = useAgentStore();

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
      {sessions.length === 0 && (
        <div className="text-center text-[var(--text-muted)] text-[11px] py-8">暂无会话</div>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          onClick={() => { switchSession(s.id); onBack(); }}
          className={`group p-2.5 rounded-xl cursor-pointer transition-all border ${
            s.id === activeSessionId
              ? "bg-[var(--accent-1)]/15 border-[var(--accent-1)]/30 shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.1)]"
              : "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-active)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-primary)] truncate flex-1">{s.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400 transition-all"
            >
              <Trash2 size={11} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-[var(--text-muted)]">{s.messages.length} 条消息</span>
            <span className="text-[9px] text-[var(--text-muted)]">{new Date(s.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
