import { Download, Info, Trash2, CalendarDays, Maximize2, BookmarkPlus, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePromptStore } from "../../stores/promptStore";
import { useSettingsStore } from "../../stores/settingsStore";

interface HistoryImage {
  id: string;
  url: string;
  prompt: string;
  promptId: string;
  promptTitle: string;
  model: string;
  time: string;
  resolution: string;
}

interface HistoryGroup {
  id: string;
  date: string;
  images: HistoryImage[];
}

export function History() {
  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [addingToPrompt, setAddingToPrompt] = useState<HistoryImage | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const prompts = usePromptStore(state => state.prompts);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    fetchHistory();
  }, [prompts]);

  const fetchHistory = async () => {
    try {
      const data = await invoke<any[]>('list_generated_images');
      const prompts = usePromptStore.getState().prompts;

      const grouped = new Map<string, HistoryImage[]>();
      
      data.forEach(item => {
        // Skip failed or pending items
        if (item.status !== 'completed' && item.status !== 'completed') return;
        
        const date = new Date(item.createdAt);
        const dateStr = date.toLocaleDateString();
        
        const promptObj = prompts.find(p => p.id === item.promptId);
        
        const img: HistoryImage = {
          id: item.id,
          url: item.outputPath || '',
          promptId: item.promptId || '',
          promptTitle: promptObj ? promptObj.title : '未知项目',
          prompt: promptObj ? promptObj.positivePrompt : 'Custom Generated Image',
          model: promptObj ? (promptObj.baseModel || 'Default Model') : 'Unknown Model',
          time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          resolution: promptObj ? `${promptObj.width}x${promptObj.height}` : 'Unknown'
        };
        
        if (!grouped.has(dateStr)) {
          grouped.set(dateStr, []);
        }
        grouped.get(dateStr)!.push(img);
      });
      
      const newHistory: HistoryGroup[] = Array.from(grouped.entries()).map(([date, images], idx) => ({
        id: "group_" + idx,
        date,
        images
      }));
      
      setHistory(newHistory);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_generated_image', { id });
      fetchHistory();
    } catch (e) {
      console.error("Failed to delete image:", e);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `generation_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("Failed to download image:", e);
    }
  };

  const handleAddToInstanceImages = async (targetPromptId: string, imageUrl: string) => {
    try {
      const currentPrompt = await invoke('get_prompt', { id: targetPromptId }) as any;
      if (!currentPrompt) return;
      const existing: any[] = currentPrompt.images || [];
      if (existing.some((img: any) => img.filePath === imageUrl)) {
        setAddSuccess('already');
        setTimeout(() => { setAddSuccess(null); setAddingToPrompt(null); }, 1500);
        return;
      }
      const updatedPrompt = {
        ...currentPrompt,
        images: [...existing, { id: "img_" + Date.now(), promptId: targetPromptId, filePath: imageUrl, fileName: "", createdAt: Date.now() }],
        updatedAt: Date.now()
      };
      await invoke('update_prompt', { prompt: updatedPrompt });
      usePromptStore.getState().fetchPrompts();
      setAddSuccess(targetPromptId);
      setTimeout(() => { setAddSuccess(null); setAddingToPrompt(null); }, 1500);
    } catch (e) {
      console.error("Failed to add instance image:", e);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear all history?")) return;
    try {
      // Loop delete (ideally a bulk delete endpoint)
      for (const group of history) {
        for (const img of group.images) {
          await invoke('delete_generated_image', { id: img.id });
        }
      }
      fetchHistory();
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
            <span className="text-green-400">📜</span> 生成历史 (History)
          </h2>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">回顾所有的创造轨迹，支持查看详细参数与 Seed</p>
        </div>
        <button 
          onClick={handleClearHistory}
          className="px-4 py-2 rounded-xl text-[13px] font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer flex items-center gap-2"
        >
          <Trash2 size={16} /> 清空历史
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-8">
        {history.map((group) => (
          <div key={group.id} className="space-y-4">
            {/* Date Header */}
            <h3 className="text-[13px] font-bold text-[var(--text-secondary)] flex items-center gap-2 border-b border-[var(--glass-border)] pb-2">
              <CalendarDays size={16} className="text-green-400" /> {group.date}
            </h3>

            {/* Images Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {group.images.map((img, i) => (
                <div key={i} className="glass-panel rounded-xl flex flex-col group border border-[var(--glass-border)] hover:border-green-400/50 transition-all hover:shadow-[0_8px_30px_rgba(76,175,80,0.15)] overflow-hidden bg-[var(--glass-bg)]">
                  
                  {/* Image Container */}
                  <div className="aspect-square w-full relative overflow-hidden flex items-center justify-center">
                    <img src={img.url} alt="Result" className={`w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                    
                  {/* Hover Actions */}
                    <div className="absolute inset-0 bg-[var(--glass-bg)] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                      <button 
                        onClick={() => setPreviewImage(img.url)}
                        className="w-10 h-10 rounded-full bg-green-500/80 text-[var(--text-primary)] flex items-center justify-center hover:scale-110 transition-transform shadow-lg cursor-pointer"
                        title="全屏查看"
                      >
                        <Maximize2 size={18} />
                      </button>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleDownload(img.url)}
                          className="w-8 h-8 rounded-full bg-white/20 text-[var(--text-primary)] flex items-center justify-center hover:bg-white/40 transition-colors cursor-pointer"
                          title="下载"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          onClick={() => setAddingToPrompt(img)}
                          className="w-8 h-8 rounded-full bg-[var(--accent-1)]/80 text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-1)] transition-colors cursor-pointer"
                          title="添加为示范图"
                        >
                          <BookmarkPlus size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(img.id)}
                          className="w-8 h-8 rounded-full bg-red-500/80 text-[var(--text-primary)] flex items-center justify-center hover:bg-red-500 transition-colors cursor-pointer"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Meta Bar */}
                  <div className="p-2.5 bg-[var(--glass-bg)] flex flex-col gap-1 border-t border-[var(--glass-border)]">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold text-[var(--accent-1)]/80 bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/20 px-1.5 py-0.5 rounded-md truncate max-w-full">
                        {img.promptTitle}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 font-mono">{img.prompt}</p>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-white/5 truncate max-w-[100px]">{img.model}</span>
                      <div className="flex gap-2">
                        <span>{img.resolution}</span>
                        <span>{img.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--glass-bg)] p-8 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setPreviewImage(null)}
        >
          <img 
            src={previewImage} 
            alt="Preview" 
            className={`max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} 
          />
        </div>
      )}

      {/* Add to Instance Images Modal */}
      {addingToPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--glass-bg)] backdrop-blur-sm p-8">
          <div className="bg-[#1A1020]/95 border border-[var(--accent-1)]/30 rounded-2xl shadow-2xl shadow-[var(--accent-1)]/20 w-full max-w-md flex flex-col max-h-[70vh]">
            <div className="p-5 border-b border-[var(--glass-border)] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <BookmarkPlus size={16} className="text-[var(--accent-1)]" /> 添加为示范图
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">选择要添加到哪个提示词项目</p>
              </div>
              <button onClick={() => setAddingToPrompt(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-3 p-4 border-b border-[var(--glass-border)] flex-shrink-0">
              <img src={addingToPrompt.url} className="w-20 h-20 object-cover rounded-lg border border-[var(--glass-border)]" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[var(--accent-1)] font-bold mb-1">{addingToPrompt.promptTitle}</p>
                <p className="text-[10px] text-[var(--text-muted)] font-mono line-clamp-3 leading-relaxed">{addingToPrompt.prompt}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {prompts.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleAddToInstanceImages(p.id, addingToPrompt.url)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${
                    addSuccess === p.id
                      ? 'bg-green-500/20 border-green-500/50'
                      : 'bg-white/5 border-[var(--glass-border)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30'
                  }`}
                >
                  {p.coverImage && <img src={p.coverImage} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                  {!p.coverImage && <div className="w-10 h-10 rounded-lg bg-[var(--accent-1)]/20 flex items-center justify-center flex-shrink-0 text-[var(--accent-1)] text-[16px]">📝</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[var(--text-primary)] truncate">{p.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate">{p.positivePrompt?.slice(0, 60)}...</p>
                  </div>
                  {addSuccess === p.id && <Check size={16} className="text-green-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
