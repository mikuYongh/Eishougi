import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Image as ImageIcon, Loader2, ArrowLeft, Download, Maximize2, RefreshCw, Cpu, Layers, Plus, Trash2, Sliders, Zap } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { usePromptStore, type LoraConfig } from "../../stores/promptStore";
import { useQueueStore, type QueueJob } from "../../stores/queueStore";
import { downloadImage } from "../../utils/download";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { PromptTagEditor } from "../../components/prompt/PromptTagEditor";
import { StyleSelector } from "../../components/generate/StyleSelector";
import { comfyService } from "../../services/comfyService";
import type { PresetStyle } from "../../data/styles";

const SDXL_RESOLUTIONS = [
  { label: "1024x1024 (1:1 方幅)", value: "1024x1024 (1.0)" },
  { label: "896x1088 (4:5 纵幅)", value: "896x1088 (0.82)" },
  { label: "1088x896 (5:4 横幅)", value: "1088x896 (1.21)" },
  { label: "832x1216 (2:3 动漫肖像)", value: "832x1216 (0.68)" },
  { label: "1216x832 (3:2 动漫风景)", value: "1216x832 (1.46)" },
  { label: "768x1344 (9:16 竖版高清)", value: "768x1344 (0.57)" },
  { label: "1344x768 (16:9 横版宽屏)", value: "1344x768 (1.75)" },
];

function parseLoraFromWorkflow(workflowJson: string): LoraConfig[] {
  try {
    const workflowObj = JSON.parse(workflowJson);
    const loras: LoraConfig[] = [];
    for (const key in workflowObj) {
      const node = workflowObj[key];
      if (node.class_type === "Power Lora Loader (rgthree)" && node.inputs) {
        const keys = Object.keys(node.inputs)
          .filter(k => k.startsWith('lora_'))
          .sort((a, b) => parseInt(a.replace('lora_', '')) - parseInt(b.replace('lora_', '')));
        
        for (const k of keys) {
          const loraObj = node.inputs[k];
          if (loraObj && loraObj.lora) {
            loras.push({
              name: loraObj.lora,
              strength: typeof loraObj.strength === 'number' ? loraObj.strength : 1.0,
              enabled: !!loraObj.on
            });
          }
        }
      }
    }
    return loras;
  } catch (e) {
    return [];
  }
}

