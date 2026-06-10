import { Search, Plus, Filter, Tag, Copy, Edit2, Play, MoreVertical, Star, Download, Trash2 } from "lucide-react";

export function PromptList() {
  const dummyPrompts = [
    { id: 1, title: "赛博朋克城市", snippet: "masterpiece, cyberpunk city, neon lights, rain, high res...", tags: ["场景", "科幻"], type: "正向", isFavorite: true },
    { id: 2, title: "极致画质包", snippet: "best quality, ultra-detailed, 8k, photorealistic", tags: ["质量", "通用"], type: "正向", isFavorite: false },
    { id: 3, title: "基础防崩坏负向", snippet: "lowres, bad anatomy, bad hands, text, error", tags: ["负面", "通用"], type: "负向", isFavorite: true },
  ];

  return (
    <div className="flex flex-col h-full relative z-10 space-y-4">
      {/* 1. PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
          <span className="text-pink-400">📝</span> 提示词管理
        </h2>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[13px] font-bold border border-white/10 transition-colors cursor-pointer">
            <Download size={14} /> 导入
          </button>
          <button 
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold text-white shadow-[0_4px_15px_rgba(255,107,157,0.4)] hover:scale-105 transition-all cursor-pointer"
            style={{ background: "linear-gradient(135deg, #FF6B9D, #B388FF)" }}
          >
            <Plus size={14} /> 新建提示词
          </button>
        </div>
      </div>

      {/* 2. TabBar */}
      <div className="flex items-center gap-2 flex-shrink-0 border-b border-white/5 pb-1">
        {["全部", "正向", "负向", "风格", "收藏"].map((tab, i) => (
          <button 
            key={i}
            className={`px-4 py-2 text-[13px] font-bold rounded-t-lg transition-colors cursor-pointer border-b-2 ${i === 0 ? "text-pink-400 border-pink-400 bg-pink-500/5" : "text-white/50 border-transparent hover:text-white/90 hover:bg-white/5 hover:border-white/20"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 3. SearchBar & 4. TagFilterBar */}
      <div className="flex flex-col gap-3 flex-shrink-0 bg-black/10 p-4 rounded-xl border border-white/5">
        <div className="glass-panel flex items-center gap-2 px-3 py-2 w-full max-w-md focus-within:border-pink-500/50 transition-colors">
          <Search size={14} className="text-white/40" />
          <input 
            type="text" 
            placeholder="全局搜索提示词..." 
            className="bg-transparent border-none outline-none text-[13px] text-white w-full placeholder:text-white/30"
          />
        </div>
        
        {/* FlowRow of TagChip */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={14} className="text-white/40 mr-1" />
          {["场景", "科幻", "质量", "通用", "人物", "机甲"].map(tag => (
            <button key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 5. PromptCardGrid (2列) */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-2">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {dummyPrompts.map((prompt) => (
            <div key={prompt.id} className="glass-panel p-4 group hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)] transition-all cursor-default border border-white/5 flex flex-col gap-3">
              
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {/* FavoriteStar */}
                  <button className="cursor-pointer">
                    <Star size={16} className={prompt.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-white/30 hover:text-white/60"} />
                  </button>
                  {/* Title */}
                  <h3 className="text-[15px] font-bold text-white/90">{prompt.title}</h3>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${prompt.type === '正向' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {prompt.type}
                  </span>
                </div>
              </div>

              {/* Snippet */}
              <div className="px-3 py-2 rounded border border-white/5 bg-black/20 text-xs text-white/60 font-mono line-clamp-2">
                {prompt.snippet}
              </div>

              <div className="flex items-center justify-between mt-auto">
                {/* TagChip[] */}
                <div className="flex gap-1.5">
                  {prompt.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-white/50 text-[10px] font-medium border border-white/5">
                      <Tag size={10} /> {t}
                    </span>
                  ))}
                </div>
                
                {/* ActionButtons (✏️📋🗑️) */}
                <div className="flex items-center gap-1.5">
                  <button className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer" title="编辑">
                    <Edit2 size={12} />
                  </button>
                  <button className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer" title="复制">
                    <Copy size={12} />
                  </button>
                  <button className="p-1.5 rounded bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors cursor-pointer" title="删除">
                    <Trash2 size={12} />
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
