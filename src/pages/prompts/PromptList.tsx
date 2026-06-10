import { Plus, Search, Star, Edit3, Rocket, Copy, Trash2, Cpu, Maximize, Layers } from "lucide-react";
import { usePromptStore } from "../../stores/promptStore";
import { useNavigate } from "react-router-dom";

export function PromptList() {
  const prompts = usePromptStore((state) => state.prompts);
  const toggleFavorite = usePromptStore((state) => state.toggleFavorite);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-blue-400">📝</span> 提示词项目管理
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">管理生成配置项目，包含提示词、底模、LoRA及全部参数</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-xl text-[13px] font-bold border border-white/10 text-white/90 hover:bg-white/10 transition-colors cursor-pointer bg-black/20 shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)]">
            导入项目 JSON
          </button>
          <button 
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] hover:scale-[1.02] transition-all text-white cursor-pointer"
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
            onClick={() => navigate('/prompts/new/edit')}
          >
            <Plus size={16} /> 新建项目
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
        {/* TabBar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {["全部项目", "二次元", "写实风", "我的收藏"].map((tab, i) => (
            <button 
              key={i}
              className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${i === 0 ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* SearchBar */}
        <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-blue-400/50 transition-colors rounded-full">
          <Search size={14} className="text-white/40" />
          <input 
            type="text" 
            placeholder="搜索项目名称/描述..." 
            className="bg-transparent border-none outline-none text-[12px] text-white w-full placeholder:text-white/30"
          />
        </div>
      </div>

      {/* PromptCardGrid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {prompts.map((p) => (
            /* PromptProject Card */
            <div key={p.id} className="glass-panel rounded-2xl flex flex-col group border border-white/5 hover:border-blue-400/30 transition-all hover:shadow-[0_8px_30px_rgba(66,165,245,0.1)] overflow-hidden">
              
              {/* Cover Image */}
              {p.coverImage && (
                <div className="h-32 w-full relative overflow-hidden flex-shrink-0">
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />
                  <img src={p.coverImage} alt={p.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                  <div className="absolute top-3 right-3 z-20">
                    <button 
                      onClick={() => toggleFavorite(p.id)}
                      className="p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition-colors cursor-pointer"
                    >
                      <Star size={16} className={p.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-white/80"} />
                    </button>
                  </div>
                </div>
              )}

              <div className="p-5 flex flex-col gap-4 flex-1">
                {/* Header (if no cover, show star here) */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[16px] font-bold text-white/90 truncate">{p.title}</h3>
                      {p.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[9px] font-bold whitespace-nowrap">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-[12px] text-white/50 line-clamp-1">{p.description}</p>
                  </div>
                  {!p.coverImage && (
                    <button 
                      onClick={() => toggleFavorite(p.id)}
                      className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
                    >
                      <Star size={18} className={p.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-white/30"} />
                    </button>
                  )}
                </div>

              {/* Badges / Meta */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-bold truncate max-w-[150px]">
                  <Cpu size={12} className="flex-shrink-0" />
                  <span className="truncate">{p.baseModel}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-bold">
                  <Maximize size={12} />
                  {p.width}x{p.height}
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold">
                  <Layers size={12} />
                  {p.loraConfigs.length} LoRAs
                </div>
              </div>

              {/* Text Snippet */}
              <div className="rounded-xl bg-black/30 border border-white/5 p-3 relative overflow-hidden group/snippet">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                <p className="text-[11px] text-white/70 font-mono line-clamp-2 leading-relaxed">
                  {p.positivePrompt}
                </p>
              </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <div className="flex gap-1">
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer" title="复制提示词">
                      <Copy size={14} />
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-400/70 hover:text-red-400 transition-colors cursor-pointer" title="删除项目">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => navigate(`/prompts/${p.id}/edit`)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-[12px] font-bold border border-white/10 transition-colors cursor-pointer"
                    >
                      <Edit3 size={14} /> 配置参数
                    </button>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[12px] font-bold border border-blue-500/20 transition-colors cursor-pointer">
                      <Rocket size={14} /> 一键生成
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
