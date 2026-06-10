import { Search, Heart, Star, ImageIcon } from "lucide-react";

export function Gallery() {
  const tabs = ["全部风格", "最热画师", "日系动漫", "赛博朋克", "水墨国风", "极简 3D", "写实摄影"];
  
  const mockArtists = [
    { name: "Makoto Shinkai", tags: ["日系", "风景", "高饱和"], img: "https://images.unsplash.com/photo-1542451313056-b7c8e626645f?q=80&w=400&auto=format&fit=crop" },
    { name: "Greg Rutkowski", tags: ["奇幻", "厚涂", "史诗感"], img: "https://images.unsplash.com/photo-1588663806951-e18e0018ce5a?q=80&w=400&auto=format&fit=crop" },
    { name: "Syd Mead", tags: ["赛博朋克", "未来派", "载具"], img: "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop" },
    { name: "Alphonse Mucha", tags: ["新艺术", "繁复线条", "人物"], img: "https://images.unsplash.com/photo-1578305096530-bc6f8e70d473?q=80&w=400&auto=format&fit=crop" },
    { name: "Wu Guanzhong", tags: ["水墨", "意境", "留白"], img: "https://images.unsplash.com/photo-1615414050853-488661794711?q=80&w=400&auto=format&fit=crop" },
    { name: "WLOP", tags: ["唯美", "光影", "CG"], img: "https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?q=80&w=400&auto=format&fit=crop" },
    { name: "Zdislav Beksinski", tags: ["克苏鲁", "暗黑", "超现实"], img: "https://images.unsplash.com/photo-1604079628040-94301bb21b91?q=80&w=400&auto=format&fit=crop" },
    { name: "Ilya Kuvshinov", tags: ["插画", "少女", "平涂"], img: "https://images.unsplash.com/photo-1516108103554-cedf38c56fa9?q=80&w=400&auto=format&fit=crop" }
  ];

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-pink-400">🖼️</span> 画师风格库 (Artist Gallery)
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">探索上千名画师特训风格，一键混入你的提示词工程</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {tabs.map((tab, i) => (
            <button 
              key={i}
              className={`whitespace-nowrap px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${i === 0 ? "bg-pink-500/20 text-pink-400 border-pink-500/30" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-pink-400/50 transition-colors rounded-full flex-shrink-0">
          <Search size={14} className="text-white/40" />
          <input 
            type="text" 
            placeholder="搜索画师或风格..." 
            className="bg-transparent border-none outline-none text-[12px] text-white w-full placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {mockArtists.map((artist, i) => (
            <div key={i} className="glass-panel rounded-2xl flex flex-col group border border-white/5 hover:border-pink-400/30 transition-all hover:shadow-[0_8px_30px_rgba(244,143,177,0.15)] overflow-hidden cursor-pointer">
              
              {/* Image Preview */}
              <div className="aspect-[4/5] w-full relative overflow-hidden bg-black/40">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10"></div>
                <img src={artist.img} alt={artist.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" />
                
                {/* Overlay Badges */}
                <div className="absolute top-2 right-2 z-20 flex gap-1">
                  <button className="w-7 h-7 rounded-full bg-black/40 backdrop-blur hover:bg-pink-500/80 transition-colors flex items-center justify-center">
                    <Heart size={12} className="text-white" />
                  </button>
                </div>
                
                {/* Content over image */}
                <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
                  <h3 className="text-[14px] font-bold text-white drop-shadow-md truncate">{artist.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {artist.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded border border-white/20 bg-white/10 backdrop-blur-sm text-white/90 text-[9px] font-bold tracking-wider">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="p-2 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[11px] font-bold text-pink-400 flex items-center gap-1.5">
                  <Star size={12} fill="currentColor" /> 设为核心风格
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
