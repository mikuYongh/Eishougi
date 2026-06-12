import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Play, Plus, Trash2, Image as ImageIcon, UploadCloud, Cpu, Layers, X, History } from "lucide-react";
import { usePromptStore, type PromptProject, type LoraConfig } from "../../stores/promptStore";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { invoke } from "@tauri-apps/api/core";
import { HistoryImagePicker } from "../../components/ui/HistoryImagePicker";
import { PromptTagEditor } from "../../components/prompt/PromptTagEditor";

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
    }
  }, [id, prompts]);

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
              label="正向提示词"
              value={project.positivePrompt || ""}
              onChange={v => updateField('positivePrompt', v)}
              type="positive"
            />
            <PromptTagEditor
              label="负向提示词"
              value={project.negativePrompt || ""}
              onChange={v => updateField('negativePrompt', v)}
              type="negative"
            />
          </div>

          <div className="glass-panel p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">迭代步数 (Steps)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="1" max="150" value={project.steps} onChange={e => updateField('steps', parseInt(e.target.value))} className="flex-1 h-1 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                <span className="text-[13px] font-mono font-bold text-[var(--text-primary)] w-8 text-right">{project.steps}</span>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">提示词引导 (CFG)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="1" max="30" step="0.5" value={project.cfgScale} onChange={e => updateField('cfgScale', parseFloat(e.target.value))} className="flex-1 h-1 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                <span className="text-[13px] font-mono font-bold text-[var(--text-primary)] w-8 text-right">{project.cfgScale}</span>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">随机种子 (Seed)</label>
              <input type="text" value={project.seed} onChange={e => updateField('seed', e.target.value)} className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-[var(--text-primary)] text-xs font-mono outline-none focus:border-[var(--accent-2)]/50" />
            </div>
          </div>

        </div>

        {/* Right Column - Model & Config */}
        <div className="w-full md:w-[380px] flex-shrink-0 flex flex-col gap-5">
          
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
                  <img src={project.coverImage} alt="Cover" className={`w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
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
                  <img src={img} className={`w-full h-full object-cover transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} alt="instance" />
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

          <div className="glass-panel p-5">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <ImageIcon size={16} className="text-blue-400" /> 分辨率与画幅
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { w: 1024, h: 1024, label: "1:1 方形" },
                { w: 1024, h: 576, label: "16:9 横屏" },
                { w: 576, h: 1024, label: "9:16 竖屏" },
                { w: 832, h: 1216, label: "动漫竖版" }
              ].map((res, i) => (
                <button 
                  key={i}
                  onClick={() => { updateField('width', res.w); updateField('height', res.h); }}
                  className={`py-2 px-3 rounded-xl flex flex-col items-center gap-1 border transition-colors cursor-pointer ${project.width === res.w && project.height === res.h ? 'bg-[var(--accent-2)]/20 border-[var(--accent-2)]/50 text-blue-400' : 'bg-[var(--bg-layer-1)] border-[var(--glass-border)] text-[var(--text-muted)] hover:bg-white/5'}`}
                >
                  <span className="text-[11px] font-bold">{res.label}</span>
                  <span className="text-[10px] font-mono opacity-60">{res.w} x {res.h}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5 relative z-40">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-[var(--accent-2)]" /> 基础模型
            </h3>
            <div className="space-y-4">
              <div className="relative z-40">
                <label className="text-[10px] text-[var(--text-muted)] mb-1.5 block uppercase tracking-wider font-bold">Checkpoint</label>
                <SearchableDropdown 
                  value={project.baseModel || ""}
                  onChange={v => updateField('baseModel', v)}
                  options={checkpoints.map(c => ({ label: c, value: c }))}
                  accentColor="purple"
                  placeholder="选择基础模型..."
                  searchPlaceholder="搜索模型文件..."
                />
              </div>
              <div className="relative z-20">
                <label className="text-[10px] text-[var(--text-muted)] mb-1.5 block uppercase tracking-wider font-bold">VAE</label>
                <GlassDropdown 
                  value={project.vaeModel || ""}
                  onChange={v => updateField('vaeModel', v)}
                  options={[
                    { label: "Automatic (自动)", value: "auto" },
                    { label: "sdxl_vae.safetensors", value: "sdxl_vae" }
                  ]}
                  accentColor="purple"
                />
              </div>
            </div>
          </div>

          <div className="glass-panel p-5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Layers size={16} className="text-orange-400" /> LoRA 列表
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {project.loraConfigs?.map((lora, i) => (
                <div key={i} className="p-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[var(--text-primary)] truncate pr-2">{lora.name}</span>
                    <button 
                      onClick={() => {
                        const newLoras = [...(project.loraConfigs || [])];
                        newLoras.splice(i, 1);
                        updateField('loraConfigs', newLoras);
                      }}
                      className="text-red-400/50 hover:text-red-400 cursor-pointer transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="range" min="0" max="2" step="0.05" value={lora.strength} onChange={e => updateLora(i, { strength: parseFloat(e.target.value) })} className="flex-1 h-1 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer accent-orange-400" />
                    <span className="text-[11px] font-mono font-bold text-orange-400 w-8 text-right">{lora.strength.toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {(!project.loraConfigs || project.loraConfigs.length === 0) && (
                <div className="h-24 flex items-center justify-center text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-widest border border-dashed border-[var(--glass-border)] rounded-xl">
                  暂未添加 LoRA
                </div>
              )}
              
              <div className="mt-4 relative z-30">
                <SearchableDropdown
                  value=""
                  placeholder="➕ 搜索并添加 LoRA..."
                  searchPlaceholder="输入 LoRA 名称进行搜索..."
                  options={loras.map(l => ({ label: l, value: l }))}
                  onChange={addLora}
                  accentColor="orange"
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
