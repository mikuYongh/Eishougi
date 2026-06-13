import { useState, useEffect } from "react";
import { useLibraryStore, type Artist } from "../../stores/libraryStore";
import { Search, X, Paintbrush, Check } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../stores/settingsStore";

interface ArtistSelectorProps {
  selectedTriggers: string;
  onChange: (triggers: string) => void;
}

export function ArtistSelector({ selectedTriggers, onChange }: ArtistSelectorProps) {
  const { artists, loadMoreArtists, setArtistSearch } = useLibraryStore();
  const privacyMode = useSettingsStore(s => s.settings.privacyMode);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only load initial if empty
    if (artists.length === 0) {
      loadMoreArtists();
    }
  }, [loadMoreArtists, artists.length]);

  // Parse selected triggers into an array (assuming comma-separated for simplicity)
  const selectedList = selectedTriggers.split(",").map(s => s.trim()).filter(Boolean);

  // When search changes, update the store
  useEffect(() => {
    const timer = setTimeout(() => {
      setArtistSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, setArtistSearch]);

  const toggleArtist = (artist: Artist) => {
    const trigger = artist.trigger.trim();
    let newList;
    if (selectedList.includes(trigger)) {
      newList = selectedList.filter(t => t !== trigger);
    } else {
      newList = [...selectedList, trigger];
    }
    onChange(newList.join(", "));
  };

  const selectedArtists = artists.filter(a => selectedList.includes(a.trigger.trim())) || [];
  // Also keep custom artist triggers that are not in the DB
  const customTriggers = selectedList.filter(t => !artists.some(a => a.trigger.trim() === t));

  return (
    <div className="glass-panel p-5 flex flex-col h-full relative z-30 border-pink-500/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Paintbrush size={16} className="text-pink-400" /> 画风与艺术家 (Style)
        </h3>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 text-[11px] font-bold rounded-lg transition-colors border border-pink-500/30 cursor-pointer"
        >
          {isOpen ? "收起图库" : "从图库选择"}
        </button>
      </div>

      {/* Selected Artists Display */}
      <div className="flex flex-wrap gap-3 mb-4">
        {selectedArtists.map(artist => (
          <div key={artist.id} className="relative group rounded-xl overflow-hidden border border-pink-500/30 bg-[var(--glass-bg-hover)] flex items-center pr-3 shadow-md h-12">
            <div className="w-12 h-12 flex-shrink-0 bg-black/20 border-r border-pink-500/30">
              {artist.imgUrl ? (
                <img src={convertFileSrc(artist.imgUrl)} className={`w-full h-full object-cover ${privacyMode ? 'blur-md group-hover:blur-none' : ''}`} alt={artist.nameEn} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]"><Paintbrush size={14}/></div>
              )}
            </div>
            <div className="pl-3 flex flex-col justify-center min-w-[80px]">
              <span className="text-[11px] font-bold text-[var(--text-primary)] line-clamp-1 leading-tight">{artist.nameZh || artist.nameEn}</span>
              <span className="text-[9px] text-[var(--text-muted)] line-clamp-1 leading-tight opacity-80">{artist.trigger}</span>
            </div>
            <button 
              onClick={() => toggleArtist(artist)}
              className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {customTriggers.map((trigger, i) => (
          <div key={i} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1 flex items-center gap-2 h-12">
            <span className="text-[11px] font-bold text-[var(--text-primary)]">{trigger}</span>
            <button 
              onClick={() => {
                const newList = selectedList.filter(t => t !== trigger);
                onChange(newList.join(", "));
              }}
              className="text-red-400/50 hover:text-red-400 cursor-pointer"
            >
              <X size={12}/>
            </button>
          </div>
        ))}

        {selectedList.length === 0 && (
          <div className="w-full h-12 flex items-center justify-center border border-dashed border-[var(--glass-border)] rounded-xl text-[11px] text-[var(--text-muted)] font-bold tracking-widest">
            暂未选择任何画风
          </div>
        )}
      </div>

      {/* Manual Input (for artists not in DB) */}
      <div className="mt-auto">
        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">手动输入 (逗号分隔)</label>
        <textarea 
          value={selectedTriggers}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 text-[12px] font-mono text-pink-300 outline-none focus:border-pink-500/50 transition-colors resize-none h-16"
          placeholder="例如: by greg rutkowski, studio ghibli..."
        />
      </div>

      {/* Picker Drawer */}
      {isOpen && (
        <div className="absolute inset-x-0 bottom-full mb-2 bg-[#1A1625]/95 backdrop-blur-xl z-50 rounded-2xl border border-[var(--glass-border)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 h-[300px] shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="p-3 border-b border-[var(--glass-border)] flex items-center gap-2 bg-black/20">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索画师名或触发词..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-[12px] text-white outline-none focus:border-pink-500/50 transition-colors"
              />
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-[var(--text-muted)] cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-2 scrollbar-thin scrollbar-thumb-white/10">
            {artists.map(artist => {
              const isSelected = selectedList.includes(artist.trigger.trim());
              return (
                <div 
                  key={artist.id} 
                  onClick={() => toggleArtist(artist)}
                  className={`flex items-center p-2 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-pink-500/20 border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.15)]' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-black/20 border border-[var(--glass-border)]">
                    {artist.imgUrl ? (
                      <img src={convertFileSrc(artist.imgUrl)} className={`w-full h-full object-cover ${privacyMode ? 'blur-sm' : ''}`} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Paintbrush size={12} className="opacity-50 text-[var(--text-muted)]"/></div>
                    )}
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-white truncate">{artist.nameZh || artist.nameEn}</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">{artist.trigger}</div>
                  </div>
                  {isSelected && <Check size={14} className="text-pink-400 flex-shrink-0 mx-2" />}
                </div>
              )
            })}
            {artists.length === 0 && (
              <div className="col-span-full h-20 flex items-center justify-center text-[12px] text-[var(--text-muted)]">
                没有找到匹配的画师
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
