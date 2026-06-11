import { useState } from "react";
import { Plus, Search, Star, Edit3, Rocket, Copy, Trash2, Cpu, Maximize, Layers, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { usePromptStore } from "../../stores/promptStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useNavigate } from "react-router-dom";

type ViewMode = 'grid' | 'list';

export function PromptList() {
  const prompts = usePromptStore((state) => state.prompts);
  const toggleFavorite = usePromptStore((state) => state.toggleFavorite);
  const removePrompt = usePromptStore((state) => state.removePrompt);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = viewMode === 'grid' ? 12 : 8;

  // Mock filtering / pagination
  const totalPages = Math.ceil(prompts.length / pageSize) || 1;
  const paginatedPrompts = prompts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
            <span className="text-blue-400">📝</span> 提示词项目管理
          </h2>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">管理生成配置项目，包含提示词、底模、LoRA及全部参数</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-xl text-[13px] font-bold border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-white/10 transition-colors cursor-pointer bg-[var(--bg-layer-1)] shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)]">
            导入项目 JSON
          </button>
          <button 
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] hover:scale-[1.02] transition-all text-[var(--text-primary)] cursor-pointer"
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
            onClick={() => navigate('/prompts/new/edit')}
          >
            <Plus size={16} /> 新建项目
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-[var(--glass-border)] pb-2">
        {/* TabBar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {["全部项目", "二次元", "写实风", "我的收藏"].map((tab, i) => (
            <button 
              key={i}
              className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${i === 0 ? "bg-[var(--accent-2)]/20 text-blue-400 border-[var(--accent-2)]/30" : "bg-white/5 text-[var(--text-muted)] border-[var(--glass-border)] hover:bg-white/10 hover:text-[var(--text-primary)]"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggles */}
          <div className="flex bg-[var(--bg-layer-1)] p-1 rounded-lg border border-[var(--glass-border)]">
            <button 
              onClick={() => { setViewMode('grid'); setCurrentPage(1); }}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-white/10 text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              title="网格视图"
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => { setViewMode('list'); setCurrentPage(1); }}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-white/10 text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              title="列表视图"
            >
              <ListIcon size={16} />
            </button>
          </div>

          {/* SearchBar */}
          <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-blue-400/50 transition-colors rounded-full">
            <Search size={14} className="text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="搜索项目名称/标签..." 
              className="bg-transparent border-none outline-none text-[12px] text-[var(--text-primary)] w-full placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4 flex flex-col">
        
        {viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedPrompts.map((p) => (
              <div key={p.id} className="glass-panel rounded-xl flex flex-col group border border-[var(--glass-border)] hover:border-blue-400/30 transition-all hover:shadow-[0_8px_30px_rgba(66,165,245,0.1)] overflow-hidden">
                
                {(p.coverImage || (p.instanceImages && p.instanceImages.length > 0)) && (
                  <div className="h-24 w-full relative overflow-hidden flex-shrink-0 bg-[var(--glass-bg)]">
                    <img src={p.coverImage || p.instanceImages?.[0]} alt={p.title} className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                    <div className="absolute top-2 right-2 z-20 flex gap-1.5">
                      <button 
                        onClick={() => toggleFavorite(p.id)}
                        className="p-1.5 rounded-full bg-[var(--glass-bg)] backdrop-blur hover:bg-[var(--glass-bg)] transition-colors cursor-pointer"
                      >
                        <Star size={14} className={p.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-[var(--text-primary)]"} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("确定要删除该提示词项目吗？")) {
                            removePrompt(p.id);
                          }
                        }}
                        className="p-1.5 rounded-full bg-[var(--glass-bg)] backdrop-blur hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer text-[var(--text-muted)]"
                        title="删除项目"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[14px] font-bold text-[var(--text-primary)] truncate mb-1" title={p.title}>{p.title}</h3>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{p.description || "暂无描述"}</p>
                    </div>
                    {(!p.coverImage && (!p.instanceImages || p.instanceImages.length === 0)) && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => toggleFavorite(p.id)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer">
                          <Star size={14} className={p.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-[var(--text-muted)]"} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("确定要删除该提示词项目吗？")) {
                              removePrompt(p.id);
                            }
                          }}
                          className="p-1.5 rounded-full hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer text-[var(--text-muted)]"
                          title="删除项目"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-white/10 text-[var(--text-muted)] text-[9px] font-bold truncate max-w-[60px]">
                        {tag}
                      </span>
                    ))}
                    {p.tags.length > 3 && <span className="px-1 py-0.5 text-[var(--text-muted)] text-[9px]">+{p.tags.length - 3}</span>}
                  </div>

                  {/* Meta Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-2 border-t border-[var(--glass-border)]">
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent-2)]/10 text-[var(--accent-2)] text-[9px] font-bold">
                      <Cpu size={10} /> {p.baseModel.split('.')[0].slice(0, 10)}
                    </div>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[9px] font-bold">
                      <Maximize size={10} /> {p.width}x{p.height}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button 
                      onClick={() => navigate(`/prompts/${p.id}/edit`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--text-primary)] text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <Edit3 size={12} /> 编辑
                    </button>
                    <button 
                      onClick={() => navigate(`/generate/${p.id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[var(--accent-2)]/20 hover:bg-[var(--accent-2)]/30 text-blue-400 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <Rocket size={12} /> 生成
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="flex flex-col gap-3">
            {paginatedPrompts.map((p) => (
              <div key={p.id} className="glass-panel p-3 rounded-xl flex items-center gap-4 group border border-[var(--glass-border)] hover:border-blue-400/30 transition-all hover:bg-white/[0.02]">
                
                {/* Square Thumbnail */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-[var(--glass-bg)] flex-shrink-0 relative">
                  {(p.coverImage || (p.instanceImages && p.instanceImages.length > 0)) ? (
                    <img src={p.coverImage || p.instanceImages?.[0]} className={`w-full h-full object-cover group-hover:scale-110 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} alt="cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10">
                      <ImageIcon size={20} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[14px] font-bold text-[var(--text-primary)] truncate">{p.title}</h3>
                    <div className="flex gap-1.5">
                      {p.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-white/10 text-[var(--text-muted)] text-[9px] font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{p.positivePrompt}</p>
                  
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                    <span className="flex items-center gap-1"><Cpu size={10} className="text-[var(--accent-2)]"/> {p.baseModel}</span>
                    <span className="flex items-center gap-1"><Maximize size={10} className="text-green-400"/> {p.width}x{p.height}</span>
                    <span className="flex items-center gap-1"><Layers size={10} className="text-orange-400"/> {p.loraConfigs?.length || 0} LoRAs</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 flex-shrink-0 border-l border-[var(--glass-border)] pl-4 ml-2">
                  <button onClick={() => toggleFavorite(p.id)} className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer text-[var(--text-muted)] hover:text-yellow-400">
                    <Star size={16} className={p.isFavorite ? "text-yellow-400 fill-yellow-400" : ""} />
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                    <Copy size={14} />
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm("确定要删除该提示词项目吗？")) {
                        removePrompt(p.id);
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                    title="删除项目"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button 
                    onClick={() => navigate(`/prompts/${p.id}/edit`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--text-primary)] text-[12px] font-bold transition-colors cursor-pointer"
                  >
                    <Edit3 size={14} /> 配置
                  </button>
                  <button 
                    onClick={() => navigate(`/generate/${p.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-2)]/20 hover:bg-[var(--accent-2)]/30 text-blue-400 text-[12px] font-bold border border-[var(--accent-2)]/20 transition-colors cursor-pointer"
                  >
                    <Rocket size={14} /> 生成
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        <div className="mt-auto pt-6 flex items-center justify-center">
          <div className="glass-panel flex items-center gap-1 p-1 rounded-full border border-[var(--glass-border)] shadow-lg">
            <button 
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-[var(--text-muted)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-[12px] font-bold transition-colors cursor-pointer ${currentPage === page ? 'bg-[var(--accent-2)] text-[var(--text-primary)] shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]'}`}
              >
                {page}
              </button>
            ))}

            <button 
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-[var(--text-muted)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
