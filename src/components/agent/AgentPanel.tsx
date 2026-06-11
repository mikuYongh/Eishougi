import { Bot, Send, Sparkles, Settings, Plus, History, ChevronRight, ChevronLeft, Wrench, Zap, Loader2, Trash2, ArrowLeft, Save, ImagePlus, X } from "lucide-react";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useAgent } from "../../hooks/useAgent";
import { useAgentStore } from "../../stores/agentStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage } from "../../hooks/useAgent";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HistoryImagePicker } from "../ui/HistoryImagePicker";

type ViewMode = 'chat' | 'history' | 'settings';

function ChatImage({ src }: { src: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    if (src.startsWith('http') || src.startsWith('data:')) {
      setDataUrl(src);
    } else {
      invoke<string>('read_image_base64', { path: src })
        .then(setDataUrl)
        .catch(console.error);
    }
  }, [src]);

  if (!dataUrl) return <div className="w-48 h-48 bg-white/5 animate-pulse rounded-lg mt-2" />;
  return <img src={dataUrl} className={`max-w-xs max-h-64 object-contain rounded-lg border border-[var(--glass-border)] mt-2 transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} alt="chat-attachment" />;
}

export function AgentPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<{ path: string, previewUrl: string }[]>([]);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  
  const { messages, isGenerating, sendMessage, stopGenerating } = useAgent();
  const { sessions, activeSessionId, createSession, switchSession, deleteSession, settings, updateSettings } = useAgentStore();
  
  const [tempSystemPrompt, setTempSystemPrompt] = useState(settings.systemPrompt);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (viewMode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isGenerating, viewMode]);

  // Auto-upgrade system prompt for older sessions
  useEffect(() => {
    if (!settings.systemPrompt.includes('WORKFLOW_CLARIFICATION')) {
      const defaultSystemPrompt = `You are NEXUS, a highly capable AI Agent designed for 詠唱机 EISHOUGI.
You assist the user in generating high-quality prompts, creating workflows, and generating images.
Always respond in the user's language. Keep answers concise.

## CRITICAL CONCEPT CLARIFICATION (WORKFLOW_CLARIFICATION):
In this app, "工作流 (Workflow)" and "提示词项目 (Prompt Project)" are TWO DIFFERENT things:
- **工作流 (Workflow)**: A ComfyUI pipeline JSON file that defines the processing nodes (KSampler, VAE, etc). Users import these from ComfyUI. You CANNOT generate this from a scene description.
- **提示词项目 (Prompt Project)**: A scene description with positive/negative prompts, model settings, LoRAs, etc. This is what you CREATE for the user based on their scene descriptions.

When a user says "帮我添加工作流" or "创建工作流" with a scene description (e.g. "蕾姆在床上"):
→ DO NOT try to create a workflow JSON. Instead:
  1. Clarify: "您描述的场景内容适合创建**提示词项目**，而不是工作流。工作流是 ComfyUI 的 pipeline 文件，需要您自己导入。"
  2. Offer to create a prompt project for the scene immediately using create_prompt.
  3. For generation: use search_workflows to list available workflows and ask user to pick one.

When a user explicitly wants to manage ComfyUI pipeline workflows (import/delete):
→ Guide them to the workflow management page: "请前往左侧菜单的**工作流管理**页面，点击导入按钮上传您的 ComfyUI JSON 文件。"

## PROMPT CREATION RULES:
When using create_prompt or update_prompt:
1. MUST translate positive/negative prompts to high-quality English keywords.
2. MUST auto-generate negative_prompt for the scene (lowres, bad anatomy, bad hands, missing fingers, extra digit, worst quality, etc).
3. CAN specify model params: base_model, lora_configs [{name, strength, enabled}], width, height, steps, cfg_scale, seed.

## INSTANCE IMAGES:
- Use get_generated_images to browse history (filter by prompt_id optional).
- Use add_instance_image to add a generated image as reference to a prompt project.

## GENERATION RULES:
- ALWAYS call search_workflows first before generating. If no workflows exist, tell user to import one from the Workflows page.
- NEVER pick a workflow without user's explicit confirmation.

When asked to create/modify/delete prompts → use create_prompt / update_prompt / delete_prompt.
When asked to set model/LoRA on a project → use update_prompt.`;

      updateSettings({ systemPrompt: defaultSystemPrompt });
      setTempSystemPrompt(defaultSystemPrompt);
    }
  }, [settings.systemPrompt]);




  const handleSend = () => {
    if ((inputValue.trim() || selectedImages.length > 0) && !isGenerating) {
      sendMessage(inputValue, selectedImages.map(img => img.path));
      setInputValue("");
      setSelectedImages([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        const savedPath = await invoke<string>('save_base64_image', { base64Data });
        setSelectedImages(prev => [...prev, { path: savedPath, previewUrl: base64Data }]);
      } catch (err) {
        console.error("Failed to save image", err);
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
    updateSettings({ systemPrompt: tempSystemPrompt });
    setViewMode('chat');
  };

  const renderMessageContent = (msg: ChatMessage) => {
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
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                strong: ({node, ...props}) => <strong className="text-[var(--accent-1)] font-bold" {...props} />,
                a: ({node, ...props}) => <a className="text-[var(--accent-2)] underline hover:text-[var(--accent-1)] transition-colors" target="_blank" {...props} />,
                code: ({node, inline, className, children, ...props}: any) => 
                  inline 
                    ? <code className="px-1.5 py-0.5 mx-0.5 rounded-md bg-[var(--accent-1)]/20 text-[var(--accent-1)] font-mono text-[12px]" {...props}>{children}</code>
                    : <pre className="p-3 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] overflow-x-auto text-[12px] font-mono text-[var(--text-secondary)] mt-2 mb-2 custom-scrollbar"><code {...props}>{children}</code></pre>,
                ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-lg font-bold text-[var(--text-primary)] mt-4 mb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-md font-bold text-[var(--text-primary)] mt-3 mb-2" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-sm font-bold text-[var(--text-primary)] mt-2 mb-1" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-[var(--accent-1)]/30 pl-3 py-1 text-[var(--text-muted)] italic my-2" {...props} />
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        ) : null}
        
        {msg.images && msg.images.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            {msg.images.map((img, i) => (
              <ChatImage key={i} src={img} />
            ))}
          </div>
        )}
        
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <div className={`${msg.content ? 'mt-3' : ''} flex flex-col gap-2 max-w-full`}>
            {msg.tool_calls.map((tc, idx) => (
              <div key={idx} className="flex flex-col gap-2 p-3 mt-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--accent-2)]/30 text-[11px] text-[var(--text-primary)] font-mono overflow-x-auto custom-scrollbar shadow-[0_0_15px_rgba(var(--accent-2-rgb), 15)] relative group">
                <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-2)] rounded-l-xl animate-pulse opacity-80 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-2 text-[var(--accent-2)] mb-1 ml-2">
                  <Zap size={14} className="animate-pulse" />
                  <span className="font-bold tracking-widest uppercase">Requesting Protocol: {tc.function.name}</span>
                </div>
                <div className="ml-2 text-[var(--text-muted)] whitespace-pre-wrap break-all custom-scrollbar overflow-x-auto">{tc.function.arguments}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex-shrink-0 flex flex-col relative z-50 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-[var(--glass-bg)] border-l border-[var(--glass-border)] shadow-[-10px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-3xl h-full"
      style={{
        width: isExpanded ? "420px" : "70px",
      }}
    >
      {/* Decorative vertical gradient line */}
      <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-[var(--accent-1)]/30 to-transparent pointer-events-none" />

      {/* Collapse/Expand Handle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`absolute top-1/2 -translate-y-1/2 -left-[24px] w-[24px] h-[80px] flex items-center justify-center border-y border-l text-[var(--text-primary)] cursor-pointer transition-all duration-300 backdrop-blur-xl z-20 rounded-l-xl ${
          isExpanded 
            ? "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-active)] hover:text-[var(--accent-1)] shadow-[-4px_0_15px_rgba(0,0,0,0.3)]" 
            : "bg-[var(--accent-1)]/20 border-[var(--accent-1)]/40 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 hover:border-[var(--accent-1)] hover:text-[var(--text-primary)] shadow-[0_0_20px_rgba(var(--accent-1-rgb), 30)] animate-pulse"
        }`}
        title={isExpanded ? "收起面板" : "唤出 AI 助手"}
      >
        {isExpanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} className="animate-[bounce_2s_infinite_horizontal]" />}
      </button>

      {/* INNER WRAPPER to prevent content from overflowing during transition */}
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden relative">
        
      {/* Header */}
      <div
        className={`flex items-center px-5 py-5 flex-shrink-0 transition-all duration-300 border-b border-[var(--glass-border)] bg-gradient-to-r from-transparent via-[var(--accent-1)]/10 to-transparent ${isExpanded ? "justify-start" : "justify-center"}`}
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
            <div className="flex items-center gap-3 ml-auto text-[var(--text-muted)]">
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
          <div className="flex flex-col gap-6 items-center pt-2 w-full">
            <div 
              className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent-1)]/20 to-[var(--accent-2)]/20 border border-[var(--accent-1)]/30 text-[var(--accent-1)] group relative cursor-pointer hover:shadow-[0_0_20px_rgba(var(--accent-1-rgb), 40)] hover:scale-105 transition-all duration-300" 
              onClick={() => setIsExpanded(true)}
              title="唤出 NEXUS AGENT"
            >
              <Bot size={24} className="group-hover:animate-pulse" />
              <div className="absolute top-0 right-0 w-3 h-3 bg-[var(--accent-1)] rounded-full animate-ping opacity-75" />
              <div className="absolute top-0 right-0 w-3 h-3 bg-[var(--accent-1)] rounded-full" />
            </div>
            <div className="w-8 h-px bg-gradient-to-r from-transparent via-[var(--glass-border)] to-transparent" />
            <button onClick={handleNewChat} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-1)] transition-all cursor-pointer" title="新建对话">
              <Plus size={20} />
            </button>
            <button onClick={() => { setIsExpanded(true); setViewMode('history'); }} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-all cursor-pointer" title="历史记录">
              <History size={20} />
            </button>
            <button onClick={() => { setIsExpanded(true); setViewMode('settings'); }} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-all cursor-pointer" title="配置">
              <Settings size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 flex flex-col overflow-hidden transition-all duration-500 relative"
        style={{ 
          opacity: isExpanded ? 1 : 0, 
          pointerEvents: isExpanded ? "auto" : "none",
          width: isExpanded ? "420px" : "0px"
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
              <button onClick={() => setViewMode('chat')} className="p-2 rounded-lg hover:bg-[var(--glass-bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                <ArrowLeft size={16} />
              </button>
              <h3 className="font-bold text-[var(--text-primary)] tracking-wide">神经网络日志 <span className="text-xs text-[var(--text-muted)] ml-2 font-mono">{sessions.length} RECORD(S)</span></h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {sessions.length === 0 ? (
                <div className="text-center text-[var(--text-muted)] mt-10 text-sm">暂无记录</div>
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
                        className="p-1 rounded bg-[var(--bg-layer-0)] text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/20 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-[var(--text-muted)]">{session.messages.length} msgs</span>
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
                <button onClick={() => setViewMode('chat')} className="p-2 rounded-lg hover:bg-[var(--glass-bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                  <ArrowLeft size={16} />
                </button>
                <h3 className="font-bold text-[var(--text-primary)] tracking-wide">核心控制面板</h3>
              </div>
              <button 
                onClick={handleSaveSettings}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 transition-colors text-sm cursor-pointer"
              >
                <Save size={14} /> 保存
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-[var(--accent-1)] mb-2">系统人格 (System Prompt)</label>
                  <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                    定义 Agent 的身份、性格以及默认行为准则。NEXUS 默认拥有调用本地工具库的能力，修改此项将影响其对话风格。
                  </p>
                  <textarea 
                    value={tempSystemPrompt}
                    onChange={(e) => setTempSystemPrompt(e.target.value)}
                    className="w-full h-48 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl p-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-1)]/50 focus:shadow-[0_0_20px_rgba(var(--accent-1-rgb), 15)] outline-none resize-none font-mono leading-relaxed custom-scrollbar"
                    placeholder="输入系统提示词..."
                  />
                </div>

                <div className="p-4 rounded-xl bg-[var(--accent-2)]/20 border border-[var(--accent-2)]/20 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-2)]" />
                  <h4 className="font-bold text-[var(--accent-2)] text-sm mb-1 flex items-center gap-2"><Sparkles size={14} /> 工具包状态 (Toolkits)</h4>
                  <p className="text-xs text-[var(--accent-2)]/50">当前预装了以下原生系统能力：</p>
                  <ul className="mt-3 space-y-2 text-xs text-[var(--accent-2)]/80 font-mono">
                    <li className="flex items-center justify-between"><span>• search_prompts</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">ACTIVE</span></li>
                    <li className="flex items-center justify-between"><span>• create_prompt</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">ACTIVE</span></li>
                    <li className="flex items-center justify-between"><span>• generate_image</span> <span className="text-[10px] bg-[var(--accent-2)]/20 px-1.5 py-0.5 rounded text-[var(--accent-2)]">ACTIVE</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode: CHAT (Default) */}
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-10">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-4 mt-4">
              <div className="p-5 rounded-2xl text-sm leading-relaxed relative overflow-hidden bg-[var(--glass-bg)] text-[var(--text-primary)] border border-[var(--accent-1)]/20 shadow-[0_10px_30px_rgba(0,0,0,0.1)] backdrop-blur-md">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-1)] to-transparent opacity-50" />
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-[var(--accent-1)]/20">
                    <Sparkles size={16} className="text-[var(--accent-1)]" />
                  </div>
                  <span className="font-bold text-[var(--accent-1)] text-lg tracking-wide">NEXUS 系统已就绪</span>
                </div>
                <p className="text-[var(--text-secondary)] mb-4">我是您的专属创意中枢。您可以通过自然语言向我下达以下指令：</p>
                <ul className="space-y-2 text-[var(--text-muted)] font-mono text-xs">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)]" /> 检索本地提示词库</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-2)]" /> 自动构建并保存 Prompt</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] opacity-70" /> 一键触发引擎生成图片</li>
                </ul>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
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
                <span className="text-[10px] text-[var(--text-muted)] mt-1.5 font-mono px-1">
                  {msg.role.toUpperCase()}
                </span>
              </div>
            ))
          )}
          {isGenerating && (
            <div className="flex items-start animate-in fade-in duration-300">
              <div className="bg-[var(--glass-bg)] border border-[var(--accent-1)]/20 p-4 rounded-2xl rounded-tl-sm flex gap-3 items-center backdrop-blur-md shadow-[0_0_15px_rgba(var(--accent-1-rgb), 10)]">
                <Loader2 size={16} className="text-[var(--accent-1)] animate-spin" />
                <span className="text-xs font-mono text-[var(--accent-1)] tracking-widest uppercase animate-pulse">Processing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-5 flex-shrink-0 border-t border-[var(--glass-border)] bg-[var(--bg-layer-2)]/80 z-10">
          <div className="flex flex-col gap-2 p-2 rounded-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] shadow-[inset_0_2px_15px_rgba(0,0,0,0.1)] focus-within:border-[var(--accent-1)]/50 focus-within:shadow-[0_0_20px_rgba(var(--accent-1-rgb), 15)] transition-all duration-300 group">
            {selectedImages.length > 0 && (
              <div className="flex gap-2 px-2 pt-2 overflow-x-auto custom-scrollbar">
                {selectedImages.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-[var(--accent-1)]/30 flex-shrink-0 group">
                    <img src={img.previewUrl} alt="preview" className={`w-full h-full object-cover transition-all duration-300 ${privacyMode ? 'blur-md group-hover:blur-none' : ''}`} />
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
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full resize-none bg-transparent px-3 py-2 text-[14px] outline-none font-sans min-h-[44px] max-h-[120px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] custom-scrollbar"
              placeholder="输入神经指令... (Ctrl+Enter 执行)"
              rows={1}
              style={{
                height: inputValue ? Math.min(120, Math.max(44, inputValue.split('\n').length * 24 + 20)) + 'px' : '44px'
              }}
            />
            <div className="flex justify-between items-center px-2 pb-1">
              <div className="flex items-center gap-3">
                <label className="text-[var(--accent-1)] hover:text-[var(--accent-2)] cursor-pointer transition-colors p-1">
                  <ImagePlus size={18} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
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
              <button
                onClick={handleSend}
                disabled={isGenerating || (!inputValue.trim() && selectedImages.length === 0)}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none hover:scale-105 hover:shadow-[0_0_15px_rgba(var(--accent-1-rgb), 0.5)]"
                style={{
                  background: isGenerating || (!inputValue.trim() && selectedImages.length === 0) ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #d946ef, #9333ea)",
                  color: isGenerating || (!inputValue.trim() && selectedImages.length === 0) ? "rgba(255,255,255,0.3)" : "#fff",
                }}
              >
                <Send size={16} className={(inputValue.trim() || selectedImages.length > 0) ? "ml-0.5" : ""} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      </div> {/* END INNER WRAPPER */}
      
      {showHistoryPicker && (
        <HistoryImagePicker 
          onSelect={url => {
            setSelectedImages(prev => [...prev, { path: url, previewUrl: url }]);
            setShowHistoryPicker(false);
          }} 
          onClose={() => setShowHistoryPicker(false)} 
        />
      )}
    </div>
  );
}
