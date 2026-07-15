/**
 * MobileAgentPanel — 移动端 Agent 全屏面板
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Bot, Plus, History, Settings as SettingsIcon, ChevronLeft, Save, Sparkles, Zap } from "lucide-react";
import { useTauriAgent } from "./hooks/useTauriAgent";
import { useAgentStore } from "../stores/agentStore";
import { useSettingsStore, type McpServerConfig } from "../stores/settingsStore";
import { HistoryList } from "./components/AgentHeader";
import { AgentChat } from "./components/AgentChat";
import { AgentInput } from "./components/AgentInput";
import { SuggestionBar } from "./components/SuggestionBar";
import { GenerationPreview } from "./components/GenerationPreview";
import { CharacterLibraryModal } from "./components/CharacterLibraryModal";
import { ModelPickerModal } from "./components/ModelPickerModal";

export function MobileAgentPanel() {
  const { isMobileAgentOpen, toggleMobileAgent, createSession, settings: agentSettings, updateSettings } = useAgentStore();
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
    characterModal,
    confirmCharacters,
    openCharacterLibrary,
    closeCharacterModal,
    modelModal,
    confirmModel,
    closeModelModal,
    refineSuggestion,
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
          <AgentChat messages={messages} onAction={sendMessage} isGenerating={isGenerating} />

          {activePreview && (
            <GenerationPreview preview={activePreview} onApprove={approvePreview} onReject={rejectPreview} />
          )}

          {characterModal?.open && (
            <CharacterLibraryModal
              isOpen={characterModal.open}
              initialKind={characterModal.kind}
              initialSeries={characterModal.series}
              onClose={closeCharacterModal}
              onConfirm={confirmCharacters}
            />
          )}

          {modelModal?.open && (
            <ModelPickerModal
              kind={modelModal.kind}
              onClose={closeModelModal}
              onConfirm={(name) => confirmModel(name, modelModal.kind)}
            />
          )}

          {suggestions.length > 0 && (
            <SuggestionBar
              suggestions={suggestions}
              onSelect={(msg) => { clearSuggestions(); sendMessage(msg); }}
              onRefine={refineSuggestion}
            />
          )}

          <AgentInput
            onSend={sendMessage}
            onStop={stopGenerating}
            isGenerating={isGenerating}
            tokenUsage={tokenUsage}
            onOpenHistory={() => setViewMode("history")}
            focusMode={agentSettings.focusMode}
            onToggleFocusMode={() => updateSettings({ focusMode: !agentSettings.focusMode })}
            onOpenCharacterLibrary={openCharacterLibrary}
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
  const [tempMcpServers, setTempMcpServers] = useState<McpServerConfig[]>(() =>
    JSON.parse(JSON.stringify(useSettingsStore.getState().settings.mcpServers || [])),
  );

  const handleSave = () => {
    updateSettings({
      systemPrompt: tempSystemPrompt,
      effort: tempEffort,
      maxRounds: tempMaxRounds,
    });
    const curSettings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({ ...curSettings, mcpServers: tempMcpServers });
    onBack();
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-[12px] text-[var(--text-secondary)]">← 返回</button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] text-[10px] font-bold cursor-pointer"
        >
          <Save size={11} /> 保存
        </button>
      </div>

      {/* System Prompt */}
      <div>
        <label className="text-[10px] font-bold text-[var(--accent-1)] uppercase tracking-wider mb-1.5 block">系统人格 (System Prompt)</label>
        <textarea
          value={tempSystemPrompt}
          onChange={(e) => setTempSystemPrompt(e.target.value)}
          className="w-full h-40 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] outline-none custom-scrollbar resize-none font-mono leading-relaxed"
          placeholder="输入系统提示词..."
        />
      </div>

      {/* Execution Mode */}
      <div>
        <label className="text-[11px] font-bold text-[var(--text-primary)] mb-1.5 flex items-center gap-1.5">
          <Zap size={12} className="text-[var(--accent-1)]" /> 执行模式 (Effort)
        </label>
        <div className="flex bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-1 gap-1">
          {(["low", "medium", "high"] as const).map((ef) => (
            <button
              key={ef}
              onClick={() => setTempEffort(ef)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                tempEffort === ef
                  ? "bg-[var(--accent-1)] text-black shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.3)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]"
              }`}
            >
              {ef === "low" ? "LOW (弱)" : ef === "medium" ? "MEDIUM" : "HIGH (强)"}
            </button>
          ))}
        </div>
        {tempEffort !== "low" && (
          <div className="mt-2">
            <label className="text-[10px] text-[var(--text-secondary)] mb-1 block">最大工具调用轮次: {tempMaxRounds}</label>
            <input type="range" min={1} max={15} value={tempMaxRounds} onChange={(e) => setTempMaxRounds(Number(e.target.value))} className="w-full accent-[var(--accent-1)] cursor-pointer" />
          </div>
        )}
      </div>

      {/* Toolkits status */}
      <div className="p-3 rounded-xl bg-[var(--accent-2)]/20 border border-[var(--accent-2)]/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-2)]" />
        <h4 className="font-bold text-[var(--accent-2)] text-[11px] mb-1 flex items-center gap-1.5"><Sparkles size={12} /> 工具包状态</h4>
        <ul className="mt-2 space-y-1 text-[10px] text-[var(--accent-2)]/80 font-mono">
          <li className="flex items-center justify-between"><span>• search_prompts</span> <span className="text-[9px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded">ACTIVE</span></li>
          <li className="flex items-center justify-between"><span>• create_prompt</span> <span className="text-[9px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded">ACTIVE</span></li>
          <li className="flex items-center justify-between"><span>• generate_image</span> <span className="text-[9px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded">ACTIVE</span></li>
          {tempMcpServers.filter((s) => s.enabled).length > 0 && (
            <li className="flex items-center justify-between"><span>• MCP: {tempMcpServers.filter((s) => s.enabled).length} server(s)</span> <span className="text-[9px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded">EXT</span></li>
          )}
        </ul>
      </div>

      {/* MCP Servers */}
      <div className="p-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)]">
        <h4 className="font-bold text-[var(--text-primary)] text-[11px] mb-2.5 flex items-center gap-1.5">
          <Sparkles size={12} className="text-[var(--accent-2)]" /> MCP 外部工具服务器
        </h4>
        <div className="space-y-2.5">
          {tempMcpServers.map((srv, i) => (
            <div key={i} className={`p-2.5 rounded-lg border transition-colors ${srv.enabled ? "bg-[var(--accent-2)]/5 border-[var(--accent-2)]/20" : "bg-[var(--bg-layer-1)] border-[var(--glass-border)] opacity-60"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-[var(--text-primary)]">{srv.name}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={srv.enabled}
                    onChange={() => {
                      const updated = [...tempMcpServers];
                      updated[i] = { ...updated[i], enabled: !updated[i].enabled };
                      setTempMcpServers(updated);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-[var(--glass-border)] rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[var(--accent-2)] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all" />
                </label>
              </div>
              <input
                type="text"
                value={srv.url}
                onChange={(e) => {
                  const updated = [...tempMcpServers];
                  updated[i] = { ...updated[i], url: e.target.value };
                  setTempMcpServers(updated);
                }}
                className="w-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-[10px] text-[var(--text-secondary)] font-mono outline-none focus:border-[var(--accent-2)]/50"
                placeholder="MCP Server URL"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2.5 rounded-xl text-white text-[12px] font-bold cursor-pointer"
        style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))" }}
      >
        保存设置
      </button>
    </div>
  );
}
