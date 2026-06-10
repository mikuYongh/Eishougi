import { Download, Info, Trash2, CalendarDays, Maximize2 } from "lucide-react";

export function History() {
  const mockHistory = [
    {
      id: "h1",
      date: "今天 (2024-05-20)",
      images: [
        { url: "https://images.unsplash.com/photo-1535295972055-1c762f4483e5?q=80&w=400&auto=format&fit=crop", prompt: "A glowing sci-fi sword...", model: "sd_xl_base", time: "14:23", resolution: "1024x1024" },
        { url: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=400&auto=format&fit=crop", prompt: "Cyberpunk keyboard...", model: "sd_xl_base", time: "14:15", resolution: "1024x576" }
      ]
    },
    {
      id: "h2",
      date: "昨天 (2024-05-19)",
      images: [
        { url: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400&auto=format&fit=crop", prompt: "Circuit board macro...", model: "animagine", time: "22:10", resolution: "832x1216" },
        { url: "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop", prompt: "Future car concept...", model: "sd_xl_base", time: "18:45", resolution: "1024x576" },
        { url: "https://images.unsplash.com/photo-1555680202-c86f0e12f086?q=80&w=400&auto=format&fit=crop", prompt: "Neon signs at night...", model: "sd_xl_base", time: "18:40", resolution: "1024x1024" }
      ]
    }
  ];

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-green-400">📜</span> 生成历史 (History)
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">回顾所有的创造轨迹，支持查看详细参数与 Seed</p>
        </div>
        <button className="px-4 py-2 rounded-xl text-[13px] font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer flex items-center gap-2">
          <Trash2 size={16} /> 清空历史
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-8">
        {mockHistory.map((group) => (
          <div key={group.id} className="space-y-4">
            {/* Date Header */}
            <h3 className="text-[13px] font-bold text-white/70 flex items-center gap-2 border-b border-white/10 pb-2">
              <CalendarDays size={16} className="text-green-400" /> {group.date}
            </h3>

            {/* Images Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {group.images.map((img, i) => (
                <div key={i} className="glass-panel rounded-xl flex flex-col group border border-white/5 hover:border-green-400/50 transition-all hover:shadow-[0_8px_30px_rgba(76,175,80,0.15)] overflow-hidden bg-black/40">
                  
                  {/* Image Container */}
                  <div className="aspect-square w-full relative overflow-hidden flex items-center justify-center">
                    <img src={img.url} alt="Result" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                      <button className="w-10 h-10 rounded-full bg-green-500/80 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg cursor-pointer">
                        <Maximize2 size={18} />
                      </button>
                      <div className="flex gap-2">
                        <button className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-colors cursor-pointer">
                          <Download size={14} />
                        </button>
                        <button className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-colors cursor-pointer">
                          <Info size={14} />
                        </button>
                        <button className="w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500 transition-colors cursor-pointer">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Meta Bar */}
                  <div className="p-2.5 bg-black/40 flex flex-col gap-1 border-t border-white/5">
                    <p className="text-[11px] text-white/80 line-clamp-1 font-mono">{img.prompt}</p>
                    <div className="flex items-center justify-between text-[10px] text-white/40 font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-white/5">{img.model}</span>
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

    </div>
  );
}
