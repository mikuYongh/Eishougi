/**
 * AgentInput — 输入栏：文本输入 + 文件上传 + 快速预设 + Token 环 + 发送/停止
 */
import { useState, useRef, useCallback } from "react";
import { Send, Square, ImagePlus, Paperclip, History, FileText, X, Focus, User, Palette } from "lucide-react";
import { invoke, Channel } from "@tauri-apps/api/core";
import type { ChatAttachment, TokenUsage } from "../types";
import { QUICK_PRESETS, type QuickPreset } from "../types";

interface AgentInputProps {
  onSend: (text: string, attachments?: string[] | ChatAttachment[]) => void;
  onStop: () => void;
  isGenerating: boolean;
  tokenUsage: TokenUsage | null;
  onOpenHistory: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onOpenCharacterLibrary: (kind: "character" | "artist") => void;
}

const SELECTED_PRESETS_KEY = "agent-selected-presets";

export function AgentInput({ onSend, onStop, isGenerating, tokenUsage, onOpenHistory, focusMode, onToggleFocusMode, onOpenCharacterLibrary }: AgentInputProps) {
  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<{ path: string; previewUrl: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ChatAttachment[]>([]);
  const [activePresets, setActivePresets] = useState<QuickPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!input.trim() && selectedImages.length === 0 && selectedFiles.length === 0) return;

    // 把激活的预设附加到消息中
    let finalText = input;
    if (activePresets.length > 0) {
      const presetStr = activePresets.map((p) => `[${p.category}:${p.value}]`).join(" ");
      finalText = `${presetStr} ${input}`;
    }

    const imagePaths = selectedImages.map((img) => img.path);
    const fileAttachments: ChatAttachment[] = selectedFiles;

    if (imagePaths.length > 0 && fileAttachments.length > 0) {
      // Both images and files — send images first, then files
      onSend(finalText, [...imagePaths, ...fileAttachments] as any);
    } else if (imagePaths.length > 0) {
      onSend(finalText, imagePaths);
    } else if (fileAttachments.length > 0) {
      onSend(finalText, fileAttachments);
    } else {
      onSend(finalText);
    }
    setInput("");
    setSelectedImages([]);
    setSelectedFiles([]);
    setActivePresets([]);
  }, [input, selectedImages, selectedFiles, activePresets, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      try {
        const path = await invoke<string>("save_base64_image", { base64, filename: file.name });
        setSelectedImages((prev) => [...prev, { path, previewUrl: dataUrl }]);
      } catch (err) { console.error("Image upload failed:", err); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      try {
        const path = await invoke<string>("save_base64_file", { base64Data: dataUrl, originalName: file.name });
        setSelectedFiles((prev) => [...prev, { path, name: file.name, mime: file.type, isImage: false }]);
      } catch (err) { console.error("File upload failed:", err); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const togglePreset = (preset: QuickPreset) => {
    setActivePresets((prev) => {
      const existing = prev.find((p) => p.category === preset.category);
      if (existing) {
        if (existing.value === preset.value) return prev.filter((p) => p.category !== preset.category);
        return prev.map((p) => (p.category === preset.category ? preset : p));
      }
      return [...prev, preset];
    });
  };

  // Token ring
  const totalTokens = tokenUsage?.totalTokens || 0;
  const maxTokens = 128000;
  const pct = Math.min(totalTokens / maxTokens, 1);
  const circumference = 2 * Math.PI * 14;
  const strokeDashoffset = circumference * (1 - pct);
  const ringColor = pct > 0.8 ? "#ef4444" : pct > 0.6 ? "#f59e0b" : "var(--accent-1)";
  const formatTokens = (n: number) => n > 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="flex-shrink-0 px-3 pb-3 pt-1">
      {/* 快速预设 */}
      {showPresets && (
        <div className="mb-2 p-2.5 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">快速预设</div>
          <div className="space-y-1.5">
            {(["size", "quality", "style"] as const).map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span className="text-[9px] text-[var(--text-muted)] w-8 uppercase">{cat === "size" ? "尺寸" : cat === "quality" ? "质量" : "风格"}</span>
                {QUICK_PRESETS.filter((p) => p.category === cat).map((preset) => {
                  const isActive = activePresets.some((p) => p.category === preset.category && p.value === preset.value);
                  return (
                    <button
                      key={preset.value}
                      onClick={() => togglePreset(preset)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer ${
                        isActive
                          ? "bg-[var(--accent-1)] text-black shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.4)]"
                          : "bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {preset.icon} {preset.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 已激活的预设标签 */}
      {activePresets.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {activePresets.map((p) => (
            <span key={`${p.category}-${p.value}`} className="px-2 py-0.5 rounded-md bg-[var(--accent-1)]/20 text-[var(--accent-1)] text-[10px] font-medium flex items-center gap-1">
              {p.icon} {p.label}
              <button onClick={() => togglePreset(p)} className="hover:text-red-400"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {/* 附件预览 */}
      {(selectedImages.length > 0 || selectedFiles.length > 0) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selectedImages.map((img, i) => (
            <div key={i} className="relative">
              <img src={img.previewUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-[var(--glass-border)]" />
              <button onClick={() => setSelectedImages((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600">
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
          {selectedFiles.map((file, i) => (
            <div key={i} className="relative flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <FileText size={12} className="text-[var(--text-secondary)]" />
              <span className="text-[10px] text-[var(--text-secondary)] max-w-[80px] truncate">{file.name}</span>
              <button onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-red-400"><X size={10} /></button>
            </div>
          ))}
        </div>
      )}

      {/* 输入框主体 */}
      <div className="p-2 rounded-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] shadow-[inset_0_2px_15px_rgba(0,0,0,0.1)] focus-within:border-[var(--accent-1)]/50 focus-within:shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.15)] transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的画面... (Ctrl+Enter 发送)"
          rows={1}
          className="w-full bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none resize-none px-1 py-0.5"
          style={{ height: "auto", maxHeight: "120px" }}
        />

        {/* 工具栏 */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {/* 快速预设切换 */}
          <button
            onClick={() => setShowPresets(!showPresets)}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${showPresets ? "bg-[var(--accent-1)]/20 text-[var(--accent-1)]" : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"}`}
            title="快速预设"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>
          </button>

          {/* 图片上传 */}
          <label className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-1)] transition-all cursor-pointer">
            <ImagePlus size={14} />
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          {/* 文件上传 */}
          <label className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-1)] transition-all cursor-pointer">
            <Paperclip size={14} />
            <input type="file" onChange={handleFileUpload} className="hidden" />
          </label>

          {/* 历史图片 */}
          <button onClick={onOpenHistory} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-1)] transition-all cursor-pointer" title="从历史选择">
            <History size={14} />
          </button>

          {/* 选择角色 */}
          <button onClick={() => onOpenCharacterLibrary("character")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-1)] transition-all cursor-pointer" title="选择角色">
            <User size={14} />
          </button>

          {/* 选择画师 */}
          <button onClick={() => onOpenCharacterLibrary("artist")} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--accent-2)] transition-all cursor-pointer" title="选择画师">
            <Palette size={14} />
          </button>

          {/* 专注模式 */}
          <button
            onClick={onToggleFocusMode}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${focusMode ? "bg-[var(--accent-1)]/20 text-[var(--accent-1)] shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.3)]" : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"}`}
            title={focusMode ? "专注模式已开启：生图前需确认参数" : "专注模式：开启后生图前需确认参数"}
          >
            <Focus size={14} />
          </button>

          {/* Token 环 */}
          {tokenUsage && (
            <div className="ml-auto flex items-center gap-1" title={`输入: ${formatTokens(tokenUsage.promptTokens)} | 输出: ${formatTokens(tokenUsage.completionTokens)} | 总计: ${formatTokens(totalTokens)}`}>
              <svg width="28" height="28" viewBox="0 0 32 32" className="-rotate-90">
                <circle cx="16" cy="16" r="14" fill="none" stroke="var(--glass-border)" strokeWidth="2.5" />
                <circle cx="16" cy="16" r="14" fill="none" stroke={ringColor} strokeWidth="2.5" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-500" />
              </svg>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">{formatTokens(totalTokens)}</span>
            </div>
          )}

          {/* 发送/停止 */}
          {isGenerating ? (
            <button
              onClick={onStop}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all cursor-pointer active:scale-95"
              style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)" }}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && selectedImages.length === 0 && selectedFiles.length === 0}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #d946ef, #9333ea)" }}
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 专注模式提示 */}
      {focusMode && (
        <div className="mt-1 text-[9px] text-[var(--accent-1)]/70 text-center">
          专注模式已开启 — 每次生图前会显示参数预览供你确认和调整
        </div>
      )}
    </div>
  );
}
