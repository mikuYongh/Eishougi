import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Sparkles, HeartOff, Video } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { GeneratedImage } from "../../types";

const getImgSrc = (url?: string) => !url ? '' : (url.startsWith('http') || url.startsWith('data:') ? url : convertFileSrc(url));

export function Vault() {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    fetchSavedImages();
  }, []);

  const fetchSavedImages = async () => {
    try {
      setLoading(true);
      const allImages = await invoke<GeneratedImage[]>('list_generated_images');
      setImages(allImages.filter(img => img.isSaved));
    } catch (err) {
      console.error("Failed to fetch saved images:", err);
    } finally {
      setLoading(false);
    }
  };

  const unsaveImage = async (id: string) => {
    try {
      await invoke('toggle_save_image', { id, is_saved: false });
      setImages(prev => prev.filter(img => img.id !== id));
    } catch (err) {
      console.error("Failed to unsave image:", err);
    }
  };

  const isVideo = (path: string) => {
    return path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov') || path.endsWith('.gif');
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
            <span className="text-[var(--accent-1)] flex items-center justify-center"><Sparkles size={24} /></span> 典藏库
          </h2>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">您收藏的精彩创作 (图像与视频)</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4 custom-scrollbar">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-1)]" />
          </div>
        ) : images.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] gap-4">
            <Sparkles size={48} className="opacity-20" />
            <p>暂无收藏，快去生成历史里发现并收藏您的得意之作吧！</p>
          </div>
        ) : (
          <div className="columns-2 md:columns-3 xl:columns-4 gap-4 space-y-4">
            {images.map(img => {
              const video = isVideo(img.outputPath);
              return (
                <div key={img.id} className="break-inside-avoid relative group rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:shadow-[0_8px_30px_rgba(var(--accent-1-rgb),0.15)] hover:border-[var(--accent-1)]/50 transition-all duration-300">
                  {video ? (
                    <div className="relative">
                      <video 
                        src={getImgSrc(img.outputPath)} 
                        className={`w-full object-cover transition-all duration-500 ${privacyMode ? 'blur-xl group-hover:blur-none' : ''}`}
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                      />
                      <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-lg text-white flex items-center gap-1.5 text-xs font-bold border border-white/10 z-10">
                        <Video size={12} className="text-[var(--accent-1)]" /> 视频
                      </div>
                    </div>
                  ) : (
                    <img 
                      src={getImgSrc(img.outputPath)} 
                      alt="saved" 
                      className={`w-full h-auto object-cover transition-all duration-500 ${privacyMode ? 'blur-xl group-hover:blur-none' : ''}`}
                    />
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3 z-20">
                    <div className="flex justify-end">
                      <button 
                        onClick={() => unsaveImage(img.id)}
                        className="w-8 h-8 rounded-full bg-black/50 text-white/70 hover:text-red-400 hover:bg-black/80 flex items-center justify-center backdrop-blur-md transition-all"
                        title="取消收藏"
                      >
                        <HeartOff size={16} />
                      </button>
                    </div>
                    <div className="text-[10px] text-white/50 font-mono flex items-center gap-2">
                      {/* @ts-ignore */}
                      <span>{new Date(img.createdAt || img.created_at || Date.now()).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
