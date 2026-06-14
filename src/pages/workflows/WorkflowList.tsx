import { Plus, Search, Edit3, Trash2, Cpu, Video, Settings, Play, Star, Zap } from "lucide-react";
import { useWorkflowStore, type WorkflowType } from "../../stores/workflowStore";
import { useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../stores/settingsStore";
import { convertFileSrc } from "@tauri-apps/api/core";

const getImgSrc = (url?: string) => !url ? '' : (url.startsWith('http') || url.startsWith('data:') ? url : convertFileSrc(url));


const TypeBadge = ({ type }: { type: WorkflowType }) => {
  switch (type) {
    case 'text2img':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-2)]/20 text-blue-400 text-[10px] font-bold border border-[var(--accent-2)]/30"><Cpu size={12}/> 文生图</span>;
    case 'img2video':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-2)]/20 text-[var(--accent-2)] text-[10px] font-bold border border-[var(--accent-2)]/30"><Video size={12}/> 视频</span>;
    case 'tagger':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/30"><Search size={12}/> 反推</span>;
    default:
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-[var(--text-muted)] text-[10px] font-bold border border-[var(--glass-border-active)]"><Settings size={12}/> 自定义</span>;
  }
};

export function WorkflowList() {
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  const workflows = useWorkflowStore(state => state.workflows);
  const setDefaultWorkflow = useWorkflowStore(state => state.setDefaultWorkflow);
  const removeWorkflow = useWorkflowStore(state => state.removeWorkflow);
  const navigate = useNavigate();

  const handleImportClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        alert("剪贴板为空");
        return;
      }
      JSON.parse(text); // validate JSON
      navigate('/workflows/new/edit', { state: { importJson: text } });
    } catch (e) {
      alert("无法读取剪贴板或剪贴板内容不是有效的 JSON");
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
            <span className="text-yellow-400 flex items-center justify-center"><Zap size={24} /></span> 工作流管理
          </h2>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">配置并保存 ComfyUI JSON 渲染节点图，与提示词项目绑定</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleImportClipboard} className="px-4 py-2 rounded-xl text-[13px] font-bold border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-white/10 transition-colors cursor-pointer bg-[var(--bg-layer-1)] shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)]">
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

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--glass-border)] pb-2">
        <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto custom-scrollbar pb-2 md:pb-0">
          {["全部", "文生图", "视频生成", "实用工具"].map((tab, i) => (
            <button 
              key={i}
              className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${i === 0 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-white/5 text-[var(--text-muted)] border-[var(--glass-border)] hover:bg-white/10 hover:text-[var(--text-primary)]"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-yellow-400/50 transition-colors rounded-full">
          <Search size={14} className="text-[var(--text-muted)]" />
          <input 
            type="text" 
            placeholder="搜索工作流..." 
            className="bg-transparent border-none outline-none text-[12px] text-[var(--text-primary)] w-full placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {workflows.map((wf) => (
            <div key={wf.id} className="glass-panel rounded-2xl flex flex-col group border border-[var(--glass-border)] hover:border-yellow-400/30 transition-all hover:shadow-[0_8px_30px_rgba(255,213,79,0.1)] overflow-hidden">
              
              {/* Thumbnail */}
              <div className="h-32 w-full relative overflow-hidden flex-shrink-0 bg-[var(--glass-bg)] flex items-center justify-center">
                {wf.thumbnail ? (
                  <>
                    <div className="absolute inset-0 bg-[var(--bg-layer-1)] group-hover:bg-transparent transition-colors z-10" />
                    <img src={getImgSrc(wf.thumbnail)} alt={wf.name} className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
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
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-[16px] font-bold text-[var(--text-primary)] line-clamp-1 flex-1">{wf.name}</h3>
                    <button
                      onClick={() => setDefaultWorkflow(wf.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${wf.isDefault ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20' : 'text-[var(--text-muted)] hover:text-yellow-400 hover:bg-white/5 border border-transparent'}`}
                      title={wf.isDefault ? "当前默认工作流" : "设为默认工作流"}
                    >
                      <Star size={14} className={wf.isDefault ? "fill-yellow-400" : ""} />
                    </button>
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)] line-clamp-2 min-h-[36px]">{wf.description}</p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {wf.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-white/10 text-[var(--text-muted)] text-[10px] font-bold">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-[var(--glass-border)]">
                  <button 
                    onClick={() => {
                      if (confirm(`确定要删除工作流 "${wf.name}" 吗？`)) {
                        removeWorkflow(wf.id);
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--text-primary)] text-[12px] font-bold transition-colors cursor-pointer"
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
