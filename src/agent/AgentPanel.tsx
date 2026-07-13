/**
 * AgentPanel — 桌面端 Agent 面板
 *
 * 面板在 flex 布局流中（flex-shrink-0），通过 width 控制收起(60px)/展开(420px)。
 * 浮动 tab 始终贴在左边缘外侧（-left-[24px]），z-50 确保不被主内容遮挡。
 */
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Bot, Plus, History, Settings as SettingsIcon, Save, Sparkles, Zap } from "lucide-react";
import { useTauriAgent } from "./hooks/useTauriAgent";
import { useAgentStore } from "../stores/agentStore";
import { useSettingsStore, type McpServerConfig } from "../stores/settingsStore";
import { HistoryList } from "./components/AgentHeader";
import { AgentChat } from "./components/AgentChat";
import { AgentInput } from "./components/AgentInput";
import { SuggestionBar } from "./components/SuggestionBar";
import { GenerationPreview } from "./components/GenerationPreview";
import { CharacterLibraryModal } from "./components/CharacterLibraryModal";

export function AgentPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"chat" | "history" | "settings">("chat");
  const { settings: agentSettings, updateSettings, activeSessionId } = useAgentStore();

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
    refineSuggestion,
  } = useTauriAgent();

  const [tempSystemPrompt, setTempSystemPrompt] = useState(agentSettings.systemPrompt);
  const [tempReasoningEffort, setTempReasoningEffort] = useState(agentSettings.reasoningEffort || "medium");
  const [tempEffort, setTempEffort] = useState(agentSettings.effort);
  const [tempMaxRounds, setTempMaxRounds] = useState(agentSettings.maxRounds);

  // MCP 服务器配置
  const [tempMcpServers, setTempMcpServers] = useState<McpServerConfig[]>(() =>
    JSON.parse(JSON.stringify(useSettingsStore.getState().settings.mcpServers || [])),
  );

  useEffect(() => {
    setTempSystemPrompt(agentSettings.systemPrompt);
    setTempReasoningEffort(agentSettings.reasoningEffort || "medium");
    setTempEffort(agentSettings.effort);
    setTempMaxRounds(agentSettings.maxRounds);
    const servers = useSettingsStore.getState().settings.mcpServers || [];
    setTempMcpServers(JSON.parse(JSON.stringify(servers)));
  }, [agentSettings, viewMode]);

  const handleSaveSettings = () => {
    updateSettings({
      systemPrompt: tempSystemPrompt,
      reasoningEffort: tempReasoningEffort as any,
      effort: tempEffort,
      maxRounds: tempMaxRounds,
    });
    const curSettings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({ ...curSettings, mcpServers: tempMcpServers });
    setViewMode("chat");
  };

  return (
    <div
      className={`relative flex flex-col bg-[var(--glass-bg)] border-l border-[var(--glass-border)] backdrop-blur-3xl transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex-shrink-0 h-full ${
        isExpanded ? "w-[420px]" : "w-[60px]"
      }`}
      style={{ zIndex: 50, overflow: "visible" }}
    >
      {/* 内层裁剪容器 — 只裁渐变线装饰，不裁浮动 tab，不拦截点击 */}
      <div className="absolute inset-0 overflow-hidden rounded-none pointer-events-none">
        {/* 装饰渐变线 */}
        <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-[var(--accent-1)]/30 to-transparent" />
      </div>

      {/* 浮动收缩/展开 tab — 在外层（不被 overflow:hidden 裁剪） */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`absolute top-1/2 -translate-y-1/2 -left-[24px] w-[24px] h-[80px] flex items-center justify-center border-y border-l cursor-pointer transition-all duration-300 backdrop-blur-xl rounded-l-xl z-50 ${
          isExpanded
            ? "bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-active)] hover:text-[var(--accent-1)] shadow-[-4px_0_15px_rgba(0,0,0,0.3)]"
            : isGenerating
              ? "bg-[var(--accent-1)]/60 border-[var(--accent-1)]/80 text-white shadow-[0_0_25px_var(--accent-1)] animate-pulse"
              : "bg-[var(--accent-1)]/20 border-[var(--accent-1)]/40 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 hover:border-[var(--accent-1)] hover:text-[var(--text-primary)] shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.5)] animate-pulse"
        }`}
        title={isExpanded ? "收起面板" : isGenerating ? "运行中..." : "唤出 AI 助手"}
      >
        {isExpanded ? (
          <ChevronRight size={16} />
        ) : isGenerating ? (
          <Loader2 size={16} className="animate-spin text-white" />
        ) : (
          <ChevronLeft size={16} className="animate-[bounce_2s_infinite_horizontal]" />
        )}
      </button>

      {/* ── 收起状态：竖排迷你图标 ── */}
      {!isExpanded && (
        <div className="flex flex-col items-center gap-3 pt-6 w-full relative z-20">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-1)]/30 to-[var(--accent-2)]/30 border border-[var(--accent-1)]/20 flex items-center justify-center">
              <Bot size={18} className="text-[var(--accent-1)]" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[var(--glass-bg)] animate-pulse" />
          </div>
          {/* 竖排功能按钮 */}
          <div className="flex flex-col gap-2 mt-2">
            <button onClick={() => { useAgentStore.getState().createSession(); setIsExpanded(true); }} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="新会话">
              <Plus size={14} />
            </button>
            <button onClick={() => { setIsExpanded(true); setViewMode("history"); }} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="历史">
              <History size={14} />
            </button>
            <button onClick={() => { setIsExpanded(true); setViewMode("settings"); }} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="设置">
              <SettingsIcon size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── 展开内容 ── */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.3)]">
                <Bot size={17} className="text-white" />
              </div>
              <div>
                <div className="text-[14px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)]">咏唱助手</div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-[var(--text-muted)]">{isGenerating ? "生成中" : "在线"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {viewMode !== "chat" ? (
                <button onClick={() => setViewMode("chat")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="返回对话">
                  <ChevronLeft size={14} />
                </button>
              ) : (
                <>
                  <button onClick={() => { useAgentStore.getState().createSession(); }} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="新会话">
                    <Plus size={14} />
                  </button>
                  <button onClick={() => setViewMode("history")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="历史">
                    <History size={14} />
                  </button>
                  <button onClick={() => setViewMode("settings")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer" title="设置">
                    <SettingsIcon size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Chat view */}
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

          {/* History view */}
          {viewMode === "history" && <HistoryList onBack={() => setViewMode("chat")} />}

            {/* Settings view — 完整设置面板 */}
            {viewMode === "settings" && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                {/* 顶部操作栏 */}
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-[var(--text-primary)] tracking-wide">核心控制面板</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const debugData = { activeSessionId, settings: agentSettings, messages, mcpServers: tempMcpServers };
                          await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                          const btn = document.getElementById("debug-copy-btn");
                          if (btn) { const t = btn.innerHTML; btn.innerHTML = "已复制!"; setTimeout(() => btn.innerHTML = t, 2000); }
                        } catch {}
                      }}
                      id="debug-copy-btn"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-layer-0)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors text-[10px] cursor-pointer"
                      title="复制当前会话完整信息用于DEBUG"
                    >
                      <History size={11} /> 复制调试
                    </button>
                    <button
                      onClick={handleSaveSettings}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 transition-colors text-[10px] cursor-pointer"
                    >
                      <Save size={11} /> 保存
                    </button>
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block text-[11px] font-bold text-[var(--accent-1)] mb-1.5">系统人格 (System Prompt)</label>
                  <textarea
                    value={tempSystemPrompt}
                    onChange={(e) => setTempSystemPrompt(e.target.value)}
                    className="w-full h-40 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-1)]/50 outline-none resize-none font-mono leading-relaxed custom-scrollbar"
                    placeholder="输入系统提示词..."
                  />
                </div>

                {/* Reasoning Effort */}
                <div>
                  <label className="text-[11px] font-bold text-[var(--text-primary)] mb-1.5 flex items-center gap-1.5">
                    <Zap size={12} className="text-[var(--accent-1)]" /> 思考深度 (Reasoning Effort)
                  </label>
                  <div className="flex bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-1 gap-1">
                    {(["low", "medium", "high"] as const).map((effort) => (
                      <button
                        key={effort}
                        onClick={() => setTempReasoningEffort(effort)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          tempReasoningEffort === effort
                            ? "bg-[var(--accent-1)] text-black shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.3)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]"
                        }`}
                      >
                        {effort.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Execution Mode (Effort) */}
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
                        {ef === "low" ? "LOW (弱模型)" : ef === "medium" ? "MEDIUM" : "HIGH (强模型)"}
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
              </div>
            )}
        </div>
      )}
    </div>
  );
}