export function Generate() {
  const { promptId } = useParams();
  const navigate = useNavigate();
  const prompts = usePromptStore(state => state.prompts);
  const updatePrompt = usePromptStore(state => state.updatePrompt);
  const project = prompts.find(p => p.id === promptId) || prompts[0];

  const { jobs, isConnected, connect, addJob } = useQueueStore();
  const workflows = useWorkflowStore(state => state.workflows);
  const { checkpoints, loras, fetchModels } = useModelStore();
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Local overrides for Generate page
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [overrideBaseModel, setOverrideBaseModel] = useState<string>("");
  const [overrideVaeModel, setOverrideVaeModel] = useState<string>("auto");
  const [overrideLoras, setOverrideLoras] = useState<LoraConfig[]>([]);
  const [overrideWidth, setOverrideWidth] = useState<number>(896);
  const [overrideHeight, setOverrideHeight] = useState<number>(1088);
  const [overrideResolution, setOverrideResolution] = useState<string>("896x1088 (0.82)");
  const [overrideSteps, setOverrideSteps] = useState<number>(20);
  const [overrideCfgScale, setOverrideCfgScale] = useState<number>(5.0);
  const [overrideSeed, setOverrideSeed] = useState<string>("-1");
  const [overrideSampler, setOverrideSampler] = useState<string>("euler");
  const [overrideScheduler, setOverrideScheduler] = useState<string>("beta57");

  // Prompts and style selectors states
  const [positivePrompt, setPositivePrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [selectedStyles, setSelectedStyles] = useState<PresetStyle[]>([]);

  // Workflow structure flag
  const [hasSizePicker, setHasSizePicker] = useState<boolean>(false);

  useEffect(() => {
    if (project) {
      const defaultWf = workflows.find(w => w.isDefault);
      const initialWorkflowId = project.workflowId || (defaultWf ? defaultWf.id : "");
      setSelectedWorkflowId(initialWorkflowId);

      setOverrideVaeModel(project.vaeModel || "auto");
      setOverrideWidth(project.width || 896);
      setOverrideHeight(project.height || 1088);
      
      let initialResolution = project.resolution || "896x1088 (0.82)";
      if (initialResolution && !initialResolution.includes("(")) {
        const matched = SDXL_RESOLUTIONS.find(r => r.value.startsWith(initialResolution));
        initialResolution = matched ? matched.value : "896x1088 (0.82)";
      }
      setOverrideResolution(initialResolution);
      setOverrideSteps(project.steps || 20);
      setOverrideCfgScale(project.cfgScale || 5.0);
      setOverrideSeed(String(project.seed ?? "-1"));
      setOverrideSampler(project.sampler || "euler_ancestral");
      setOverrideScheduler(project.scheduler || "beta57");
      setPositivePrompt(project.positivePrompt || "");
      setNegativePrompt(project.negativePrompt || "");
    }
  }, [project?.id, workflows]);

  // When workflow changes, parse configurations using analyzeWorkflow
  useEffect(() => {
    if (selectedWorkflowId) {
      const workflow = workflows.find(w => w.id === selectedWorkflowId);
      if (workflow && workflow.jsonContent) {
        const analysis = comfyService.analyzeWorkflow(workflow.jsonContent);
        setHasSizePicker(analysis.hasSizePicker);
        
        // Prioritize project's saved parameters if this is the project's selected workflow,
        // otherwise default to workflow defaults.
        const isProjectWf = project && project.workflowId === selectedWorkflowId;

        if (isProjectWf && project.baseModel) {
          setOverrideBaseModel(project.baseModel);
        } else if (analysis.baseModel) {
          setOverrideBaseModel(analysis.baseModel);
        } else if (project?.baseModel) {
          setOverrideBaseModel(project.baseModel);
        } else {
          setOverrideBaseModel("");
        }

        if (isProjectWf && project.vaeModel) {
          setOverrideVaeModel(project.vaeModel);
        } else if (analysis.vaeModel) {
          setOverrideVaeModel(analysis.vaeModel);
        }

        if (isProjectWf && project.sampler) {
          setOverrideSampler(project.sampler);
        } else if (analysis.samplerName) {
          setOverrideSampler(analysis.samplerName);
        }

        if (isProjectWf && project.scheduler) {
          setOverrideScheduler(project.scheduler);
        } else if (analysis.scheduler) {
          setOverrideScheduler(analysis.scheduler);
        }

        // Align overrideLoras with current project preference if the parsed names exist
        const parsedLoras = analysis.loras.map(al => {
          // Check if project has a preference for this LoRA
          const pref = project?.loraConfigs?.find(pc => pc.name === al.name);
          return pref ? { name: al.name, strength: pref.strength, enabled: pref.enabled } : al;
        });
        setOverrideLoras(parsedLoras);
      }
    } else {
      setHasSizePicker(false);
      if (project) {
        setOverrideLoras(JSON.parse(JSON.stringify(project.loraConfigs || [])));
        setOverrideBaseModel(project.baseModel || "");
        setOverrideVaeModel(project.vaeModel || "auto");
      }
    }
  }, [selectedWorkflowId, workflows, project?.id]);
  
  const handleResetToWorkflowDefaults = () => {
    if (selectedWorkflowId) {
      const workflow = workflows.find(w => w.id === selectedWorkflowId);
      if (workflow && workflow.jsonContent) {
        const analysis = comfyService.analyzeWorkflow(workflow.jsonContent);
        if (analysis.baseModel) setOverrideBaseModel(analysis.baseModel);
        if (analysis.vaeModel) setOverrideVaeModel(analysis.vaeModel);
        if (analysis.samplerName) setOverrideSampler(analysis.samplerName);
        if (analysis.scheduler) setOverrideScheduler(analysis.scheduler);
        if (analysis.steps) setOverrideSteps(analysis.steps);
        if (analysis.cfgScale) setOverrideCfgScale(analysis.cfgScale);
        if (analysis.width) setOverrideWidth(analysis.width);
        if (analysis.height) setOverrideHeight(analysis.height);
        setOverrideLoras(analysis.loras);
      }
    }
  };

  // Find the active job for this project
  const activeJob = useMemo(() => {
    if (!project) return null;
    return jobs.find(j => j.projectId === project.id && (j.status === 'pending' || j.status === 'generating'));
  }, [jobs, project]);
  
  // Find completed jobs for this project to show history
  const completedJobs = useMemo(() => {
    if (!project) return [];
    return jobs.filter(j => j.projectId === project.id && j.status === 'completed' && j.images && j.images.length > 0);
  }, [jobs, project]);

  const isGenerating = !!activeJob;
  const progress = activeJob && activeJob.status === 'generating' ? { value: activeJob.progress, max: 100, node: activeJob.node } : null;
  const error = activeJob?.error || jobs.find(j => j.projectId === project?.id && j.status === 'failed')?.error;
  
  // Combine all images from completed jobs for this session
  const results = completedJobs.flatMap(j => j.images || []);

  useEffect(() => {
    connect();
  }, [connect]);

  const handleGenerate = async () => {
    if (!project) return;
    
    // Construct style triggers combined for artistPrompt
    const artistPrompt = selectedStyles.map(s => s.trigger).join(', ');

    const mergedProject = {
      ...project,
      positivePrompt,
      negativePrompt,
      artistPrompt,
      baseModel: overrideBaseModel,
      vaeModel: overrideVaeModel,
      loraConfigs: overrideLoras,
      width: overrideWidth,
      height: overrideHeight,
      resolution: hasSizePicker ? overrideResolution : undefined,
      steps: overrideSteps,
      cfgScale: overrideCfgScale,
      seed: overrideSeed,
      sampler: overrideSampler,
      scheduler: overrideScheduler,
      workflowId: selectedWorkflowId || undefined,
    };
    
    // Auto-save generation choices back to the project database
    try {
      console.log("[Generate] auto-saving positivePrompt:", positivePrompt?.substring(0, 50), "negativePrompt:", negativePrompt?.substring(0, 50));
      await updatePrompt(project.id, mergedProject);
      console.log("[Generate] auto-save complete");
    } catch(e) {
      console.warn("Failed to auto-save prompt configurations:", e);
    }

    await addJob(mergedProject, selectedWorkflowId || undefined);
  };

  if (!project) {
    return <div className="p-10 text-[var(--text-muted)] text-center">请先选择或创建一个提示词项目</div>;
  }

  return (
    <div className="flex flex-col relative z-10 gap-6 max-w-7xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 bg-[var(--bg-layer-1)] p-4 rounded-2xl border border-[var(--glass-border)] backdrop-blur-md sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={() => navigate('/prompts')}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
              <span className="text-blue-400 flex items-center justify-center"><Zap size={20} className="md:w-6 md:h-6" /></span> 渲染控制台
            </h2>
            <p className="text-[11px] md:text-[12px] text-[var(--text-muted)] truncate whitespace-nowrap overflow-hidden text-ellipsis">当前项目: {project.title}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto justify-end">
          {!isConnected && (
            <button 
              onClick={connect}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors border border-red-500/30"
            >
              <RefreshCw size={14} /> 重新连接引擎
            </button>
          )}
          
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !isConnected}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-[14px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] transition-all ${(isGenerating || !isConnected) ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-[1.02] cursor-pointer text-[var(--text-primary)]'}`}
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
            {isGenerating ? '排队/渲染中...' : (!isConnected ? '未连接引擎' : '开始渲染')}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 pb-10">
        
        {/* Left Column - Main Preview & Editor */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 pr-1">
          
          {/* Prompts Tag Editors */}
          <div className="flex flex-col gap-4">
            <PromptTagEditor
              label="正向提示词"
              value={positivePrompt}
              onChange={setPositivePrompt}
              type="positive"
            />
            <PromptTagEditor
              label="负向提示词"
              value={negativePrompt}
              onChange={setNegativePrompt}
              type="negative"
            />
            
            <StyleSelector
              selectedStyles={selectedStyles}
              onChange={setSelectedStyles}
            />
          </div>

          <div className="flex-1 flex flex-col gap-4 min-h-[400px] glass-panel rounded-2xl overflow-hidden relative border border-[var(--glass-border)]">
            {error && (
              <div className="absolute top-4 left-4 right-4 z-50 bg-red-500/80 backdrop-blur-md text-[var(--text-primary)] px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-between shadow-2xl">
                <span>⚠️ {error}</span>
              </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--glass-bg)] relative">
            
            {results.length > 0 && !isGenerating ? (
              <div className="relative w-full h-full flex items-center justify-center group">
                <img src={results[0].startsWith('http') ? results[0] : convertFileSrc(results[0])} alt="Generated" className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} />
                
                <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-2xl px-4 absolute bottom-6 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => downloadImage(results[0], `generated_${Date.now()}.png`)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-2)]/80 backdrop-blur-md text-[var(--text-primary)] text-[13px] font-bold hover:bg-[var(--accent-2)] transition-colors shadow-lg border border-blue-400/50 cursor-pointer">
                    <Download size={16} /> 下载原图
                  </button>
                </div>
              </div>
            ) : isGenerating ? (
              <div className="w-full max-w-lg space-y-6 flex flex-col items-center">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 border-4 border-[var(--accent-2)]/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[var(--accent-2)] rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-mono font-bold text-blue-400">
                      {progress ? Math.round((progress.value / progress.max) * 100) : 0}%
                    </span>
                  </div>
                </div>
                
                <div className="w-full space-y-2 text-center">
                  <p className="text-[14px] font-bold text-[var(--text-primary)] animate-pulse">正在与 ComfyUI 进行量子纠缠...</p>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono tracking-widest uppercase">
                    {progress ? `Processing Node: ${progress.node}` : 'Initializing workflow...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-[var(--text-muted)] flex flex-col items-center">
                <ImageIcon size={64} className="mb-6 opacity-50" />
                <p className="text-[14px] font-bold uppercase tracking-widest text-[var(--text-muted)]">点击右上角开始渲染</p>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Right Column - Project Params Summary */}
        <div className="w-full md:w-[320px] flex-shrink-0 flex flex-col gap-4">
          <div className="glass-panel p-5 rounded-2xl flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-3">
              <h3 className="text-[13px] font-bold text-[var(--text-primary)]">项目参数概览</h3>
              <button 
                onClick={handleResetToWorkflowDefaults}
                className="flex items-center gap-1.5 px-2 py-1 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-md text-[10px] text-[var(--text-primary)] transition-colors"
                title="重新从当前工作流加载默认参数"
              >
                <Layers size={10} className="text-yellow-400" /> 同步工作流参数
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Cpu size={12} className="text-[var(--accent-2)]" /> 基础模型
                </label>
                <div className="relative z-50">
                  <SearchableDropdown 
                    value={overrideBaseModel}
                    onChange={v => setOverrideBaseModel(v)}
                    options={[
                      { label: "使用项目配置模型", value: "" },
                      ...checkpoints.map(c => ({ label: c, value: c }))
                    ]}
                    accentColor="purple"
                    placeholder="选择基础模型..."
                    searchPlaceholder="搜索模型文件..."
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Layers size={12} className="text-blue-400" /> 工作流
                </label>
                <div className="relative z-40">
                  <GlassDropdown 
                    value={selectedWorkflowId}
                    onChange={v => {
                      setSelectedWorkflowId(v);
                      if (project) {
                        usePromptStore.getState().updatePrompt(project.id, { workflowId: v || undefined });
                      }
                    }}
                    options={[
                      { label: "默认工作流 (Default)", value: "" },
                      ...workflows.map(w => ({ label: w.name, value: w.id }))
                    ]}
                    accentColor="blue"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Cpu size={12} className="text-purple-400" /> VAE 模型
                </label>
                <div className="relative z-30">
                  <GlassDropdown 
                    value={overrideVaeModel}
                    onChange={v => setOverrideVaeModel(v)}
                    options={[
                      { label: "Automatic (自动)", value: "auto" },
                      { label: "sdxl_vae.safetensors", value: "sdxl_vae.safetensors" },
                      { label: "sd_xl_base_1.0_vae.safetensors", value: "sd_xl_base_1.0_vae.safetensors" }
                    ]}
                    accentColor="purple"
                  />
                </div>
              </div>

              {/* Dynamic Resolution Block */}
              {hasSizePicker ? (
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 block">SDXL 尺寸规格</label>
                  <div className="relative z-20">
                    <GlassDropdown
                      value={overrideResolution}
                      onChange={setOverrideResolution}
                      options={SDXL_RESOLUTIONS}
                      accentColor="blue"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)]">
                  <label className="text-[9px] text-[var(--text-muted)] uppercase font-bold block mb-1">自定义分辨率</label>
                  <div className="flex items-center gap-1 justify-center">
                    <input type="number" value={overrideWidth} onChange={e => setOverrideWidth(Number(e.target.value))} className="w-16 bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span className="text-[12px] text-[var(--text-muted)] font-mono">x</span>
                    <input type="number" value={overrideHeight} onChange={e => setOverrideHeight(Number(e.target.value))} className="w-16 bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)]">
                  <label className="text-[9px] text-[var(--text-muted)] uppercase font-bold block mb-1">Steps</label>
                  <input type="number" value={overrideSteps} onChange={e => setOverrideSteps(Number(e.target.value))} className="w-full bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)]">
                  <label className="text-[9px] text-[var(--text-muted)] uppercase font-bold block mb-1">CFG</label>
                  <input type="number" step="0.1" value={overrideCfgScale} onChange={e => setOverrideCfgScale(Number(e.target.value))} className="w-full bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)] relative group col-span-2">
                  <label className="text-[9px] text-[var(--text-muted)] uppercase font-bold block mb-1">Seed (-1 随机)</label>
                  <div className="flex items-center">
                    <input type="text" value={overrideSeed} onChange={e => setOverrideSeed(e.target.value)} className="w-full bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors" />
                    <button onClick={() => setOverrideSeed("-1")} className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[var(--accent-1)] hover:text-white cursor-pointer px-1 rounded bg-[var(--glass-bg)] border border-[var(--accent-1)]/30">
                      随机
                    </button>
                  </div>
                </div>
              </div>

              {/* Sampler & Scheduler Overrides */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-[var(--text-muted)] uppercase font-bold block mb-1">采样器 (Sampler)</label>
                  <GlassDropdown 
                    value={overrideSampler}
                    onChange={setOverrideSampler}
                    options={[
                      { label: "euler", value: "euler" },
                      { label: "euler_ancestral", value: "euler_ancestral" },
                      { label: "heun", value: "heun" },
                      { label: "dpmpp_2m", value: "dpmpp_2m" },
                      { label: "dpmpp_sde", value: "dpmpp_sde" },
                      { label: "uni_pc", value: "uni_pc" }
                    ]}
                    accentColor="blue"
                    small
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[var(--text-muted)] uppercase font-bold block mb-1">调度器 (Scheduler)</label>
                  <GlassDropdown 
                    value={overrideScheduler}
                    onChange={setOverrideScheduler}
                    options={[
                      { label: "beta57", value: "beta57" },
                      { label: "beta", value: "beta" },
                      { label: "normal", value: "normal" },
                      { label: "karras", value: "karras" },
                      { label: "exponential", value: "exponential" },
                      { label: "sgm_uniform", value: "sgm_uniform" },
                      { label: "simple", value: "simple" }
                    ]}
                    accentColor="blue"
                    small
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Layers size={12} className="text-orange-400" /> 挂载的 LoRA
                  </label>
                </div>
                
                <div className="space-y-2">
                  {overrideLoras.map((lora, i) => (
                    <div key={i} className={`p-2 rounded-lg border transition-colors ${lora.enabled ? 'bg-[var(--glass-bg)] border-[var(--glass-border)]' : 'bg-[var(--bg-layer-1)] border-[var(--glass-border)] opacity-60'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input 
                            type="checkbox" 
                            checked={lora.enabled}
                            onChange={(e) => {
                              const newLoras = [...overrideLoras];
                              newLoras[i].enabled = e.target.checked;
                              setOverrideLoras(newLoras);
                            }}
                            className="w-3 h-3 rounded border-[var(--glass-border-active)] accent-orange-500 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-[var(--text-primary)] truncate">{lora.name}</span>
                        </div>
                        <button 
                          onClick={() => {
                            const newLoras = [...overrideLoras];
                            newLoras.splice(i, 1);
                            setOverrideLoras(newLoras);
                          }}
                          className="text-red-400/50 hover:text-red-400 cursor-pointer transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <input 
                          type="range" 
                          min="0" max="2" step="0.05" 
                          value={lora.strength} 
                          onChange={(e) => {
                            const newLoras = [...overrideLoras];
                            newLoras[i].strength = parseFloat(e.target.value);
                            setOverrideLoras(newLoras);
                          }}
                          className="flex-1 h-1 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer accent-orange-400" 
                        />
                        <span className="text-[10px] font-mono font-bold text-orange-400 w-6 text-right">
                          {lora.strength.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {overrideLoras.length === 0 && (
                    <div className="text-[11px] text-[var(--text-muted)] text-center py-3 border border-dashed border-[var(--glass-border)] rounded-lg">
                      暂未添加 LoRA
                    </div>
                  )}
                </div>

                <div className="mt-3 relative z-30">
                  <SearchableDropdown
                    value=""
                    placeholder="➕ 搜索并添加 LoRA..."
                    searchPlaceholder="输入 LoRA 名称进行搜索..."
                    options={loras.map(l => ({ label: l, value: l }))}
                    onChange={(val) => {
                      if (val) {
                        setOverrideLoras([...overrideLoras, { name: val, strength: 0.8, enabled: true }]);
                      }
                    }}
                    accentColor="orange"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
      
      {/* Session History Strip */}
      {results.length > 1 && (
        <div className="flex-shrink-0 glass-panel p-3 rounded-2xl border border-[var(--glass-border)] flex gap-3 overflow-x-auto no-scrollbar">
          {results.slice(1).map((res, i) => (
            <div key={i} className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 border border-[var(--glass-border)] hover:border-blue-400/50 cursor-pointer transition-colors relative group">
              <img src={res.startsWith('http') ? res : convertFileSrc(res)} alt={`History ${i}`} className={`w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
