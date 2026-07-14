import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Play, Plus, Image as ImageIcon, Cpu, Layers, X, Trash2, History, FileText, RefreshCw, Tags, Loader2 } from "lucide-react";
import { usePromptStore, type PromptProject, type LoraConfig } from "../../stores/promptStore";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { invoke } from "@tauri-apps/api/core";
import { HistoryImagePicker } from "../../components/ui/HistoryImagePicker";
import { convertFileSrc } from "@tauri-apps/api/core";



import { PromptTagEditor } from "../../components/prompt/PromptTagEditor";
import { ArtistSelector } from "../../components/prompt/ArtistSelector";
import { LoraSelectorUI } from "../../components/prompt/LoraSelectorUI";
import { getImgSrc } from "../../utils/imageUtils";
import { comfyService } from "../../services/comfyService";
import { aiService } from "../../services/aiService";
import { SAMPLER_OPTIONS, SCHEDULER_OPTIONS } from "../../lib/workflowOptions";
import { toast } from "sonner";

export function PromptEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const prompts = usePromptStore((state) => state.prompts);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const addPrompt = usePromptStore((state) => state.addPrompt);
  const { checkpoints, loras, vaes, fetchModels } = useModelStore();
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);
  
  const workflows = useWorkflowStore(state => state.workflows);

  const [project, setProject] = useState<Partial<PromptProject>>({
    title: "", description: "", positivePrompt: "", negativePrompt: "", artistPrompt: "",
    width: 896, height: 1088, steps: 20, cfgScale: 5.0, seed: "-1",
    baseModel: "", vaeModel: "auto", loraConfigs: [], tags: [], instanceImages: []
  });
  const [tagInput, setTagInput] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  // Single-project AI tagging state
  const [isTagging, setIsTagging] = useState<boolean>(false);

  const handleAutoTagSingle = async () => {
    if (isTagging) return;
    const textToAnalyze = [project.title, project.positivePrompt].filter(Boolean).join("\n").trim();
    if (!textToAnalyze) {
      toast.error("项目没有可分析的创作文本");
      return;
    }
    setIsTagging(true);
    try {
      const newTags = await aiService.generateTags(textToAnalyze);
      if (newTags.length > 0) {
        // Merge with existing tags (dedupe), keep the new ones.
        const existing = project.tags || [];
        const merged = Array.from(new Set([...existing, ...newTags]));
        setProject(prev => ({ ...prev, tags: merged }));
        toast.success("AI 打标完成");
      } else {
        toast.error("未能提取到标签，请检查创作内容");
      }
    } catch (err: any) {
      toast.error(`打标失败：${err?.message || err}`);
    } finally {
      setIsTagging(false);
    }
  };
  // Guard so the new-prompt default-workflow init only runs ONCE. Previously this effect re-ran
  // whenever `prompts` changed (e.g. Generate auto-saving another project, an agent creating a
  // prompt, a favorite toggle), and the new-prompt branch would clobber the user's in-progress
  // baseModel / sampler / lora selections with the workflow defaults again.
  const newPromptInitDone = useRef(false);

  useEffect(() => {
    if (id && id !== 'new') {
      const p = prompts.find(p => p.id === id);
      if (p) setProject(p);
    } else {
      // 新建提示词：用 text2img 默认工作流初始化所有可识别的参数
      // （baseModel / vaeModel / width / height / steps / cfgScale / sampler / scheduler / loras）。
      // 只在首次（workflows/checkpoints 加载后）执行一次，避免覆盖用户后续编辑。
      if (newPromptInitDone.current) return;
      const defaultWorkflow = workflows.find(w => w.type === 'text2img' && w.isDefault);
      setProject(prev => {
        const next: Partial<PromptProject> = { ...prev };
        if (defaultWorkflow) {
          next.workflowId = defaultWorkflow.id;
          if (defaultWorkflow.jsonContent) {
            try {
              const a = comfyService.analyzeWorkflow(defaultWorkflow.jsonContent);
              if (a.baseModel) next.baseModel = a.baseModel;
              if (a.vaeModel) next.vaeModel = a.vaeModel;
              if (a.width) next.width = a.width;
              if (a.height) next.height = a.height;
              if (a.steps) next.steps = a.steps;
              if (a.cfgScale) next.cfgScale = a.cfgScale;
              if (a.samplerName) next.sampler = a.samplerName;
              if (a.scheduler) next.scheduler = a.scheduler;
              if (a.loras && a.loras.length > 0) next.loraConfigs = a.loras;
            } catch (e) {
              console.warn("[PromptEdit] new-prompt: failed to parse default workflow:", e);
            }
          }
        }
        // baseModel 兜底：workflow 没解析出来时，用本地第一个 checkpoint
        if ((!next.baseModel || !checkpoints.includes(next.baseModel)) && checkpoints.length > 0) {
          next.baseModel = checkpoints[0];
        }
        return next;
      });
      newPromptInitDone.current = true;
    }
  }, [id, prompts, workflows, checkpoints]);

  // 切换 workflow 时同步 loraConfigs（既有项目也生效——LoRA 总是从 workflow 解析，
  // 用户不应手动管理绑定的 workflow 里的 lora）。其他参数仅在新建时同步（见上），
  // 避免 import 一个 workflow 后用户改了 baseModel，再切回来又被覆盖。
  useEffect(() => {
    const wfId = project.workflowId;
    if (!wfId) return;
    const workflow = workflows.find(w => w.id === wfId);
    if (!workflow || !workflow.jsonContent) return;

    try {
      const analysis = comfyService.analyzeWorkflow(workflow.jsonContent);
      updateField('loraConfigs', analysis.loras || []);
    } catch (e) {
      console.warn("[PromptEdit] lora-sync: failed to parse loras from workflow:", e);
    }
  }, [project.workflowId, workflows]);

  // Extract all unique tags
  const allTags = Array.from(new Set(prompts.flatMap(p => p.tags)));
  const filteredTags = allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !project.tags?.includes(t));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagContainerRef.current && !tagContainerRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Returns the saved project's id on success, or null if save was skipped/failed.
  const handleSave = async (): Promise<string | null> => {
    if (!project.title?.trim()) {
      toast.warning('请输入项目名称');
      return null;
    }

    const isEditing = id && id !== 'new';
    if (isEditing) {
      await updatePrompt(id, project);
      toast.success('项目已更新');
      return id;
    } else {
      // Create a new prompt project
      const newId = "p_" + Date.now().toString();
      const now = Date.now();
      const newProject: PromptProject = {
        id: newId,
        title: project.title || "未命名项目",
        description: project.description || "",
        positivePrompt: project.positivePrompt || "",
        negativePrompt: project.negativePrompt || "",
        artistPrompt: project.artistPrompt || "",
        promptSyntax: project.promptSyntax || 'danbooru',
        width: project.width || 896,
        height: project.height || 1088,
        steps: project.steps || 20,
        cfgScale: project.cfgScale || 5.0,
        seed: project.seed || "-1",
        sampler: project.sampler || "euler_ancestral",
        scheduler: project.scheduler || "beta57",
        baseModel: project.baseModel || "",
        vaeModel: project.vaeModel || "auto",
        loraConfigs: project.loraConfigs || [],
        workflowId: project.workflowId,
        tags: project.tags || [],
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
        instanceImages: project.instanceImages || [],
      };
      await addPrompt(newProject);
      toast.success('项目已创建');
      // Switch URL from /prompts/new to the real edit URL so subsequent saves update
      // instead of creating duplicates.
      navigate(`/prompts/${newId}/edit`, { replace: true });
      return newId;
    }
  };

  const updateField = (key: keyof PromptProject, value: any) => {
    setProject(prev => ({ ...prev, [key]: value }));
  };

  const updateLora = (index: number, updates: Partial<LoraConfig>) => {
    setProject(prev => {
      const loras = [...(prev.loraConfigs || [])];
      loras[index] = { ...loras[index], ...updates };
      return { ...prev, loraConfigs: loras };
    });
  };



  const removeTag = (tagToRemove: string) => {
    updateField('tags', project.tags?.filter(t => t !== tagToRemove));
  };

  const addLora = (loraName: string) => {
    if (!loraName) return;
    setProject(prev => ({
      ...prev,
      loraConfigs: [...(prev.loraConfigs || []), { name: loraName, strength: 0.8, enabled: true }]
    }));
  };

  return (
    <div className="flex flex-col relative z-10 gap-6 max-w-6xl mx-auto w-full">
      
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 bg-[var(--bg-layer-1)] p-4 rounded-2xl border border-[var(--glass-border)] backdrop-blur-md sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={() => navigate('/prompts')}
            className="w-10 h-10 rounded-full bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="hidden md:block">
            <h2 className="text-xl font-bold text-[var(--text-primary)] drop-shadow-md">
              {!id ? '新建创作项目' : '编辑创作项目'}
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)]">{project.title || "未命名项目"}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto justify-end">
          <button
            onClick={handleAutoTagSingle}
            disabled={isTagging}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)] w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
            title="用 AI 分析当前创作并生成分类标签"
          >
            {isTagging ? <Loader2 size={16} className="animate-spin" /> : <Tags size={16} />}
            {isTagging ? '打标中...' : 'AI 打标'}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold bg-[var(--glass-bg-hover)] hover:bg-[var(--glass-border-active)] text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)] w-full sm:w-auto"
          >
            <Save size={16} /> 保存项目
          </button>
            <button
              onClick={async () => {
                // Must await save so the project exists in the store (with the right id)
                // before Generate tries to load it by id. Previously this fired both calls
                // without awaiting, so on create the project didn't exist yet AND the URL
                // still carried the bogus id "new" — Generate showed "no project selected".
                const savedId = await handleSave();
                if (savedId) navigate(`/generate/${savedId}`);
              }}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] hover:scale-[1.02] transition-all text-[var(--text-primary)] cursor-pointer w-full sm:w-auto"
              style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              <Play size={16} /> 立即生成
            </button>
        </div>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 pb-10">
        
        {/* Left Column - Content & Params */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          
          <div className="glass-panel p-5 space-y-4 relative z-[60]">
            <div>
              <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">项目名称</label>
              <input 
                type="text" value={project.title} onChange={e => updateField('title', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                placeholder="例如：赛博朋克夜之城"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">项目描述</label>
              <input 
                type="text" value={project.description} onChange={e => updateField('description', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-secondary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors"
                placeholder="简要描述这个项目的用途或预期效果..."
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">标签 (Tags)</label>
              <div 
                ref={tagContainerRef}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-2 min-h-[46px] flex flex-wrap gap-2 focus-within:border-[var(--accent-2)]/50 transition-colors relative"
              >
                {project.tags?.map(tag => (
                  <span key={tag} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--accent-2)]/20 text-[var(--accent-1)] border border-[var(--accent-2)]/30 text-[11px] font-bold">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors cursor-pointer"><X size={12}/></button>
                  </span>
                ))}
                <div className="flex-1 min-w-[120px] relative">
                  <input 
                    type="text" 
                    value={tagInput} 
                    onChange={e => {
                      setTagInput(e.target.value);
                      setShowTagDropdown(true);
                    }} 
                    onFocus={() => setShowTagDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault();
                        const newTag = tagInput.trim();
                        if (!project.tags?.includes(newTag)) {
                          updateField('tags', [...(project.tags || []), newTag]);
                        }
                        setTagInput("");
                        setShowTagDropdown(false);
                      }
                    }}
                    className="w-full bg-transparent border-none outline-none text-[var(--text-primary)] text-[12px] px-2 h-7"
                    placeholder="输入或搜索标签后按回车添加..."
                  />
                  
                  {/* Glassmorphism Autocomplete Dropdown */}
                  {showTagDropdown && (tagInput.trim() !== "" || filteredTags.length > 0) && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-[#1A1625]/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[200px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex-1 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {tagInput.trim() && !allTags.includes(tagInput.trim()) && !project.tags?.includes(tagInput.trim()) && (
                          <button
                            type="button"
                            onClick={() => {
                              updateField('tags', [...(project.tags || []), tagInput.trim()]);
                              setTagInput("");
                              setShowTagDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors cursor-pointer text-[var(--accent-1)] hover:bg-[var(--accent-1)]/20 font-bold flex items-center gap-2"
                          >
                            <Plus size={14} /> 添加新标签: "{tagInput}"
                          </button>
                        )}
                        {filteredTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              updateField('tags', [...(project.tags || []), tag]);
                              setTagInput("");
                              setShowTagDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors cursor-pointer text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 px-4 shadow-lg">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap">
                  <Cpu size={14} className="text-[var(--accent-2)]" />
                  Prompt Syntax
                </label>
                <div className="flex bg-[var(--bg-layer-0)] rounded-lg p-1 gap-1 overflow-x-auto max-w-full">
                  {(['danbooru', 'natural', 'xml'] as const).map(syntax => (
                    <button
                      key={syntax}
                      type="button"
                      onClick={() => updateField('promptSyntax', syntax)}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${
                        (project.promptSyntax || 'danbooru') === syntax
                          ? 'bg-[var(--accent-2)] text-white shadow-[0_0_15px_rgba(179,136,255,0.5)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)]'
                      }`}
                    >
                      {syntax.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] bg-[var(--glass-bg)] px-3 py-1.5 rounded-lg whitespace-nowrap text-center lg:text-right">
                {(project.promptSyntax || 'danbooru') === 'danbooru' && "标准逗号分隔标签 (支持智能预测)"}
                {project.promptSyntax === 'natural' && "自然语言描述 (无限制输入)"}
                {project.promptSyntax === 'xml' && "结构化 XML (兼容 NewBie/Anima)"}
              </div>
            </div>

            {(project.promptSyntax === 'natural' || project.promptSyntax === 'xml') ? (
              <>
                <div className="flex flex-col h-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl overflow-hidden p-4 shadow-lg relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
                  <label className="text-[12px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2 relative z-10">
                    <FileText size={16} className="text-[var(--accent-1)]" />
                    正向提示词 ({project.promptSyntax === 'xml' ? 'XML Structure' : 'Natural Language'})
                  </label>
                  <textarea
                    value={project.positivePrompt || ""}
                    onChange={e => updateField('positivePrompt', e.target.value)}
                    className="flex-1 w-full bg-[var(--bg-layer-0)] border border-[var(--glass-border)] rounded-xl p-4 text-[var(--text-primary)] text-sm font-mono outline-none focus:border-[var(--accent-1)]/50 transition-colors resize-none scrollbar-thin scrollbar-thumb-white/10 relative z-10"
                    placeholder={project.promptSyntax === 'xml' ? "<character>\n  <name>Hatsune Miku</name>\n</character>\n<caption>...</caption>" : "A beautifully detailed cinematic wide shot of..."}
                  />
                </div>
                <div className="flex flex-col h-48 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl overflow-hidden p-4 shadow-lg relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none" />
                  <label className="text-[12px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2 relative z-10">
                    <FileText size={16} className="text-[var(--accent-2)]" />
                    负向提示词
                  </label>
                  <textarea
                    value={project.negativePrompt || ""}
                    onChange={e => updateField('negativePrompt', e.target.value)}
                    className="flex-1 w-full bg-[var(--bg-layer-0)] border border-[var(--glass-border)] rounded-xl p-4 text-[var(--text-primary)] text-sm font-mono outline-none focus:border-[var(--accent-2)]/50 transition-colors resize-none scrollbar-thin scrollbar-thumb-white/10 relative z-10"
                    placeholder="low quality, bad anatomy, worst quality..."
                  />
                </div>
              </>
            ) : (
              <>
                <PromptTagEditor
                  label="正向提示词 (Positive)"
                  value={project.positivePrompt || ""}
                  onChange={v => updateField('positivePrompt', v)}
                  type="positive"
                />
                <PromptTagEditor
                  label="负向提示词 (Negative)"
                  value={project.negativePrompt || ""}
                  onChange={v => updateField('negativePrompt', v)}
                  type="negative"
                />
                <ArtistSelector
                  selectedTriggers={project.artistPrompt || ""}
                  onChange={v => updateField('artistPrompt', v)}
                />
              </>
            )}
          </div>

        </div>

        {/* Right Column - Model & Config */}
        <div className="w-full md:w-[380px] flex-shrink-0 flex flex-col gap-5">
          
          {/* Generation Settings */}
          <div className="glass-panel p-5 relative z-[50]">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-[var(--accent-1)]" /> 生成参数配置
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">采样器 (Sampler)</label>
                <GlassDropdown
                  value={project.sampler || "euler"}
                  onChange={v => updateField('sampler', v)}
                  options={SAMPLER_OPTIONS}
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">调度器 (Scheduler)</label>
                <GlassDropdown
                  value={project.scheduler || "normal"}
                  onChange={v => updateField('scheduler', v)}
                  options={SCHEDULER_OPTIONS}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">采样步数 (Steps)</label>
                <input 
                  type="number" value={project.steps || 20} onChange={e => updateField('steps', Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">CFG Scale</label>
                <input
                  type="number" step="0.1" value={project.cfgScale || 5.0} onChange={e => updateField('cfgScale', Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                />
              </div>
            </div>

            {/* Resolution + Seed */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">宽度</label>
                <input
                  type="number" value={project.width || 832} onChange={e => updateField('width', Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">高度</label>
                <input
                  type="number" value={project.height || 1216} onChange={e => updateField('height', Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5 block">种子 (Seed)</label>
                <input
                  type="text" value={project.seed || "-1"} onChange={e => updateField('seed', e.target.value)}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold font-mono"
                />
              </div>
            </div>
          </div>

          {/* 示范图 — 第一张自动作为封面，在列表/Dashboard 显示 */}
          <div className="glass-panel p-5 relative z-[30]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                <ImageIcon size={16} className="text-[var(--accent-1)]" /> 示范图
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowHistoryPicker(true)} 
                  className="px-3 py-1 bg-[var(--accent-2)]/20 text-[var(--accent-1)] text-[11px] font-bold rounded-lg hover:bg-[var(--accent-2)]/30 transition-colors cursor-pointer border border-[var(--accent-2)]/30 flex items-center gap-1"
                >
                  <History size={12} /> 选历史图
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {project.instanceImages?.map((img, i) => (
                <div key={i} className="w-16 h-16 rounded-xl overflow-hidden border border-[var(--glass-border)] relative group">
                  <img src={getImgSrc(img)} className={`w-full h-full object-cover transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} alt="instance" />
                  <button 
                    onClick={() => updateField('instanceImages', project.instanceImages!.filter((_, idx) => idx !== i))} 
                    className="absolute top-0 right-0 bg-red-500/80 text-[var(--text-primary)] p-0.5 rounded-bl-lg hover:bg-red-500 transition-colors cursor-pointer"
                  >
                    <X size={12}/>
                  </button>
                </div>
              ))}
              {(!project.instanceImages || project.instanceImages.length === 0) && (
                <div className="w-full h-16 flex items-center justify-center border border-dashed border-[var(--glass-border)] rounded-lg text-[var(--text-secondary)] text-[11px] font-bold tracking-widest">
                  暂无示范图
                </div>
              )}
            </div>
          </div>

          {/* Model Configuration */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="glass-panel p-5 space-y-4 relative z-[20]">
              <div className="flex items-center justify-between mb-2 border-b border-[var(--glass-border)] pb-2">
                <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Cpu size={16} className="text-[var(--accent-1)]" /> 模型配置
                </h3>
                <button 
                  onClick={() => fetchModels()}
                  className="flex items-center gap-1.5 px-2 py-1 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-md text-[10px] text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="刷新模型列表"
                >
                  <RefreshCw size={10} className="text-[var(--accent-1)]" /> 刷新列表
                </button>
              </div>
              
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Layers size={12} className="text-[var(--accent-1)]" /> 工作流 (Workflow)
                </label>
                <div className="relative z-[60]">
                  <GlassDropdown
                    value={project.workflowId || workflows.find(w => w.type === 'text2img' && w.isDefault)?.id || ""}
                    onChange={v => updateField('workflowId', v || undefined)}
                    options={[
                      ...workflows.map(w => ({ label: w.name, value: w.id }))
                    ]}
                    accentColor="blue"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block">
                  基础模型 (Base Model)
                </label>
                <div className="relative z-50">
                  <SearchableDropdown 
                    value={project.baseModel || ""}
                    onChange={v => updateField('baseModel', v)}
                    options={[
                      { label: "未配置", value: "" },
                      ...checkpoints.map(c => ({ label: c, value: c }))
                    ]}
                    accentColor="purple"
                    placeholder="选择基础模型..."
                    searchPlaceholder="搜索模型文件..."
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block">
                  VAE 模型
                </label>
                <div className="relative z-40">
                  <GlassDropdown
                    value={project.vaeModel || "auto"}
                    onChange={v => updateField('vaeModel', v)}
                    options={[
                      { label: "Automatic (自动)", value: "auto" },
                      ...vaes.map(v => ({ label: v, value: v })),
                    ]}
                    accentColor="purple"
                  />
                </div>
              </div>

              <div className="mt-4">
                <LoraSelectorUI
                  selectedLoras={project.loraConfigs || []}
                  onChange={v => updateField('loraConfigs', v)}
                  availableLoras={loras}
                />
              </div>
            </div>
          </div>

        </div>

      </div>
      
      {showHistoryPicker && (
        <HistoryImagePicker 
          onSelect={url => {
            updateField('instanceImages', [...(project.instanceImages || []), url]);
            setShowHistoryPicker(false);
          }} 
          onClose={() => setShowHistoryPicker(false)} 
        />
      )}
    </div>
  );
}
