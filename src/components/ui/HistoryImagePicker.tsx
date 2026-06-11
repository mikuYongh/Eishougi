import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History, X, CheckCircle2 } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";

interface HistoryImagePickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
  title?: string;
}

export function HistoryImagePicker({ onSelect, onClose, title = "选择生成历史" }: HistoryImagePickerProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    invoke<any[]>('list_generated_images').then(data => {
       setHistory(data.filter(d => d.status === 'completed' && d.outputPath));
       setLoading(false);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[var(--glass-bg)] backdrop-blur-md cursor-pointer"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative w-[95%] max-w-6xl h-[85vh] max-h-[900px] flex flex-col rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden animate-in zoom-in-95 duration-300 ease-out backdrop-blur-2xl">
        
        {/* Glow effect */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-1)]/50 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-24 bg-[var(--accent-1)]/20 blur-[50px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-[var(--glass-border)] relative z-10 bg-[var(--bg-layer-1)]">
          <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] flex items-center gap-2.5 drop-shadow-md">
            <div className="p-1.5 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)]">
              <History size={18} />
            </div>
            {title}
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative z-10">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[var(--accent-1)]/30 border-t-[var(--accent-1)] rounded-full animate-spin" />
                <span className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-widest animate-pulse">Loading Matrix...</span>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] gap-4">
              <div className="p-4 rounded-2xl bg-white/5">
                <History size={32} className="opacity-50" />
              </div>
              <p className="text-sm tracking-wide">暂无成功的生成历史记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {history.map(h => (
                <div 
                  key={h.id}
                  className="relative group cursor-pointer rounded-2xl overflow-hidden aspect-square border border-[var(--glass-border)] hover:border-[var(--accent-1)]/50 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(var(--accent-1-rgb), 0.2)] hover:-translate-y-1"
                  onMouseEnter={() => setHoveredId(h.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect(h.outputPath)}
                >
                  <img 
                    src={h.outputPath} 
                    alt="Generation History"
                    className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`}
                  />
                  
                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  {/* Hover Actions / Info */}
                  <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col justify-end translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <span className="text-[10px] text-[var(--text-secondary)] font-mono mb-1">
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                    <button className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-[var(--accent-1)] text-[var(--text-primary)] text-xs font-bold shadow-[0_0_15px_rgba(var(--accent-1-rgb), 0.5)]">
                      <CheckCircle2 size={14} /> 选用
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
