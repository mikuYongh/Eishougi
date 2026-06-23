import { Bot, Send, Sparkles, Settings, Plus, History, ChevronRight, ChevronLeft, Wrench, Zap, Loader2, Trash2, ArrowLeft, Save, ImagePlus, X, ArrowDown, Paperclip, FileText } from "lucide-react";
import React, { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useAgent } from "../../hooks/useAgent";
import { useAgentStore } from "../../stores/agentStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { McpServerConfig } from "../../stores/settingsStore";
import type { ChatAttachment } from "../../hooks/useAgent";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage } from "../../hooks/useAgent";
import { toast } from "sonner";
import { MarkdownContent } from "./MarkdownContent";
import { HistoryImagePicker } from "../ui/HistoryImagePicker";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { convertFileSrc } from "@tauri-apps/api/core";
import { PhotoView } from 'react-photo-view';
import { cn } from "../../lib/utils";
import { getImgSrc } from "../../utils/imageUtils";




type ViewMode = 'chat' | 'history' | 'settings';

function ChatImage({ src }: { src: string }) {
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  return (
    <PhotoView src={getImgSrc(src)}>
      <img src={getImgSrc(src)} className={`max-w-xs max-h-64 object-contain rounded-lg border border-[var(--glass-border)] mt-2 cursor-zoom-in transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} alt="chat-attachment" />
    </PhotoView>
  );
}

const AgentFooter = React.forwardRef<HTMLDivElement, { context?: { isGenerating: boolean } }>(({ context }, ref) => {
  // Loading 反馈由空 assistant 气泡的"思考中..."占位统一负责，
  // Footer 只保留一个占位 div 防止最后一条消息贴着输入框。
  void context;
  return <div ref={ref} className="h-4" />;
});

export function AgentPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<{ path: string, previewUrl: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ChatAttachment[]>([]);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!window.visualViewport) return;
    const updateKeyboardHeight = () => {
      // Calculate how much the visual viewport has shrunk relative to the window innerHeight
      const offset = window.innerHeight - window.visualViewport!.height;
      setKeyboardHeight(Math.max(0, offset));
    };
    window.visualViewport.addEventListener("resize", updateKeyboardHeight);
    window.visualViewport.addEventListener("scroll", updateKeyboardHeight);
    updateKeyboardHeight();
    return () => {
      window.visualViewport?.removeEventListener("resize", updateKeyboardHeight);
      window.visualViewport?.removeEventListener("scroll", updateKeyboardHeight);
    };
  }, []);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  
  const { messages, isGenerating, sendMessage, stopGenerating } = useAgent();
  const { sessions, activeSessionId, createSession, switchSession, deleteSession, settings, updateSettings } = useAgentStore();
  
  const [tempSystemPrompt, setTempSystemPrompt] = useState(settings.systemPrompt);
  const [tempReasoningEffort, setTempReasoningEffort] = useState(settings.reasoningEffort || 'medium');
  const [tempEffort, setTempEffort] = useState<'low' | 'medium' | 'high'>(settings.effort || 'medium');
  const [tempMaxRounds, setTempMaxRounds] = useState<number>(settings.maxRounds || 8);
  const mcp = useSettingsStore.getState().settings.mcpServers || [];
  const [tempMcpServers, setTempMcpServers] = useState<McpServerConfig[]>(() => 
    JSON.parse(JSON.stringify(mcp))
  );

  useEffect(() => {
    const servers = useSettingsStore.getState().settings.mcpServers || [];
    setTempMcpServers(JSON.parse(JSON.stringify(servers)));
  }, [viewMode]);
  
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Auto scroll to bottom when messages or isGenerating changes, or panel opens
  useEffect(() => {
    if (isExpanded && viewMode === 'chat' && virtuosoRef.current && messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'auto' });
      }, 150);
    }
  }, [messages.length, isGenerating, viewMode, isExpanded]);

  // 旧版本会在这里用 useEffect 强制覆盖用户的 systemPrompt 为内置 default。
  // 该行为会静默丢失用户在设置面板里做的定制，已移除。
  // systemPrompt 的真相源是 agentStore.ts 的 defaultSystemPrompt + 用户的显式编辑。
  // 版本升级需要迁移时，应通过 zustand persist 的 migrate 钩子显式做，而不是基于关键字嗅探。




  const handleSend = () => {
    const attachments: ChatAttachment[] = [
      ...selectedImages.map(img => ({ path: img.path, name: 'image', mime: '', isImage: true })),
      ...selectedFiles,
    ];
    if ((inputValue.trim() || attachments.length > 0) && !isGenerating) {
      sendMessage(inputValue, attachments);
      setInputValue("");
      setSelectedImages([]);
      setSelectedFiles([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      const isImage = file.type.startsWith('image/');
      try {
        if (isImage) {
          const savedPath = await invoke<string>('save_base64_image', { base64Data });
          setSelectedImages(prev => [...prev, { path: savedPath, previewUrl: base64Data }]);
        } else {
          const savedPath = await invoke<string>('save_base64_file', {
            base64Data,
            originalName: file.name,
          });
          setSelectedFiles(prev => [...prev, {
            path: savedPath,
            name: file.name,
            mime: file.type || '',
            isImage: false,
          }]);
        }
      } catch (err) {
        console.error("Upload image error", err);
        toast.error("上传失败: " + String(err));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset input
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSend();
    }
  };

  const handleNewChat = () => {
    createSession();
    setViewMode('chat');
    if (!isExpanded) setIsExpanded(true);
  };

  const handleSaveSettings = () => {
    updateSettings({
      systemPrompt: tempSystemPrompt,
      reasoningEffort: tempReasoningEffort,
      effort: tempEffort,
      maxRounds: tempMaxRounds,
    });
    const curSettings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({ ...curSettings, mcpServers: tempMcpServers });
    setViewMode('chat');
  };

  const renderMessageContent = (msg: ChatMessage) => {
    // 共享的图片/视频渲染——tool / user / assistant 消息都能有附件
    const renderImages = (images: any[] | undefined) => {
      if (!images || images.length === 0) return null;
      return (
        <div className="flex gap-2 flex-wrap mt-2">
          {images.map((img, i) => {
            const o = img as any;
            const src = typeof o === 'string' ? o : (o?.url || o?.filePath || o?.outputPath || o?.path || '');
            if (!src) return null;
            const ext = (typeof src === 'string' ? src.split('?')[0].split('.').pop()?.toLowerCase() : '') || '';
            const isVideo = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v'].includes(ext);
            return isVideo
              ? <video key={i} src={getImgSrc(src)} controls className="max-w-xs max-h-64 rounded-lg border border-[var(--glass-border)] mt-2" />
              : <ChatImage key={i} src={src} />;
          })}
        </div>
      );
    };

    if (msg.role === 'tool') {
      return (
        <div className="flex flex-col gap-2 p-3 mt-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--accent-1)]/30 text-[11px] text-[var(--text-primary)] font-mono overflow-x-auto custom-scrollbar shadow-[0_0_15px_rgba(var(--accent-1-rgb), 15)] relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-1)] rounded-l-xl animate-pulse" />
          <div className="flex items-center gap-2 text-[var(--accent-1)] mb-1 ml-2">
            <Wrench size={14} className="animate-[spin_4s_linear_infinite]" />
            <span className="font-bold tracking-widest uppercase">System Execution: {msg.name}</span>
          </div>
          <div className="ml-2 opacity-80 whitespace-pre-wrap">{msg.content}</div>
        </div>
      );
    }
    
    // User or assistant message
    return (
      <div className="break-words leading-relaxed w-full">
        {msg.role === 'user' ? (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        ) : msg.content ? (
          <div className="text-[14px]">
            <MarkdownContent content={msg.content} />
          </div>
        ) : (!msg.tool_calls || msg.tool_calls.length === 0) ? (
          // assistant 流式尚未吐第一个字时的占位反馈
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] font-mono">
            <Loader2 size={14} className="animate-spin text-[var(--accent-1)]" />
            <span className="tracking-widest uppercase animate-pulse">思考中...</span>
          </div>
        ) : null}
        
        {renderImages(msg.images)}
        
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <div className={`${msg.content ? 'mt-3' : ''} flex flex-col gap-2 max-w-full`}>
            {msg.tool_calls.map((tc, idx) => (
              <div key={idx} className="flex flex-col gap-2 p-3 mt-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--accent-2)]/30 text-[11px] text-[var(--text-primary)] font-mono overflow-x-auto custom-scrollbar shadow-[0_0_15px_rgba(var(--accent-2-rgb), 15)] relative group">
                <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-2)] rounded-l-xl animate-pulse opacity-80 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-2 text-[var(--accent-2)] mb-1 ml-2">
                  <Zap size={14} className="animate-pulse" />
                  <span className="font-bold tracking-widest uppercase">Requesting Protocol: {tc.function.name}</span>
                </div>
                <div className="ml-2 text-[var(--text-secondary)] whitespace-pre-wrap break-all custom-scrollbar overflow-x-auto">{tc.function.arguments}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Placeholder to reserve space in flex layout when collapsed/expanded */}
      <div className="hidden md:block w-[70px] flex-shrink-0 h-full" />
      <div
        className={cn(
          "flex flex-col z-50 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-[var(--glass-bg)] border-[var(--glass-border)] backdrop-blur-3xl",
          "md:flex-shrink-0 md:h-full md:border-l md:shadow-[-10px_0_40px_rgba(0,0,0,0.2)]",
          "fixed md:absolute md:left-auto md:right-0 md:top-0 inset-x-0 bottom-0 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] md:shadow-none border-t md:border-t-0 rounded-t-3xl md:rounded-t-none",
        isExpanded ? "h-[90vh] md:h-full translate-y-0 opacity-100" : "h-0 md:h-full translate-y-full md:translate-y-0 opacity-0 md:opacity-100"
      )}
      style={{
        width: "100%",
        maxWidth: isExpanded ? "420px" : "70px",
        paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : undefined,
      }}
    >
      {/* Decorative vertical gradient line */}
      <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-[var(--accent-1)]/30 to-transparent pointer-events-none" />

      {/* Collapse/Expand Handle - hide on very small screens if we prefer a different trigger, or keep it */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`absolute top-1/2 -translate-y-1/2 -left-[24px] w-[24px] h-[80px] hidden md:flex items-center justify-center border-y border-l text-[var(--text-primary)] cursor-pointer transition-all duration-300 backdrop-blur-xl z-20 rounded-l-xl ${
          isExpanded 
            ? "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-active)] hover:text-[var(--accent-1)] shadow-[-4px_0_15px_rgba(0,0,0,0.3)]" 
            : isGenerating
              ? "bg-[var(--accent-1)]/60 border-[var(--accent-1)]/80 text-white shadow-[0_0_25px_var(--accent-1)] animate-pulse"
              : "bg-[var(--accent-1)]/20 border-[var(--accent-1)]/40 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 hover:border-[var(--accent-1)] hover:text-[var(--text-primary)] shadow-[0_0_20px_rgba(var(--accent-1-rgb), 0.5)] animate-pulse"
        }`}
        title={isExpanded ? "收起面板" : isGenerating ? "NEXUS 运行中..." : "唤出 AI 助手"}
      >
        {isExpanded ? <ChevronRight size={16} /> : isGenerating ? <Loader2 size={16} className="animate-spin text-white" /> : <ChevronLeft size={16} className="animate-[bounce_2s_infinite_horizontal]" />}
      </button>

      {/* INNER WRAPPER to prevent content from overflowing during transition */}
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden relative">
        
      {/* Header */}
      <div
        className={`flex items-center flex-shrink-0 transition-all duration-300 border-b border-[var(--glass-border)] ${isExpanded ? "justify-start px-5 py-5" : "justify-center px-2 pt-3 pb-4"}`}
      >
        {isExpanded ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] text-[var(--bg-layer-0)] shadow-[0_0_15px_rgba(var(--accent-1-rgb), 50)]">
                <Bot size={18} />
              </div>
              <div>
                <span className="text-[15px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] tracking-wide block">NEXUS AGENT</span>
                <span className="text-[10px] text-[var(--accent-1)]/80 font-mono tracking-widest uppercase">System Active</span>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-3 ml-auto text-[var(--text-secondary)]">
              <button 
                onClick={() => setViewMode(viewMode === 'history' ? 'chat' : 'history')} 
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'history' ? 'bg-[var(--accent-1)]/20 text-[var(--accent-1)]' : 'hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`} 
                title="历史记录"
              >
                <History size={16} />
              </button>
              <button 
                onClick={() => setViewMode(viewMode === 'settings' ? 'chat' : 'settings')} 
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'settings' ? 'bg-[var(--accent-1)]/20 text-[var(--accent-1)]' : 'hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`} 
                title="配置"
              >
                <Settings size={16} />
              </button>
              <div className="w-px h-4 bg-[var(--glass-border)] mx-1" />
              <button 
                onClick={handleNewChat} 
                className="p-1.5 rounded-lg bg-[var(--accent-1)]/10 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/20 hover:text-[var(--accent-1)] transition-all cursor-pointer" 
                title="新建对话"
              >
                <Plus size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-col items-center w-full">
            <div 
              className="flex items-center justify-center w-12 h-12 mb-3 rounded-2xl bg-gradient-to-br from-[var(--accent-1)]/20 to-[var(--accent-2)]/20 border border-[var(--accent-1)]/30 text-[var(--accent-1)] group relative cursor-pointer hover:shadow-[0_0_20px_rgba(var(--accent-1-rgb), 40)] hover:scale-105 transition-all duration-300" 
              onClick={() => setIsExpanded(true)}
              title="唤出 NEXUS AGENT"
            >
              <Bot size={24} className="group-hover:animate-pulse" />
              <div className="absolute top-0 right-0 w-3 h-3 bg-[var(--accent-1)] rounded-full animate-ping opacity-75" />
              <div className="absolute top-0 right-0 w-3 h-3 bg-[var(--accent-1)] rounded-full" />
            </div>
            <div className="w-8 h-px bg-gradient-to-r from-transparent via-[var(--glass-border)] to-transparent mb-3" />
            <div className="flex flex-col gap-4 items-center w-full">
              <button onClick={handleNewChat} className="p-2 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-1)] transition-all cursor-pointer" title="新建对话">
                <Plus size={20} />
              </button>
              <button onClick={() => { setIsExpanded(true); setViewMode('history'); }} className="p-2 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-all cursor-pointer" title="历史记录">
                <History size={20} />
              </button>
              <button onClick={() => { setIsExpanded(true); setViewMode('settings'); }} className="p-2 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-all cursor-pointer" title="配置">
                <Settings size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile-only toggle button when collapsed */}
      {!isExpanded && (
        <button 
          onClick={() => setIsExpanded(true)}
          className="md:hidden fixed bottom-20 right-4 w-12 h-12 rounded-full bg-[var(--accent-1)]/20 border border-[var(--accent-1)]/40 text-[var(--accent-1)] flex items-center justify-center shadow-[0_0_20px_rgba(var(--accent-1-rgb),30)] backdrop-blur-md z-[100]"
        >
          <Bot size={24} />
        </button>
      )}

      {/* Mobile-only Header Close Button */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-[var(--glass-border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-[var(--accent-1)]" />
          <span className="font-bold text-[14px] text-[var(--text-primary)]">NEXUS AGENT</span>
        </div>
        <button 
          onClick={() => setIsExpanded(false)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 flex flex-col overflow-hidden transition-all duration-500 relative w-full"
        style={{ 
          opacity: isExpanded ? 1 : 0, 
          pointerEvents: isExpanded ? "auto" : "none"
        }}
      >
        {/* Background watermark */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03]">
          <Bot size={200} />
        </div>

        {/* View Mode: HISTORY */}
        {viewMode === 'history' && (
          <div className="absolute inset-0 z-20 bg-[var(--glass-bg)] backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-300">
            <div className="p-4 border-b border-[var(--glass-border)] flex items-center gap-3">
              <button onClick={() => setViewMode('chat')} className="p-2 rounded-lg hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                <ArrowLeft size={16} />
              </button>
              <h3 className="font-bold text-[var(--text-primary)] tracking-wide">神经网络日志 <span className="text-xs text-[var(--text-secondary)] ml-2 font-mono">{sessions.length} RECORD(S)</span></h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {sessions.length === 0 ? (
                <div className="text-center text-[var(--text-secondary)] mt-10 text-sm">暂无记录</div>
              ) : (
                sessions.map(session => (
                  <div 
                    key={session.id}
                    onClick={() => { switchSession(session.id); setViewMode('chat'); }}
                    className={`p-4 rounded-xl border flex flex-col gap-2 cursor-pointer transition-all group ${
                      session.id === activeSessionId 
                        ? 'bg-[var(--accent-1)]/10 border-[var(--accent-1)]/30 shadow-[0_0_15px_rgba(var(--accent-1-rgb), 10)]' 
                        : 'bg-[var(--glass-bg-hover)] border-[var(--glass-border)] hover:bg-[var(--bg-layer-1)] hover:border-[var(--glass-border-active)]'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-[14px] text-[var(--text-primary)] line-clamp-1 flex-1 group-hover:text-[var(--accent-1)] transition-colors">{session.title}</h4>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                        className="p-1 rounded bg-[var(--bg-layer-0)] text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-400/20 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-[var(--text-secondary)]">{session.messages.length} msgs</span>
                      <span className="text-[var(--accent-1)]/40">{new Date(session.updatedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* View Mode: SETTINGS */}
        {viewMode === 'settings' && (
          <div className="absolute inset-0 z-20 bg-[var(--glass-bg)] backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-300">
            <div className="p-4 border-b border-[var(--glass-border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setViewMode('chat')} className="p-2 rounded-lg hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                  <ArrowLeft size={16} />
                </button>
                <h3 className="font-bold text-[var(--text-primary)] tracking-wide">核心控制面板</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={async () => {
                    try {
                      const debugData = { activeSessionId, settings, messages };
                      await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                      const btn = document.getElementById('debug-copy-btn');
                      if (btn) {
                        const originalText = btn.innerHTML;
                        btn.innerHTML = '已复制!';
                        setTimeout(() => btn.innerHTML = originalText, 2000);
                      }
                    } catch (e) {}
                  }}
                  id="debug-copy-btn"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-layer-0)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white hover:bg-white/10 transition-colors text-sm cursor-pointer"
                  title="复制当前会话完整信息用于DEBUG"
                >
                  <History size={14} /> 复制调试信息
                </button>
                <button 
                  onClick={handleSaveSettings}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 transition-colors text-sm cursor-pointer"
                >
                  <Save size={14} /> 保存
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-[var(--accent-1)] mb-2">系统人格 (System Prompt)</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                    定义 Agent 的身份、性格以及默认行为准则。NEXUS 默认拥有调用本地工具库的能力，修改此项将影响其对话风格。
                  </p>
                  <textarea 
                    value={tempSystemPrompt}
                    onChange={(e) => setTempSystemPrompt(e.target.value)}
                    className="w-full h-48 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-1)]/50 focus:shadow-[0_0_20px_rgba(var(--accent-1-rgb), 15)] outline-none resize-none font-mono leading-relaxed custom-scrollbar"
                    placeholder="输入系统提示词..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <Zap size={14} className="text-[var(--accent-1)]" />
                    思考深度 (Reasoning Effort)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                    调整支持此参数的模型（如 o1, o3, DeepSeek-R1）的推理深度。较深推理可获得更好的提示词结构，但生成更慢。
                  </p>
                  <div className="flex bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-1 gap-1">
                    {(['low', 'medium', 'high'] as const).map(effort => (
                      <button
                        key={effort}
                        onClick={() => setTempReasoningEffort(effort)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                          tempReasoningEffort === effort
                            ? 'bg-[var(--accent-1)] text-black shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.4)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                        }`}
                      >
                        {effort.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <Zap size={14} className="text-[var(--accent-1)]" />
                    执行模式 (Effort)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                    弱模型建议选 LOW：只允许一轮工具调用，避免多轮决策跑飞。强模型可选 HIGH 做深度探索。
                  </p>
                  <div className="flex bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-1 gap-1">
                    {(['low', 'medium', 'high'] as const).map(ef => (
                      <button
                        key={ef}
                        onClick={() => setTempEffort(ef)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                          tempEffort === ef
                            ? 'bg-[var(--accent-1)] text-black shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.4)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                        }`}
                      >
                        {ef === 'low' ? 'LOW (弱模型)' : ef === 'medium' ? 'MEDIUM' : 'HIGH (强模型)'}
                      </button>
                    ))}
                  </div>
                  {tempEffort !== 'low' && (
                    <div className="mt-3">
                      <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">最大工具调用轮次: {tempMaxRounds}</label>
                      <input
                        type="range"
                        min={1}
                        max={15}
                        value={tempMaxRounds}
                        onChange={(e) => setTempMaxRounds(Number(e.target.value))}
                        className="w-full accent-[var(--accent-1)]"
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[var(--accent-2)]/20 border border-[var(--accent-2)]/20 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-2)]" />
                  <h4 className="font-bold text-[var(--accent-2)] text-sm mb-1 flex items-center gap-2"><Sparkles size={14} /> 工具包状态 (Toolkits)</h4>
                  <p className="text-xs text-[var(--accent-2)]/50">当前预装了以下原生系统能力：</p>
                  <ul className="mt-3 space-y-2 text-xs text-[var(--accent-2)]/80 font-mono">
                    <li className="flex items-center justify-between"><span>• search_prompts</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">ACTIVE</span></li>
                    <li className="flex items-center justify-between"><span>• create_prompt</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">ACTIVE</span></li>
                    <li className="flex items-center justify-between"><span>• generate_image</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">ACTIVE</span></li>
                    {tempMcpServers.filter(s => s.enabled).length > 0 && (
                      <li className="flex items-center justify-between"><span>• MCP: {tempMcpServers.filter(s => s.enabled).length} server(s)</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">EXT</span></li>
                    )}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)]">
                  <h4 className="font-bold text-[var(--text-primary)] text-sm mb-3 flex items-center gap-2">
                    <Sparkles size={14} className="text-[var(--accent-2)]" /> MCP 外部工具服务器
                  </h4>
                  <div className="space-y-3">
                    {tempMcpServers.map((srv, i) => (
                      <div key={i} className={`p-3 rounded-lg border transition-colors ${srv.enabled ? 'bg-[var(--accent-2)]/5 border-[var(--accent-2)]/20' : 'bg-[var(--bg-layer-1)] border-[var(--glass-border)] opacity-60'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">{srv.name}</span>
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
                            <div className="w-8 h-4 bg-[var(--glass-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:bg-[var(--accent-2)] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
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
                          className="w-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] font-mono outline-none focus:border-purple-500/50"
                          placeholder="MCP Server URL"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode: CHAT (Default) */}
        {/* Messages area */}
        <div className="flex-1 overflow-hidden relative z-10">
          {messages.length === 0 ? (
            <div className="p-6">
              <div className="p-5 rounded-2xl text-sm leading-relaxed relative overflow-hidden bg-[var(--glass-bg)] text-[var(--text-primary)] border border-[var(--accent-1)]/20 shadow-[0_10px_30px_rgba(0,0,0,0.1)] backdrop-blur-md">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-1)] to-transparent opacity-50" />
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-[var(--accent-1)]/20">
                    <Sparkles size={16} className="text-[var(--accent-1)]" />
                  </div>
                  <span className="font-bold text-[var(--accent-1)] text-lg tracking-wide">NEXUS 系统已就绪</span>
                </div>
                <p className="text-[var(--text-secondary)] mb-4">我是您的专属创意中枢。您可以通过自然语言向我下达以下指令：</p>
                <ul className="space-y-2 text-[var(--text-secondary)] font-mono text-xs">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)]" /> 检索本地提示词库</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-2)]" /> 自动构建并保存 Prompt</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] opacity-70" /> 一键触发引擎生成图片</li>
                </ul>
              </div>
            </div>
          ) : (
              <Virtuoso
                ref={virtuosoRef}
                className="h-full custom-scrollbar"
                data={messages}
                initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
                followOutput="smooth"
                context={{ isGenerating }}
                atBottomStateChange={(atBottom) => {
                  const btn = document.getElementById('agent-scroll-bottom-btn');
                  if (btn) {
                    if (!atBottom) {
                      btn.style.opacity = '1';
                      btn.style.pointerEvents = 'auto';
                      btn.style.transform = 'translateY(0)';
                    } else {
                      btn.style.opacity = '0';
                      btn.style.pointerEvents = 'none';
                      btn.style.transform = 'translateY(10px)';
                    }
                  }
                }}
                itemContent={(index, msg) => (
                  <div className="px-6 py-3">
                    <div 
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}
                    >
                      <div 
                        className={`max-w-[92%] text-[14px] relative group ${
                          msg.role === 'user' 
                            ? 'p-4 bg-[var(--glass-bg)] text-[var(--text-primary)] rounded-2xl rounded-tr-sm border border-[var(--accent-1)]/30 backdrop-blur-md shadow-[0_4px_15px_rgba(var(--accent-1-rgb), 10)]' 
                            : msg.role === 'tool' || (!msg.content && msg.tool_calls && msg.tool_calls.length > 0)
                            ? 'p-0 bg-transparent w-full shadow-none mt-2'
                            : 'p-4 bg-[var(--glass-bg)] text-[var(--text-primary)] rounded-2xl rounded-tl-sm border border-[var(--glass-border)] backdrop-blur-xl shadow-[0_4px_15px_rgba(0,0,0,0.15)]'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="absolute -left-10 top-0 w-8 h-8 rounded-full border border-[var(--accent-1)]/30 bg-[var(--bg-layer-0)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Bot size={14} className="text-[var(--accent-1)]" />
                          </div>
                        )}
                        {renderMessageContent(msg)}
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] mt-1.5 font-mono px-1">
                        {msg.role.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
                components={{
                  Footer: AgentFooter
                }}
              />
            )}

            {/* Scroll to bottom button */}
            <button
              id="agent-scroll-bottom-btn"
              onClick={() => virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' })}
              className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-[var(--accent-1)] text-white flex items-center justify-center hover:bg-[var(--accent-1)]/80 shadow-[0_4px_15px_rgba(var(--accent-1-rgb),0.5)] transition-all duration-300 opacity-0 pointer-events-none translate-y-[10px]"
            >
              <ArrowDown size={18} />
            </button>
          </div>

        {/* Input */}
        <div className="p-5 flex-shrink-0 border-t border-[var(--glass-border)] bg-[var(--bg-layer-2)]/80 z-10">
          <div className="flex flex-col gap-2 p-2 rounded-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] shadow-[inset_0_2px_15px_rgba(0,0,0,0.1)] focus-within:border-[var(--accent-1)]/50 focus-within:shadow-[0_0_20px_rgba(var(--accent-1-rgb), 15)] transition-all duration-300 group">
            {selectedImages.length > 0 && (
              <div className="flex gap-2 px-2 pt-2 overflow-x-auto custom-scrollbar">
                {selectedImages.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-[var(--accent-1)]/30 flex-shrink-0 group">
                    <img src={getImgSrc(img.previewUrl)} alt="preview" className={`w-full h-full object-cover transition-all duration-300 ${privacyMode ? 'blur-md group-hover:blur-none' : ''}`} />
                    <button
                      onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0 right-0 p-1 bg-[var(--bg-layer-0)] text-[var(--text-primary)] hover:text-red-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selectedFiles.length > 0 && (
              <div className="flex gap-2 px-2 pt-2 overflow-x-auto custom-scrollbar">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="relative flex items-center gap-2 px-3 h-10 rounded-md border border-[var(--accent-2)]/30 bg-[var(--bg-layer-1)] flex-shrink-0 group max-w-[200px]">
                    <FileText size={14} className="text-[var(--accent-2)] flex-shrink-0" />
                    <span className="text-[11px] text-[var(--text-primary)] truncate font-mono">{f.name}</span>
                    <button
                      onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full resize-none bg-transparent px-3 py-2 text-[14px] outline-none font-sans min-h-[44px] max-h-[120px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] custom-scrollbar"
              placeholder="输入神经指令... (Ctrl+Enter 执行)"
              rows={1}
              style={{
                height: inputValue ? Math.min(120, Math.max(44, inputValue.split('\n').length * 24 + 20)) + 'px' : '44px'
              }}
            />
            <div className="flex justify-between items-center px-2 pb-1">
              <div className="flex items-center gap-3">
                <label className="text-[var(--accent-1)] hover:text-[var(--accent-2)] cursor-pointer transition-colors p-1" title="上传图片">
                  <ImagePlus size={18} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
                <label className="text-[var(--accent-1)] hover:text-[var(--accent-2)] cursor-pointer transition-colors p-1" title="上传文件">
                  <Paperclip size={18} />
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
                <button
                  onClick={() => setShowHistoryPicker(true)}
                  className="text-[var(--accent-1)] hover:text-[var(--accent-2)] cursor-pointer transition-colors p-1"
                  title="从历史记录选择图片"
                >
                  <History size={18} />
                </button>
                <span className="text-[10px] font-mono text-[var(--accent-1)]/40 uppercase tracking-widest group-focus-within:text-[var(--accent-1)]/80 transition-colors ml-2">
                  Nexus Terminal v2.0
                </span>
              </div>
              {isGenerating ? (
                <button
                  onClick={stopGenerating}
                  className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                  style={{
                    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                    color: "#fff",
                  }}
                  title="停止生成"
                >
                  <div className="w-3.5 h-3.5 bg-current rounded-sm" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() && selectedImages.length === 0 && selectedFiles.length === 0}
                  className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none hover:scale-105 hover:shadow-[0_0_15px_rgba(var(--accent-1-rgb), 0.5)]"
                  style={{
                    background: (!inputValue.trim() && selectedImages.length === 0 && selectedFiles.length === 0) ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #d946ef, #9333ea)",
                    color: (!inputValue.trim() && selectedImages.length === 0 && selectedFiles.length === 0) ? "rgba(255,255,255,0.3)" : "#fff",
                  }}
                  title="发送"
                >
                  <Send size={16} className={(inputValue.trim() || selectedImages.length > 0 || selectedFiles.length > 0) ? "ml-0.5" : ""} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      </div> {/* END INNER WRAPPER */}
      </div>

      
      {showHistoryPicker && (
        <HistoryImagePicker 
          onSelect={url => {
            setSelectedImages(prev => [...prev, { path: url, previewUrl: url }]);
            setShowHistoryPicker(false);
          }} 
          onClose={() => setShowHistoryPicker(false)} 
        />
      )}
    </>
  );
}
