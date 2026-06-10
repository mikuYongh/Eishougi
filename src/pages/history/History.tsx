import { History as HistoryIcon, Clock, Filter, Trash2, CheckCircle2, Maximize2, Download, Copy, Image as ImageIcon } from "lucide-react";

export function History() {
  const mockHistory = Array.from({ length: 8 }).map((_, i) => ({
    id: `TASK-${8910 - i}`,
    type: i % 3 === 0 ? "图生视频" : "文生图",
    status: "success",
    time: `${i + 1} 分钟前`,
    prompt: "masterpiece, best quality, cyberpunk city, neon lights...",
  }));

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-gray-400"><HistoryIcon size={24} /></span> 生成历史记录
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">查看过往所有成功生成的图像与视频</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="glass-panel p-2.5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer" title="筛选">
            <Filter size={16} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
            <Trash2 size={14} /> 清空记录
          </button>
        </div>
      </div>

      {/* ResultGrid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {mockHistory.map((task) => (
            /* GeneratedImageCard */
            <div key={task.id} className="relative rounded-2xl overflow-hidden group border border-white/5 hover:border-gray-400/50 transition-all bg-black/40 aspect-[3/4] flex flex-col hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              
              {/* Image Area */}
              <div className="flex-1 flex items-center justify-center opacity-10 group-hover:opacity-20 transition-opacity">
                <ImageIcon size={48} />
              </div>

              {/* Top Badges */}
              <div className="absolute top-2 inset-x-2 flex justify-between items-start pointer-events-none z-10">
                <div className="flex flex-col gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-white/80 text-[9px] font-bold border border-white/10">
                    {task.type}
                  </span>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[9px] font-bold border border-green-500/20">
                    <CheckCircle2 size={8} /> 成功
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-white/50 text-[9px] font-bold border border-white/10 flex items-center gap-1">
                  <Clock size={8} /> {task.time}
                </span>
              </div>

              {/* Bottom Hover Overlay */}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end backdrop-blur-[2px] z-20 h-1/2">
                <p className="text-[10px] text-white/70 line-clamp-2 mb-3 leading-relaxed">
                  {task.prompt}
                </p>
                <div className="flex justify-between items-center gap-2">
                  <button className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white transition-colors cursor-pointer border border-white/10 flex-1 justify-center">
                    <Copy size={10} /> 提取参数
                  </button>
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer" title="预览">
                      <Maximize2 size={12} />
                    </button>
                    <button className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer" title="下载">
                      <Download size={12} />
                    </button>
                  </div>
                </div>
              </div>
              
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
