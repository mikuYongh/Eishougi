import { Plus, Search, Edit3, Trash2, Cpu, Video, Settings, Play } from "lucide-react";
import { useWorkflowStore, type WorkflowType } from "../../stores/workflowStore";
import { useNavigate } from "react-router-dom";

const TypeBadge = ({ type }: { type: WorkflowType }) => {
  switch (type) {
    case 'text2img':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/30"><Cpu size={12}/> 文生图</span>;
    case 'img2video':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-bold border border-purple-500/30"><Video size={12}/> 视频</span>;
    case 'tagger':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/30"><Search size={12}/> 反推</span>;
    default:
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-bold border border-white/20"><Settings size={12}/> 自定义</span>;
  }
};

export function WorkflowList() {
  const workflows = useWorkflowStore(state => state.workflows);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-yellow-400">⚡</span> 工作流管理
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">配置并保存 ComfyUI JSON 渲染节点图，与提示词项目绑定</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-xl text-[13px] font-bold border border-white/10 text-white/90 hover:bg-white/10 transition-colors cursor-pointer bg-black/20 shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)]">
            从剪贴板导入 JSON
          </button>
          <button 
            onClick={() => navigate('/workflows/new/edit')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(255,213,79,0.3)] hover:scale-[1.02] transition-all text-black cursor-pointer"
            style={{ background: "linear-gradient(135deg, #FFCA28, #FF9800)", border: "1px solid rgba(255,255,255,0.4)" }}
          >
            <Plus size={16} /> 新建工作流
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          {["全部", "文生图", "视频生成", "实用工具"].map((tab, i) => (
            <button 
              key={i}
              className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${i === 0 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-yellow-400/50 transition-colors rounded-full">
          <Search size={14} className="text-white/40" />
          <input 
            type="text" 
            placeholder="搜索工作流..." 
            className="bg-transparent border-none outline-none text-[12px] text-white w-full placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {workflows.map((wf) => (
            <div key={wf.id} className="glass-panel rounded-2xl flex flex-col group border border-white/5 hover:border-yellow-400/30 transition-all hover:shadow-[0_8px_30px_rgba(255,213,79,0.1)] overflow-hidden">
              
              {/* Thumbnail */}
              <div className="h-32 w-full relative overflow-hidden flex-shrink-0 bg-black/40 flex items-center justify-center">
                {wf.thumbnail ? (
                  <>
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />
                    <img src={wf.thumbnail} alt={wf.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                  </>
                ) : (
                  <Cpu size={32} className="text-white/10 group-hover:scale-110 group-hover:text-yellow-400/30 transition-all" />
                )}
                <div className="absolute top-3 left-3 z-20">
                  <TypeBadge type={wf.type} />
                </div>
              </div>

              <div className="p-5 flex flex-col gap-4 flex-1">
                <div>
                  <h3 className="text-[16px] font-bold text-white/90 mb-1 line-clamp-1">{wf.name}</h3>
                  <p className="text-[12px] text-white/50 line-clamp-2 min-h-[36px]">{wf.description}</p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {wf.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-bold">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-400/70 hover:text-red-400 transition-colors cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[12px] font-bold transition-colors cursor-pointer"
                    >
                      <Edit3 size={14} /> 编辑
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-[12px] font-bold border border-yellow-500/20 transition-colors cursor-pointer">
                      <Play size={14} /> 测试
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
