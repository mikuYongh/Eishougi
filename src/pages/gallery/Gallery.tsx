import { Search, User, ExternalLink, Star } from "lucide-react";

export function Gallery() {
  const artists = [
    { id: 1, name: "Greg Rutkowski", style: "经典奇幻，史诗感，厚涂", tags: ["奇幻", "厚涂"], isFav: true },
    { id: 2, name: "Makoto Shinkai", style: "新海诚，绚丽天空，日系动画", tags: ["日系", "风景"], isFav: true },
    { id: 3, name: "Alphonse Mucha", style: "穆夏，新艺术运动，繁复花纹", tags: ["古典", "插画"], isFav: false },
    { id: 4, name: "WLOP", style: "刀锋铁骑，光影质感，CG感", tags: ["厚涂", "人像"], isFav: false },
    { id: 5, name: "Ilya Kuvshinov", style: "复古日系，平涂，色彩鲜明", tags: ["日系", "平涂"], isFav: false },
    { id: 6, name: "Yoji Shinkawa", style: "新川洋司，水墨感，机甲", tags: ["水墨", "机甲"], isFav: false },
  ];

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-green-400">🖼️</span> 画师风格库
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">探索画师风格与流派，一键添加到您的提示词中</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
        {/* TabBar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {["全部", "热门", "日系", "水墨", "赛博", "奇幻", "我喜欢的"].map((tab, i) => (
            <button 
              key={i}
              className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${i === 0 ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* SearchBar */}
        <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-green-400/50 transition-colors rounded-full">
          <Search size={14} className="text-white/40" />
          <input 
            type="text" 
            placeholder="搜索画师名..." 
            className="bg-transparent border-none outline-none text-[12px] text-white w-full placeholder:text-white/30"
          />
        </div>
      </div>

      {/* ArtistGrid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {artists.map((artist) => (
            /* ArtistCard */
            <div key={artist.id} className="glass-panel p-4 rounded-xl flex flex-col gap-3 group border border-white/5 hover:border-green-500/30 transition-all hover:shadow-[0_8px_30px_rgba(76,175,80,0.1)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <User size={18} className="text-white/40 group-hover:text-green-400 transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-white/90">{artist.name}</h3>
                    <div className="flex gap-1 mt-0.5">
                      {artist.tags.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <button className="cursor-pointer">
                  <Star size={16} className={artist.isFav ? "text-yellow-400 fill-yellow-400" : "text-white/20 hover:text-white/50"} />
                </button>
              </div>

              <div className="h-16 rounded-lg bg-black/30 border border-white/5 p-2 text-[11px] text-white/60 font-mono flex items-center">
                by {artist.name}, {artist.style}
              </div>

              <div className="flex items-center gap-2">
                <button className="flex-1 py-1.5 rounded bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[11px] font-bold border border-green-500/20 transition-colors cursor-pointer">
                  添加至提示词
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer" title="查看作品集">
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
