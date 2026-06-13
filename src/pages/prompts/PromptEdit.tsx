import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Play, Plus, Trash2, Image as ImageIcon, UploadCloud, Cpu, Layers, X, History } from "lucide-react";
import { usePromptStore, type PromptProject, type LoraConfig } from "../../stores/promptStore";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { invoke } from "@tauri-apps/api/core";
import { HistoryImagePicker } from "../../components/ui/HistoryImagePicker";
import { convertFileSrc } from "@tauri-apps/api/core";

const getImgSrc = (url?: string) => !url ? '' : (url.startsWith('http') || url.startsWith('data:') ? url : convertFileSrc(url));

import { PromptTagEditor } from "../../components/prompt/PromptTagEditor";
import { ArtistSelector } from "../../components/prompt/ArtistSelector";

export function PromptEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const prompts = usePromptStore((state) => state.prompts);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const { checkpoints, loras, fetchModels } = useModelStore();
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);
  
  const workflows = useWorkflowStore(state => state.workflows);

  const [project, setProject] = useState<Partial<PromptProject>>({
    title: "", description: "", coverImage: "", positivePrompt: "", negativePrompt: "", artistPrompt: "",
    width: 896, height: 1088, steps: 20, cfgScale: 5.0, seed: "-1",
    baseModel: "sd_xl_base_1.0.safetensors", vaeModel: "auto", loraConfigs: [], tags: [], instanceImages: []
  });
  const [tagInput, setTagInput] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id && id !== 'new') {
      const p = prompts.find(p => p.id === id);
      if (p) setProject(p);
    } else if (id === 'new') {
      // Set default workflow for new prompts
      const defaultWorkflow = workflows.find(w => w.isDefault);
      if (defaultWorkflow) {
        setProject(prev => ({ ...prev, workflowId: defaultWorkflow.id }));
      }
    }
  }, [id, prompts, workflows]);

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

  const handleSave = async () => {
    if (id && id !== 'new') {
      console.log("[PromptEdit] saving positivePrompt:", project.positivePrompt?.substring(0, 50), "negativePrompt:", project.negativePrompt?.substring(0, 50));
      await updatePrompt(id, project);
      console.log("[PromptEdit] save complete");
    }
    // For 'new', we'd addPrompt. Simplified for demo.
    navigate('/prompts');
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
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-6xl mx-auto w-full">
      
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 bg-[var(--bg-layer-1)] p-4 rounded-2xl border border-[var(--glass-border)] backdrop-blur-md">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={() => navigate('/prompts')}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] drop-shadow-md">
              {id === 'new' ? '新建提示词项目' : '编辑提示词项目'}
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">{project.title || "未命名项目"}</p>
          </div>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto justify-end">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold bg-white/10 hover:bg-white/20 text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)]"
          >
            <Save size={16} /> 保存项目
          </button>
          <button 
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] hover:scale-[1.02] transition-all text-[var(--text-primary)] cursor-pointer"
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            <Play size={16} fill="currentColor" /> 立即生成
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0 overflow-y-auto pb-10">
        
        {/* Left Column - Content & Params */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          
          <div className="glass-panel p-5 space-y-4">
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">项目名称</label>
              <input 
                type="text" value={project.title} onChange={e => updateField('title', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                placeholder="例如：赛博朋克夜之城"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">项目描述</label>
              <input 
                type="text" value={project.description} onChange={e => updateField('description', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-muted)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors"
                placeholder="简要描述这个项目的用途或预期效果..."
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">标签 (Tags)</label>
              <div 
                ref={tagContainerRef}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-2 min-h-[46px] flex flex-wrap gap-2 focus-within:border-[var(--accent-2)]/50 transition-colors relative"
              >
                {project.tags?.map(tag => (
                  <span key={tag} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--accent-2)]/20 text-blue-400 border border-[var(--accent-2)]/30 text-[11px] font-bold">
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
                            className="w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors cursor-pointer text-blue-400 hover:bg-blue-500/20 font-bold flex items-center gap-2"
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
                            className="w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors cursor-pointer text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
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
          </div>

        </div>

        {/* Right Column - Model & Config */}
        <div className="w-full md:w-[380px] flex-shrink-0 flex flex-col gap-5">
          
          {/* Generation Settings */}
          <div className="glass-panel p-5">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-[var(--accent-1)]" /> 生成参数配置
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">采样器 (Sampler)</label>
                <GlassDropdown 
                  value={project.samplerName || "euler"}
                  onChange={v => updateField('samplerName', v)}
                  options={[
                    { label: "euler", value: "euler" },
                    { label: "euler_ancestral", value: "euler_ancestral" },
                    { label: "heun", value: "heun" },
                    { label: "dpm_2", value: "dpm_2" },
                    { label: "dpm_2_ancestral", value: "dpm_2_ancestral" },
                    { label: "dpmpp_2s_ancestral", value: "dpmpp_2s_ancestral" },
                    { label: "dpmpp_2m", value: "dpmpp_2m" },
                    { label: "dpmpp_2m_sde", value: "dpmpp_2m_sde" },
                    { label: "dpmpp_sde", value: "dpmpp_sde" },
                    { label: "dpmpp_3m_sde", value: "dpmpp_3m_sde" },
                  ]}
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">调度器 (Scheduler)</label>
                <GlassDropdown 
                  value={project.scheduler || "beta57"}
                  onChange={v => updateField('scheduler', v)}
                  options={[
                    { label: "normal", value: "normal" },
                    { label: "karras", value: "karras" },
                    { label: "exponential", value: "exponential" },
                    { label: "sgm_uniform", value: "sgm_uniform" },
                    { label: "simple", value: "simple" },
                    { label: "ddim_uniform", value: "ddim_uniform" },
                    { label: "beta", value: "beta" },
                    { label: "beta57", value: "beta57" },
                  ]}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">采样步数 (Steps)</label>
                <input 
                  type="number" value={project.steps || 20} onChange={e => updateField('steps', Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">CFG Scale</label>
                <input 
                  type="number" step="0.1" value={project.cfgScale || 5.0} onChange={e => updateField('cfgScale', Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-2)]/50 transition-colors font-bold"
                />
              </div>
            </div>
          </div>

          {/* Cover Image Uploader */}
          <div className="glass-panel p-5">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <ImageIcon size={16} className="text-blue-400" /> 示范预览图
            </h3>
            <div 
              className="h-48 w-full rounded-xl border-2 border-dashed border-[var(--glass-border)] hover:border-blue-400/50 bg-[var(--glass-bg-hover)] flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {project.coverImage ? (
                <div className="absolute inset-0 z-0 group-hover/cover:bg-[var(--bg-layer-2)] transition-colors flex items-center justify-center cursor-pointer">
                  <img src={getImgSrc(project.coverImage)} alt="Cover" className={`w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity">
                    <span className="bg-[var(--glass-bg)] backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-primary)]">点击更换图片</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <UploadCloud size={20} className="text-[var(--text-muted)] group-hover:text-blue-400 transition-colors" />
                  </div>
                  <span className="text-[11px] font-bold text-[var(--text-muted)]">点击或拖拽上传封面</span>
                </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // Dummy URL for now
                  updateField('coverImage', URL.createObjectURL(file));
                }
              }} />
            </div>
          </div>

          {/* Reference Images */}
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                <ImageIcon size={16} className="text-blue-400" /> 实例图片 (Reference)
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowHistoryPicker(true)} 
                  className="px-3 py-1 bg-[var(--accent-2)]/20 text-blue-400 text-[11px] font-bold rounded-lg hover:bg-[var(--accent-2)]/30 transition-colors cursor-pointer border border-[var(--accent-2)]/30 flex items-center gap-1"
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
                <div className="w-full h-16 flex items-center justify-center border border-dashed border-[var(--glass-border)] rounded-lg text-[var(--text-muted)] text-[11px] font-bold tracking-widest">
                  暂无参考图
                </div>
              )}
            </div>
          </div>

          {/* Artist / Style Selector */}
          <div className="flex-1 min-h-[300px]">
            <ArtistSelector 
              selectedTriggers={project.artistPrompt || ""}
              onChange={v => updateField('artistPrompt', v)}
            />
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
