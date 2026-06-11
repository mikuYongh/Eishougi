import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History, X, CheckCircle2 } from "lucide-react";

interface HistoryImagePickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
  title?: string;
}

export function HistoryImagePicker({ onSelect, onClose, title = "选择生成历史" }: HistoryImagePickerProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        className="absolute inset-0 bg-black/60 backdrop-blur-md cursor-pointer"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative w-[95%] max-w-6xl h-[85vh] max-h-[900px] flex flex-col rounded-3xl bg-black/40 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden animate-in zoom-in-95 duration-300 ease-out backdrop-blur-2xl">
        
        {/* Glow effect */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-fuchsia-500/50 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-24 bg-fuchsia-500/20 blur-[50px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-white/5 relative z-10 bg-black/20">
          <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-purple-300 flex items-center gap-2.5 drop-shadow-md">
            <div className="p-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-400">
              <History size={18} />
            </div>
            {title}
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative z-10">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-fuchsia-500/30 border-t-fuchsia-400 rounded-full animate-spin" />
                <span className="text-xs text-white/40 font-mono uppercase tracking-widest animate-pulse">Loading Matrix...</span>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/30 gap-4">
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
                  className="relative group cursor-pointer rounded-2xl overflow-hidden aspect-square border border-white/5 hover:border-fuchsia-400/50 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(217,70,239,0.2)] hover:-translate-y-1"
                  onMouseEnter={() => setHoveredId(h.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect(h.outputPath)}
                >
                  <img 
                    src={h.outputPath} 
                    alt="Generation History"
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105"
                  />
                  
                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  {/* Hover Actions / Info */}
                  <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col justify-end translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <span className="text-[10px] text-white/70 font-mono mb-1">
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                    <button className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-fuchsia-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(217,70,239,0.5)]">
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
