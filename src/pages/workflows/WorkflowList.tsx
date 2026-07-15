import { Plus, Search, Edit3, Trash2, Copy, Cpu, Video, Settings, Play, Star, Zap } from "lucide-react";
import { useState } from "react";
import { useWorkflowStore, type WorkflowType, type WorkflowProject } from "../../stores/workflowStore";
import { usePromptStore } from "../../stores/promptStore";
import { useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../stores/settingsStore";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getImgSrc } from "../../utils/imageUtils";
import { toast } from "sonner";




const TypeBadge = ({ type }: { type: WorkflowType }) => {
  switch (type) {
    case 'text2img':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-2)]/20 text-blue-400 text-[10px] font-bold border border-[var(--accent-2)]/30">文生图</span>;
    case 'img2video':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-2)]/20 text-[var(--accent-2)] text-[10px] font-bold border border-[var(--accent-2)]/30">视频</span>;
    case 'tagger':
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/30">反推</span>;
    default:
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] text-[10px] font-bold border border-[var(--glass-border-active)]">自定义</span>;
  }
};

export function WorkflowList() {
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  const workflows = useWorkflowStore(state => state.workflows);
  const setDefaultWorkflow = useWorkflowStore(state => state.setDefaultWorkflow);
  const removeWorkflow = useWorkflowStore(state => state.removeWorkflow);
  const addWorkflow = useWorkflowStore(state => state.addWorkflow);
  const addPrompt = usePromptStore(state => state.addPrompt);
  const navigate = useNavigate();

  // Category filter + search — previously these UI controls had no state and did nothing.
  const [activeCategory, setActiveCategory] = useState<'all' | 'text2img' | 'video' | 'utility'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const filteredWorkflows = workflows.filter(w => {
    if (activeCategory === 'text2img' && w.type !== 'text2img') return false;
    if (activeCategory === 'video' && w.type !== 'img2video') return false;
    if (activeCategory === 'utility' && w.type !== 'tagger' && w.type !== 'upscale') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!w.name.toLowerCase().includes(q) && !w.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const categoryTabs = [
    { key: 'all', label: '全部' },
    { key: 'text2img', label: '文生图' },
    { key: 'video', label: '视频生成' },
    { key: 'utility', label: '实用工具' },
  ] as const;

  const handleTestWorkflow = async (w: WorkflowProject) => {
    if (w.type !== 'text2img') {
      toast.info("非图文工作流暂不支持在此处直接测试，请前往对应的功能页面。");
      return;
    }
    const newId = crypto.randomUUID();
    await addPrompt({
      id: newId,
      title: "工作流测试: " + w.name,
      description: "用于测试工作流的临时项目",
      positivePrompt: "1girl, solo, masterpiece, best quality",
      negativePrompt: "lowres, bad anatomy, bad hands, text, error, missing fingers",
      artistPrompt: "",
      promptSyntax: 'danbooru',
      width: 896,
      height: 1088,
      steps: 20,
      cfgScale: 7.0,
      seed: "-1",
      sampler: "euler",
      scheduler: "normal",
      baseModel: "",
      vaeModel: "auto",
      loraConfigs: [],
      workflowId: w.id,
      tags: ["test"],
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    navigate(`/generate/${newId}`);
  };

  // Clone a workflow: deep-copy it under a new id, name suffixed with "(克隆)", and reset
  // isDefault so the clone doesn't fight the original for the default slot. Builtin workflows
  // become editable copies (isBuiltin=false) when cloned.
  const handleCloneWorkflow = async (w: WorkflowProject) => {
    try {
      const now = Date.now();
      const clone: WorkflowProject = {
        ...w,
        id: "wf_" + now.toString(),
        name: `${w.name} (克隆)`,
        isDefault: false,
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
      };
      await addWorkflow(clone);
      toast.success("工作流已克隆");
    } catch (e: any) {
      toast.error(`克隆失败: ${e.message}`);
    }
  };

  const handleImportClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.warning("剪贴板为空");
        return;
      }
      JSON.parse(text); // validate JSON
      navigate('/workflows/new/edit', { state: { importJson: text } });
    } catch (e) {
      toast.error("无法读取剪贴板或剪贴板内容不是有效的 JSON");
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* PageHeader */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md">
            工作流管理
          </h2>
          <p className="text-sm mt-1 text-[var(--text-secondary)] font-medium">配置并保存 ComfyUI JSON 渲染节点图，与创作项目绑定</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleImportClipboard} className="px-4 py-2 rounded-xl text-[13px] font-bold border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer bg-[var(--bg-layer-1)] shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)]">
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
          {categoryTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-colors cursor-pointer border ${activeCategory === tab.key ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="glass-panel flex items-center gap-2 px-3 py-1.5 w-64 focus-within:border-yellow-400/50 transition-colors rounded-full">
          <Search size={14} className="text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="搜索工作流..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-[12px] text-[var(--text-primary)] w-full placeholder:text-[var(--text-secondary)]"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        {filteredWorkflows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] gap-3 py-16">
            <Search size={36} className="opacity-20" />
            <p className="text-sm">没有匹配的工作流</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredWorkflows.map((wf) => (
            <div key={wf.id} className="glass-panel rounded-2xl flex flex-col group border border-[var(--glass-border)] hover:border-yellow-400/30 transition-all hover:shadow-[0_8px_30px_rgba(255,213,79,0.1)] overflow-hidden">
              
              {/* Thumbnail */}
              <div className="h-32 w-full relative overflow-hidden flex-shrink-0 bg-[var(--glass-bg)] flex items-center justify-center">
                {wf.thumbnail ? (
                  <>
                    <div className="absolute inset-0 bg-[var(--bg-layer-1)] group-hover:bg-transparent transition-colors z-10" />
                    <img src={getImgSrc(wf.thumbnail)} alt={wf.name} className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                  </>
                ) : (
                  <Cpu size={32} className="text-[var(--text-secondary)] opacity-30 group-hover:scale-110 group-hover:text-yellow-400/30 group-hover:opacity-100 transition-all" />
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
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${wf.isDefault ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20' : 'text-[var(--text-secondary)] hover:text-yellow-400 hover:bg-[var(--glass-bg-hover)] border border-transparent'}`}
                      title={wf.isDefault ? "当前默认工作流" : "设为默认工作流"}
                    >
                      <Star size={14} className={wf.isDefault ? "fill-yellow-400" : ""} />
                    </button>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2 min-h-[36px]">{wf.description}</p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {wf.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] text-[10px] font-bold">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-[var(--glass-border)]">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCloneWorkflow(wf)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500/5 hover:bg-blue-500/10 text-blue-400/70 hover:text-blue-400 transition-colors cursor-pointer"
                      title="克隆工作流"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`确定要删除工作流 "${wf.name}" 吗？`)) {
                          removeWorkflow(wf.id);
                        }
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
                      title="删除工作流"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[var(--text-primary)] text-[12px] font-bold transition-all active:scale-95 cursor-pointer"
                    >
                      <Edit3 size={14} /> 编辑
                    </button>
                    <button 
                      onClick={() => handleTestWorkflow(wf)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] hover:opacity-90 text-white text-[12px] font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <Play size={14} /> 测试
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
        )}
      </div>

    </div>
  );
}
