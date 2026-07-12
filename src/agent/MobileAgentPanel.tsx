/**
 * MobileAgentPanel — 移动端 Agent 全屏面板
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Bot, Plus, History, Settings as SettingsIcon, ChevronLeft } from "lucide-react";
import { useTauriAgent } from "./hooks/useTauriAgent";
import { useAgentStore } from "../stores/agentStore";
import { HistoryList } from "./components/AgentHeader";
import { AgentChat } from "./components/AgentChat";
import { AgentInput } from "./components/AgentInput";
import { SuggestionBar } from "./components/SuggestionBar";
import { GenerationPreview } from "./components/GenerationPreview";

export function MobileAgentPanel() {
  const { isMobileAgentOpen, toggleMobileAgent, createSession } = useAgentStore();
  const [viewMode, setViewMode] = useState<"chat" | "history" | "settings">("chat");

  const {
    messages,
    isGenerating,
    sendMessage,
    stopGenerating,
    tokenUsage,
    suggestions,
    clearSuggestions,
    activePreview,
    approvePreview,
    rejectPreview,
  } = useTauriAgent();

  // Auto-create session on open if none exists
  useEffect(() => {
    if (isMobileAgentOpen) {
      const { activeSessionId, sessions, createSession } = useAgentStore.getState();
      if (!activeSessionId && sessions.length === 0) {
        createSession();
      }
    }
  }, [isMobileAgentOpen]);

  if (!isMobileAgentOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-[var(--bg-layer-0)] flex flex-col animate-in fade-in duration-300">
      {/* Header — 自包含，关闭按钮和历史/设置按钮分列两侧 */}
      <div className="flex-shrink-0 px-3 py-3 flex items-center justify-between border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {viewMode !== "chat" ? (
            <button onClick={() => setViewMode("chat")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer">
              <ChevronLeft size={18} />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.3)]">
              <Bot size={16} className="text-white" />
            </div>
          )}
          <div>
            <div className="text-[13px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)]">
              {viewMode === "history" ? "会话历史" : viewMode === "settings" ? "设置" : "咏唱助手"}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-[var(--text-muted)]">{isGenerating ? "生成中" : "在线"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {viewMode === "chat" && (
            <>
              <button onClick={() => { useAgentStore.getState().createSession(); }} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="新会话">
                <Plus size={16} />
              </button>
              <button onClick={() => setViewMode("history")} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="历史">
                <History size={16} />
              </button>
              <button onClick={() => setViewMode("settings")} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="设置">
                <SettingsIcon size={16} />
              </button>
            </>
          )}
          {/* 关闭按钮 — 独立，与功能按钮有间距 */}
          <div className="w-px h-5 bg-[var(--glass-border)] mx-1" />
          <button onClick={() => toggleMobileAgent(false)} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer" title="关闭">
            <X size={18} />
          </button>
        </div>
      </div>

      {viewMode === "chat" && (
        <>
          <AgentChat messages={messages} />

          {activePreview && (
            <GenerationPreview preview={activePreview} onApprove={approvePreview} onReject={rejectPreview} />
          )}

          {suggestions.length > 0 && (
            <SuggestionBar
              suggestions={suggestions}
              onSelect={(msg) => { clearSuggestions(); sendMessage(msg); }}
            />
          )}

          <AgentInput
            onSend={sendMessage}
            onStop={stopGenerating}
            isGenerating={isGenerating}
            tokenUsage={tokenUsage}
            onOpenHistory={() => setViewMode("history")}
          />
        </>
      )}

      {viewMode === "history" && <HistoryList onBack={() => setViewMode("chat")} />}

      {viewMode === "settings" && (
        <MobileSettingsView onBack={() => setViewMode("chat")} />
      )}
    </div>,
    document.body,
  );
}

function MobileSettingsView({ onBack }: { onBack: () => void }) {
  const { settings: agentSettings, updateSettings } = useAgentStore();
  const [tempSystemPrompt, setTempSystemPrompt] = useState(agentSettings.systemPrompt);
  const [tempEffort, setTempEffort] = useState(agentSettings.effort);
  const [tempMaxRounds, setTempMaxRounds] = useState(agentSettings.maxRounds);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
      <button onClick={onBack} className="text-[12px] text-[var(--text-secondary)]">← 返回</button>

      <div>
        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">系统提示词</label>
        <textarea
          value={tempSystemPrompt}
          onChange={(e) => setTempSystemPrompt(e.target.value)}
          className="w-full h-40 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] outline-none custom-scrollbar resize-none"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">执行模式</label>
        <div className="flex gap-1 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-1">
          {["low", "medium", "high"].map((opt) => (
            <button
              key={opt}
              onClick={() => setTempEffort(opt as any)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                tempEffort === opt ? "bg-[var(--accent-1)] text-black" : "text-[var(--text-secondary)]"
              }`}
            >
              {opt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {tempEffort !== "low" && (
        <div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">最大轮数: {tempMaxRounds}</label>
          <input type="range" min={1} max={15} value={tempMaxRounds} onChange={(e) => setTempMaxRounds(Number(e.target.value))} className="w-full accent-[var(--accent-1)]" />
        </div>
      )}

      <button
        onClick={() => { updateSettings({ systemPrompt: tempSystemPrompt, effort: tempEffort, maxRounds: tempMaxRounds }); onBack(); }}
        className="w-full py-2.5 rounded-xl text-white text-[12px] font-bold cursor-pointer"
        style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))" }}
      >
        保存
      </button>
    </div>
  );
}
