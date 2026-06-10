import { Search, Plus, Filter, MoreHorizontal, Settings, Upload, Image as ImageIcon, Zap, Video } from "lucide-react";

export function WorkflowList() {
  const workflows = [
    { id: 1, name: "基础文生图 (SDXL)", desc: "使用 SDXL 模型的基础生成节点流", tags: ["文本到图像", "默认"], type: "图像", icon: <ImageIcon size={14}/> },
    { id: 2, name: "SVD 视频生成", desc: "Stable Video Diffusion 图生视频架构", tags: ["视频", "SVD"], type: "视频", icon: <Video size={14}/> },
    { id: 3, name: "Latent 高清放大", desc: "在潜空间进行 2x 放大重绘", tags: ["工具", "重绘"], type: "处理", icon: <Zap size={14}/> },
  ];

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* Header & Actions */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-purple-400">⚡</span> 工作流管理
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">配置与管理 ComfyUI 底层节点流映射</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="glass-panel flex items-center gap-2 px-3 py-2 w-64 focus-within:border-purple-500/50 transition-colors">
            <Search size={14} className="text-white/40" />
            <input 
              type="text" 
              placeholder="搜索工作流..." 
              className="bg-transparent border-none outline-none text-[13px] text-white w-full placeholder:text-white/30"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white/70 hover:text-white text-[13px] font-bold transition-all cursor-pointer">
            <Upload size={14} /> 导入 JSON
          </button>
        </div>
      </div>

      {/* CardGrid */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflows.map((wf) => (
            <div key={wf.id} className="glass-panel rounded-xl overflow-hidden flex flex-col group border border-white/5 hover:border-purple-500/30 transition-all hover:shadow-[0_8px_30px_rgba(179,136,255,0.1)]">
              
              {/* Thumbnail + TypeBadge */}
              <div className="h-32 bg-black/40 border-b border-white/5 relative flex flex-col items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIC8+Cjwvc3ZnPg==')] bg-repeat" />
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 group-hover:text-purple-400 group-hover:bg-purple-500/10 transition-colors">
                  <Settings size={20} />
                </div>
                
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 backdrop-blur border border-white/10 flex items-center gap-1.5 text-[10px] text-white/80 font-bold">
                  {wf.icon} {wf.type}
                </div>
              </div>

              {/* Body (name / desc / tags / actions) */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-[15px] font-bold text-white/90 group-hover:text-purple-300 transition-colors">{wf.name}</h3>
                  <button className="text-white/30 hover:text-white transition-colors cursor-pointer">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                
                <p className="text-xs text-white/50 leading-relaxed flex-1">
                  {wf.desc}
                </p>

                <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/5">
                  <div className="flex gap-1.5">
                    {wf.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-white/5 text-[9px] text-white/60 font-bold tracking-wide">
                        {t}
                      </span>
                    ))}
                  </div>
                  <button className="text-[11px] font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
                    编辑节点映射
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
