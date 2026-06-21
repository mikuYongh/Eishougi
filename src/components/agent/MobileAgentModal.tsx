import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Bot, Send, Sparkles, Settings, Plus, History, ChevronRight, ChevronLeft, Wrench, Zap, Loader2, Trash2, ArrowLeft, Save, ImagePlus, X, Menu, ArrowDown, Paperclip, FileText } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { useAgent, type ChatMessage, type ChatAttachment } from "../../hooks/useAgent";
import { useSettingsStore, type McpServerConfig } from "../../stores/settingsStore";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PhotoView } from 'react-photo-view';
import { HistoryImagePicker } from "../ui/HistoryImagePicker";
import { cn } from "../../lib/utils";
import { getImgSrc } from "../../utils/imageUtils";

interface InputAreaProps {
  isGenerating: boolean;
  stopGenerating: () => void;
  onSend: (text: string, attachments: ChatAttachment[]) => void;
}

function MobileAgentInputArea({ isGenerating, stopGenerating, onSend }: InputAreaProps) {
  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<{path: string, previewUrl: string}[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ChatAttachment[]>([]);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);

  const handleSend = () => {
    const attachments: ChatAttachment[] = [
      ...selectedImages.map(img => ({ path: img.path, name: 'image', mime: '', isImage: true })),
      ...selectedFiles,
    ];
    if ((input.trim() || attachments.length > 0) && !isGenerating) {
      onSend(input, attachments);
      setInput("");
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
        if ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window) {
          if (isImage) {
            const savedPath = await invoke<string>('save_base64_image', { base64Data });
            setSelectedImages(prev => [...prev, { path: savedPath, previewUrl: base64Data }]);
          } else {
            const savedPath = await invoke<string>('save_base64_file', { base64Data, originalName: file.name });
            setSelectedFiles(prev => [...prev, { path: savedPath, name: file.name, mime: file.type || '', isImage: false }]);
          }
        } else {
          // Browser fallback
          if (isImage) {
            setSelectedImages(prev => [...prev, { path: base64Data, previewUrl: base64Data }]);
          } else {
            setSelectedFiles(prev => [...prev, { path: base64Data, name: file.name, mime: file.type || '', isImage: false }]);
          }
        }
      } catch (err) {
        console.warn("Tauri invoke failed, falling back:", err);
        if (isImage) {
          setSelectedImages(prev => [...prev, { path: base64Data, previewUrl: base64Data }]);
        } else {
          setSelectedFiles(prev => [...prev, { path: base64Data, name: file.name, mime: file.type || '', isImage: false }]);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const hasAttachments = selectedImages.length > 0 || selectedFiles.length > 0;

  return (
    <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/90 to-transparent flex flex-col gap-2 pointer-events-none z-30">
      {hasAttachments && (
        <div className="flex items-center gap-3 px-2 pointer-events-auto overflow-x-auto hide-scrollbar-on-mobile pb-2">
          {selectedImages.map((img, i) => (
            <div key={`img-${i}`} className="relative w-16 h-16 rounded-xl border-2 border-[var(--accent-1)] shadow-lg overflow-hidden flex-shrink-0 group">
              <img src={img.previewUrl} className="w-full h-full object-cover" />
              <button
                onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {selectedFiles.map((f, i) => (
            <div key={`file-${i}`} className="relative flex items-center gap-2 px-3 h-16 rounded-xl border-2 border-[var(--accent-2)] shadow-lg bg-[var(--bg-layer-1)] flex-shrink-0 group max-w-[180px]">
              <FileText size={20} className="text-[var(--accent-2)] flex-shrink-0" />
              <span className="text-[11px] text-[var(--text-primary)] truncate font-mono">{f.name}</span>
              <button
                onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] p-1.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)] focus-within:border-[var(--accent-1)]/50 focus-within:shadow-[0_8px_32px_rgba(var(--accent-1-rgb),0.15)] transition-all pointer-events-auto">
        <label className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer" title="图片">
          <ImagePlus size={20} />
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
        <label className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer" title="文件">
          <Paperclip size={20} />
          <input type="file" className="hidden" onChange={handleFileUpload} />
        </label>
        <button
          onClick={() => setShowHistoryPicker(true)}
          className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors"
        >
          <History size={20} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="输入指令..."
          className="flex-1 min-w-0 bg-transparent border-none text-[var(--text-primary)] px-2 py-2 outline-none text-sm placeholder:text-[var(--text-secondary)] font-medium"
        />

        {isGenerating ? (
          <button
            onClick={stopGenerating}
            className="w-10 h-10 rounded-full bg-red-500/80 text-white flex items-center justify-center transition-all hover:bg-red-500 flex-shrink-0 shadow-lg"
          >
            <div className="w-3.5 h-3.5 bg-white rounded-sm"></div>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() && !hasAttachments}
            className="w-10 h-10 rounded-full bg-[var(--accent-1)] text-[var(--bg-base)] flex items-center justify-center disabled:opacity-50 disabled:bg-[var(--glass-border)] disabled:text-[var(--text-secondary)] disabled:shadow-none transition-all active:scale-95 shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.4)] flex-shrink-0"
          >
            <Send size={16} className="ml-0.5" />
          </button>
        )}
      </div>

      {showHistoryPicker && (
        <div className="pointer-events-auto">
          <HistoryImagePicker
            onSelect={(url) => {
              setSelectedImages(prev => [...prev, { path: url, previewUrl: getImgSrc(url) }]);
              setShowHistoryPicker(false);
            }}
            onClose={() => setShowHistoryPicker(false)}
          />
        </div>
      )}
    </div>
  );
}

type ViewMode = 'chat' | 'history' | 'settings';

function ChatImage({ src }: { src: string }) {
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  return (
    <PhotoView src={getImgSrc(src)}>
      <img src={getImgSrc(src)} className={`max-w-xs max-h-64 object-contain rounded-lg border border-[var(--glass-border)] mt-2 cursor-zoom-in transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} alt="chat-attachment" />
    </PhotoView>
  );
}

export function MobileAgentModal() {
  const { 
    isMobileAgentOpen, toggleMobileAgent, 
    sessions, activeSessionId, createSession, switchSession, deleteSession, 
    settings, updateSettings 
  } = useAgentStore();
  
  const session = sessions.find(s => s.id === activeSessionId);
  const { messages, isGenerating, sendMessage, stopGenerating } = useAgent();
  
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  const mcp = useSettingsStore(state => state.settings.mcpServers || []);

  const [tempSystemPrompt, setTempSystemPrompt] = useState(settings.systemPrompt);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobileAgentOpen && !activeSessionId && sessions.length === 0) {
      createSession();
    }
  }, [isMobileAgentOpen, activeSessionId, sessions.length, createSession]);

  useEffect(() => {
    if (isMobileAgentOpen && viewMode === 'chat') {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [isMobileAgentOpen, viewMode]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    const btn = document.getElementById('mobile-scroll-bottom-btn');
    if (btn) {
      if (!isAtBottom) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.transform = 'translateY(0)';
      } else {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
        btn.style.transform = 'translateY(10px)';
      }
    }
  };

  // Auto scroll to bottom
  useEffect(() => {
    if (viewMode === 'chat' && scrollContainerRef.current && session?.messages?.length) {
      // Immediate scroll
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 50);
      // Fallback scroll after slide-in animation finishes (300ms)
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 350);
    }
  }, [session?.messages?.length, isGenerating, viewMode, isMobileAgentOpen]);

  if (!isMobileAgentOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--bg-base)]/80 backdrop-blur-3xl animate-in slide-in-from-bottom-full duration-300 pb-[env(safe-area-inset-bottom)]">
      
      {/* Immersive Header */}
      <div className="flex-shrink-0 pt-[max(env(safe-area-inset-top),16px)] pb-3 px-4 bg-[var(--bg-layer-1)] border-b border-[var(--glass-border)] z-50 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] text-white shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.6)]">
            <Bot size={22} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] tracking-wide">NEXUS</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
              <p className="text-[10px] text-[var(--accent-1)]/80 font-mono tracking-widest uppercase">System Online</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[var(--glass-bg)] rounded-full p-1 border border-[var(--glass-border)]">
          <button onClick={() => setViewMode('chat')} className={cn("p-2 rounded-full transition-all", viewMode === 'chat' ? "bg-[var(--accent-1)] text-white shadow-md" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}><Bot size={16} /></button>
          <button onClick={() => setViewMode('history')} className={cn("p-2 rounded-full transition-all", viewMode === 'history' ? "bg-[var(--accent-1)] text-white shadow-md" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}><History size={16} /></button>
          <button onClick={() => setViewMode('settings')} className={cn("p-2 rounded-full transition-all", viewMode === 'settings' ? "bg-[var(--accent-1)] text-white shadow-md" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}><Settings size={16} /></button>
          <div className="w-px h-6 bg-[var(--glass-border)] mx-1"></div>
          <button 
            onClick={() => toggleMobileAgent(false)}
            className="p-2 rounded-full text-[var(--text-secondary)] hover:text-red-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        
        {/* CHAT VIEW */}
        {viewMode === 'chat' && (
          <>
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-32"
            >
              {(!session?.messages || session.messages.length === 0) && !isGenerating && (
                <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] space-y-4 opacity-50 px-8 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[var(--accent-1)] blur-3xl opacity-20 rounded-full"></div>
                    <Bot size={80} className="relative z-10 text-[var(--accent-1)] opacity-80" />
                  </div>
                  <p className="text-sm font-bold tracking-wider leading-relaxed">NEXUS 立场已展开<br/>等待您的指令...</p>
                </div>
              )}
              
              {session?.messages.map((msg, i) => {
                if (msg.role === 'system') return null;

                if (msg.role === 'tool') {
                  return (
                    <div key={i} className="flex justify-start">
                      <div className="flex flex-col gap-2 p-3 mt-1 rounded-2xl bg-[var(--glass-bg)] border border-[var(--accent-1)]/30 text-[10px] text-[var(--text-primary)] font-mono overflow-x-auto custom-scrollbar shadow-[0_0_15px_rgba(var(--accent-1-rgb), 15)] relative max-w-[90%]">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-1)] rounded-l-2xl animate-pulse" />
                        <div className="flex items-center gap-2 text-[var(--accent-1)] mb-1 ml-2">
                          <Wrench size={12} className="animate-[spin_4s_linear_infinite]" />
                          <span className="font-bold tracking-widest uppercase truncate">Execute: {msg.name}</span>
                        </div>
                        <div className="ml-2 opacity-80 whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  );
                }

                const isUser = msg.role === 'user';
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-3xl p-4 shadow-xl backdrop-blur-md ${
                      isUser 
                        ? 'bg-gradient-to-br from-[var(--accent-1)]/20 to-transparent border border-[var(--accent-1)]/30 text-[var(--text-primary)] rounded-tr-sm' 
                        : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] rounded-tl-sm w-full'
                    }`}>
                      {!isUser && (
                        <div className="flex items-center gap-2 mb-2 text-[var(--accent-1)] font-bold text-xs uppercase tracking-wider">
                          <Sparkles size={12} className={isGenerating && i === session.messages.length - 1 ? "animate-spin-slow" : ""} /> Nexus
                        </div>
                      )}
                      
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.images.map((img, idx) => {
                            const o = img as any;
                            const src = typeof o === 'string' ? o : (o?.url || o?.filePath || o?.outputPath || o?.path || '');
                            return src ? <ChatImage key={idx} src={src} /> : null;
                          })}
                        </div>
                      )}

                      <div className="prose prose-invert prose-sm max-w-none break-words">
                        {msg.content ? (
                          <>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              urlTransform={(url) => url}
                              components={{
                                img: ({node, ...props}) => (
                                  <PhotoView src={getImgSrc(props.src)}>
                                    <img {...props} src={getImgSrc(props.src)} className="max-w-full rounded-lg border border-[var(--glass-border)] my-2 cursor-zoom-in" />
                                  </PhotoView>
                                )
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                            {msg.tool_calls && msg.tool_calls.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-[var(--glass-border)] flex flex-col gap-2">
                                {msg.tool_calls.map((tc, idx) => (
                                  <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-xl bg-[var(--bg-layer-0)]/50 border border-[var(--glass-border)] text-[10px] text-[var(--text-secondary)]">
                                    <div className="flex items-center gap-2 text-[var(--accent-2)]">
                                      <Wrench size={12} />
                                      <span className="font-mono">Call: {tc.function?.name}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : msg.tool_calls && msg.tool_calls.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {msg.tool_calls.map((tc, idx) => (
                              <div key={idx} className="flex flex-col gap-1.5 p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[10px] text-[var(--text-secondary)]">
                                <div className="flex items-center gap-2 text-[var(--accent-2)] font-mono font-bold">
                                  <Wrench size={12} className={isGenerating && i === session.messages.length - 1 ? "animate-spin-slow" : ""} />
                                  System Call: {tc.function?.name || 'unknown'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isGenerating && session?.messages && session.messages[session.messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-3xl rounded-tl-sm px-5 py-3 flex items-center gap-3 text-[var(--accent-1)] shadow-xl">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs font-bold font-mono tracking-widest uppercase">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Scroll to bottom button */}
            <button
              id="mobile-scroll-bottom-btn"
              onClick={() => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
                }
              }}
              className="absolute bottom-28 right-4 z-20 w-10 h-10 rounded-full bg-[var(--accent-1)] text-white flex items-center justify-center shadow-lg hover:bg-[var(--accent-1)]/80 transition-all duration-300 opacity-0 pointer-events-none translate-y-[10px]"
            >
              <ArrowDown size={18} />
            </button>

            <MobileAgentInputArea 
              isGenerating={isGenerating}
              stopGenerating={stopGenerating}
              onSend={(text, imgs) => {
                sendMessage(text, imgs);
              }}
            />
          </>
        )}

        {/* HISTORY VIEW */}
        {viewMode === 'history' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <button 
              onClick={() => { createSession(); setViewMode('chat'); }}
              className="w-full py-4 border-2 border-dashed border-[var(--accent-1)]/50 rounded-2xl text-[var(--accent-1)] font-bold flex items-center justify-center gap-2 hover:bg-[var(--accent-1)]/10 transition-all bg-[var(--glass-bg)]"
            >
              <Plus size={20} /> 创建全新会话节点
            </button>
            <div className="space-y-3">
              {sessions.map(s => (
                <div 
                  key={s.id}
                  onClick={() => { switchSession(s.id); setViewMode('chat'); }}
                  className={cn(
                    "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden",
                    activeSessionId === s.id 
                      ? "bg-gradient-to-r from-[var(--accent-1)]/20 to-transparent border-[var(--accent-1)]/50 shadow-[inset_0_0_20px_rgba(var(--accent-1-rgb),0.1)]" 
                      : "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-[var(--accent-1)]/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text-primary)] text-sm">{s.title}</span>
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--glass-bg)] px-2 py-1 rounded-full border border-[var(--glass-border)]">
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-[var(--text-secondary)] line-clamp-1 flex-1 pr-4">
                      {s.messages.length} 条记录
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors z-10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {activeSessionId === s.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent-1)] shadow-[0_0_10px_var(--accent-1)]"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {viewMode === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="glass-panel p-5 space-y-4 rounded-2xl">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--glass-border)] pb-2">
                <Wrench size={16} className="text-blue-400" /> 系统指令核心 (System Prompt)
              </h3>
              <textarea 
                value={tempSystemPrompt}
                onChange={(e) => setTempSystemPrompt(e.target.value)}
                className="w-full h-48 bg-[var(--bg-layer-0)] border border-[var(--glass-border)] rounded-xl p-3 text-[12px] text-[var(--text-secondary)] font-mono outline-none focus:border-[var(--accent-1)]/50 custom-scrollbar"
                placeholder="在此输入系统指令..."
              />
              <button 
                onClick={() => { updateSettings({ systemPrompt: tempSystemPrompt }); setViewMode('chat'); }}
                className="w-full py-2.5 bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] hover:opacity-90 text-white rounded-xl font-bold text-sm shadow-[0_4px_15px_rgba(179,136,255,0.3)] transition-all active:scale-[0.98]"
              >
                注入协议并生效
              </button>
            </div>

            <div className="glass-panel p-5 space-y-4 rounded-2xl">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--glass-border)] pb-2">
                <Zap size={16} className="text-[var(--accent-1)]" /> MCP 外挂子系统
              </h3>
              {mcp.length === 0 ? (
                <div className="text-center py-6 text-[var(--text-secondary)] text-sm">
                  未配置 MCP 协议端点。<br/>请前往全局设置中心配置。
                </div>
              ) : (
                <div className="space-y-3">
                  {mcp.map((server, idx) => (
                    <div key={idx} className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={cn("w-2 h-2 rounded-full flex-shrink-0 shadow-[0_0_8px_currentColor]", server.enabled ? "bg-green-400 text-green-400" : "bg-red-400 text-red-400")} />
                        <div className="truncate">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">{server.name}</p>
                          <p className="text-[10px] text-[var(--text-secondary)] font-mono truncate">{server.url}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
