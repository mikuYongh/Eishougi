import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Image as ImageIcon, Loader2, ArrowLeft, Download, Maximize2, RefreshCw, Cpu, Layers, Plus, Trash2, Sliders, Zap, BookmarkPlus, Tags } from "lucide-react";
import { PhotoView } from 'react-photo-view';
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { usePromptStore, type LoraConfig } from "../../stores/promptStore";
import { useQueueStore, type QueueJob } from "../../stores/queueStore";
import { downloadImage } from "../../utils/download";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { LoraSelectorUI } from "../../components/prompt/LoraSelectorUI";
import { PromptTagEditor } from "../../components/prompt/PromptTagEditor";
import { ArtistSelector } from "../../components/prompt/ArtistSelector";
import { comfyService } from "../../services/comfyService";
import { aiService } from "../../services/aiService";
import { SAMPLER_OPTIONS, SCHEDULER_OPTIONS } from "../../lib/workflowOptions";
import { getImgSrc } from "../../utils/imageUtils";
import { toast } from "sonner";



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

  // Remember the last prompt ID the user opened/generated from.
  // When navigating to /generate without a specific prompt, use the last one.
  const LAST_PROMPT_KEY = 'last_generate_prompt_id';
  useEffect(() => {
    if (promptId) {
      localStorage.setItem(LAST_PROMPT_KEY, promptId);
    }
  }, [promptId]);

  const defaultProject = useMemo(() => {
    if (promptId) {
      return prompts.find(p => p.id === promptId);
    }
    // No promptId in URL — try last-used, then most recent, then first
    const lastId = localStorage.getItem(LAST_PROMPT_KEY);
    if (lastId) {
      const last = prompts.find(p => p.id === lastId);
      if (last) return last;
    }
    return prompts[0];
  }, [promptId, prompts]);

  const project = defaultProject;

  const { jobs, isConnected, connect, addJob } = useQueueStore();
  const workflows = useWorkflowStore(state => state.workflows);
  const { checkpoints, loras, vaes, isLoading, isError, fetchModels } = useModelStore();
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

  // Prompts
  const [positivePrompt, setPositivePrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [artistPrompt, setArtistPrompt] = useState<string>("");

  // Workflow structure flag
  const [hasSizePicker, setHasSizePicker] = useState<boolean>(false);

  // Currently selected image from the session strip (drives main preview + 设为示范图 target).
  // Empty string = no manual selection → falls back to results[0].
  const [selectedImage, setSelectedImage] = useState<string>("");

  // Single-project AI tagging state
  const [isTagging, setIsTagging] = useState<boolean>(false);

  const handleAutoTagSingle = async () => {
    if (!project || isTagging) return;
    const textToAnalyze = [project.title, positivePrompt].filter(Boolean).join("\n").trim();
    if (!textToAnalyze) {
      toast.error("项目没有可分析的创作文本");
      return;
    }
    setIsTagging(true);
    try {
      const newTags = await aiService.generateTags(textToAnalyze);
      if (newTags.length > 0) {
        await updatePrompt(project.id, { tags: newTags });
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

  useEffect(() => {
    if (project) {
      const defaultWf = workflows.find(w => w.type === 'text2img' && w.isDefault);
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
      setArtistPrompt(project.artistPrompt || "");
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
        if (project && project.baseModel) {
          setOverrideBaseModel(project.baseModel);
        } else if (analysis.baseModel) {
          setOverrideBaseModel(analysis.baseModel);
        } else {
          setOverrideBaseModel("");
        }

        if (project && project.vaeModel) {
          setOverrideVaeModel(project.vaeModel);
        } else if (analysis.vaeModel) {
          setOverrideVaeModel(analysis.vaeModel);
        } else {
          setOverrideVaeModel("auto");
        }

        if (project && project.sampler) {
          setOverrideSampler(project.sampler);
        } else if (analysis.samplerName) {
          setOverrideSampler(analysis.samplerName);
        }

        if (project && project.scheduler) {
          setOverrideScheduler(project.scheduler);
        } else if (analysis.scheduler) {
          setOverrideScheduler(analysis.scheduler);
        }

        if (project && project.loraConfigs && project.loraConfigs.length > 0) {
          setOverrideLoras(JSON.parse(JSON.stringify(project.loraConfigs)));
        } else {
          setOverrideLoras(analysis.loras);
        }
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
  
  // Combine all images from completed jobs for this session (newest first)
  const results = useMemo(() => completedJobs.flatMap(j => j.images || []).reverse(), [completedJobs]);

  // Reset the manual selection whenever a new batch arrives.
  useEffect(() => { setSelectedImage(""); }, [results]);

  // The image shown in the main preview + target of 设为示范图:
  // honor an explicit click on the strip, otherwise the newest result.
  const currentImage = selectedImage || results[0] || "";

  const handleSetAsExample = async (imageUrl: string) => {
    if (!project) return;
    const existing = project.instanceImages || [];
    // Prepend (newest first) so instanceImages[0] is always the most recently chosen demo
    // image — this is what shows up as the project cover across the app.
    let updatedImages: string[];
    if (existing.includes(imageUrl)) {
      updatedImages = [imageUrl, ...existing.filter(u => u !== imageUrl)];
    } else {
      updatedImages = [imageUrl, ...existing];
    }
    await usePromptStore.getState().updatePrompt(project.id, {
      instanceImages: updatedImages,
    });
    toast.success('已设置为项目示范图！');
  };

  useEffect(() => {
    connect();
  }, [connect]);

  const handleGenerate = async () => {
    if (!project) return;
    
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
    } catch (e) {
      console.warn("Could not request notification permission", e);
    }

    // Determine final parameters

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
      await updatePrompt(project.id, mergedProject);
      } catch(e) {
      console.warn("Failed to auto-save prompt configurations:", e);
    }

    await addJob(mergedProject, selectedWorkflowId || undefined);
  };

  if (!project) {
    return <div className="p-10 text-[var(--text-secondary)] text-center">请先选择或创建一个创作项目</div>;
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
              <span className="text-[var(--accent-1)] flex items-center justify-center"><Zap size={20} className="md:w-6 md:h-6" /></span> 渲染控制台
            </h2>
            <p className="text-[11px] md:text-[12px] text-[var(--text-secondary)] truncate whitespace-nowrap overflow-hidden text-ellipsis">当前项目: {project.title}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto justify-end">
          {/* Removed Reconnect Engine button since Rust handles it on demand */}

          <button
            onClick={handleAutoTagSingle}
            disabled={isTagging}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title="用 AI 分析当前创作并生成分类标签"
          >
            {isTagging ? <Loader2 size={16} className="animate-spin" /> : <Tags size={16} />}
            {isTagging ? '打标中...' : 'AI 打标'}
          </button>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-[14px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] transition-all ${isGenerating ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-[1.02] cursor-pointer text-[var(--text-primary)]'}`}
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
            {isGenerating ? '排队/渲染中...' : '开始渲染'}
          </button>
        </div>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 pb-10">
        
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
            <ArtistSelector
              selectedTriggers={artistPrompt}
              onChange={(val) => setArtistPrompt(val)}
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
                <PhotoView src={getImgSrc(currentImage)}>
                  <img src={getImgSrc(currentImage)} alt="Generated" className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-zoom-in transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} />
                </PhotoView>

                <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-2xl px-4 absolute bottom-6 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => downloadImage(currentImage, `generated_${Date.now()}.png`)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-2)]/80 backdrop-blur-md text-[var(--text-primary)] text-[13px] font-bold hover:bg-[var(--accent-2)] transition-colors shadow-lg border border-[var(--accent-1)]/50 cursor-pointer">
                      <Download size={16} /> 下载原图
                    </button>
                    <button onClick={() => handleSetAsExample(currentImage)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-1)]/80 backdrop-blur-md text-white text-[13px] font-bold hover:bg-[var(--accent-1)] transition-colors shadow-lg border border-[var(--accent-2)]/50 cursor-pointer">
                      <BookmarkPlus size={16} /> 设为示范图
                    </button>
                  </div>
              </div>
            ) : isGenerating ? (
              <div className="w-full max-w-lg space-y-6 flex flex-col items-center">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 border-4 border-[var(--accent-2)]/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[var(--accent-2)] rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-mono font-bold text-[var(--accent-1)]">
                      {progress ? Math.round((progress.value / progress.max) * 100) : 0}%
                    </span>
                  </div>
                </div>
                
                <div className="w-full space-y-2 text-center">
                  <p className="text-[14px] font-bold text-[var(--text-primary)] animate-pulse">正在与 ComfyUI 进行量子纠缠...</p>
                  <p className="text-[11px] text-[var(--text-secondary)] font-mono tracking-widest uppercase">
                    {progress ? `Processing Node: ${progress.node}` : 'Initializing workflow...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-[var(--text-secondary)] flex flex-col items-center">
                <ImageIcon size={64} className="mb-6 opacity-50" />
                <p className="text-[14px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">点击右上角开始渲染</p>
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
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => fetchModels(true)}
                  className="flex items-center justify-center w-6 h-6 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-md text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="刷新模型列表"
                >
                  <RefreshCw size={12} className="text-[var(--accent-1)]" />
                </button>
                <button 
                  onClick={handleResetToWorkflowDefaults}
                  className="flex items-center gap-1.5 px-2 py-1 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-md text-[10px] text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="重新从当前工作流加载默认参数"
                >
                  <Layers size={10} className="text-[var(--accent-1)]" /> 同步工作流参数
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
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
                    isLoading={isLoading}
                    isError={isError}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Layers size={12} className="text-[var(--accent-1)]" /> 工作流
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
                      ...workflows.map(w => ({ label: w.name, value: w.id }))
                    ]}
                    accentColor="blue"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Cpu size={12} className="text-[var(--accent-2)]" /> VAE 模型
                </label>
                <div className="relative z-30">
                  <GlassDropdown
                    value={overrideVaeModel}
                    onChange={v => setOverrideVaeModel(v)}
                    options={[
                      { label: "Automatic (自动)", value: "auto" },
                      ...vaes.map(v => ({ label: v, value: v })),
                    ]}
                    accentColor="purple"
                  />
                </div>
              </div>

              {/* Dynamic Resolution Block */}
              {hasSizePicker ? (
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1.5 block">SDXL 尺寸规格</label>
                  <div className="relative z-20">
                    <GlassDropdown
                      value={overrideResolution}
                      onChange={(val) => {
                        setOverrideResolution(val);
                        const m = val.match(/(\d+)\s*[x×]\s*(\d+)/);
                        if (m) {
                          setOverrideWidth(parseInt(m[1]));
                          setOverrideHeight(parseInt(m[2]));
                        }
                      }}
                      options={SDXL_RESOLUTIONS}
                      accentColor="blue"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)]">
                  <label className="text-[9px] text-[var(--text-secondary)] uppercase font-bold block mb-1">自定义分辨率</label>
                  <div className="flex items-center gap-1 justify-center">
                    <input type="number" value={overrideWidth} onChange={e => setOverrideWidth(Number(e.target.value))} className="w-16 bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span className="text-[12px] text-[var(--text-secondary)] font-mono">x</span>
                    <input type="number" value={overrideHeight} onChange={e => setOverrideHeight(Number(e.target.value))} className="w-16 bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)]">
                  <label className="text-[9px] text-[var(--text-secondary)] uppercase font-bold block mb-1">Steps</label>
                  <input type="number" value={overrideSteps} onChange={e => setOverrideSteps(Number(e.target.value))} className="w-full bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)]">
                  <label className="text-[9px] text-[var(--text-secondary)] uppercase font-bold block mb-1">CFG</label>
                  <input type="number" step="0.1" value={overrideCfgScale} onChange={e => setOverrideCfgScale(Number(e.target.value))} className="w-full bg-transparent text-[12px] text-[var(--text-primary)] font-mono font-bold outline-none border-b border-[var(--glass-border)] focus:border-[var(--accent-1)] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div className="bg-[var(--glass-bg-hover)] p-2.5 rounded-lg border border-[var(--glass-border)] relative group col-span-2">
                  <label className="text-[9px] text-[var(--text-secondary)] uppercase font-bold block mb-1">Seed (-1 随机)</label>
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
                  <label className="text-[9px] text-[var(--text-secondary)] uppercase font-bold block mb-1">采样器 (Sampler)</label>
                  <GlassDropdown
                    value={overrideSampler}
                    onChange={setOverrideSampler}
                    options={SAMPLER_OPTIONS}
                    accentColor="blue"
                    small
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[var(--text-secondary)] uppercase font-bold block mb-1">调度器 (Scheduler)</label>
                  <GlassDropdown
                    value={overrideScheduler}
                    onChange={setOverrideScheduler}
                    options={SCHEDULER_OPTIONS}
                    accentColor="blue"
                    small
                  />
                </div>
              </div>

              <LoraSelectorUI 
                selectedLoras={overrideLoras}
                onChange={setOverrideLoras}
                availableLoras={loras}
              />
            </div>
          </div>
        </div>

      </div>
      
      {/* Session History Strip */}
      {results.length > 0 && (
        <div className="flex-shrink-0 glass-panel p-3 rounded-2xl border border-[var(--glass-border)] flex gap-3 overflow-x-auto no-scrollbar">
          {results.map((res, i) => {
            const isActive = res === currentImage;
            return (
            <div
              key={res}
              onClick={() => setSelectedImage(res)}
              className={`w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 border cursor-pointer transition-all relative group ${isActive ? 'border-[var(--accent-1)] ring-2 ring-[var(--accent-1)]/50' : 'border-[var(--glass-border)] hover:border-[var(--accent-1)]/50'}`}
            >
              <PhotoView src={getImgSrc(res)}>
                <img src={getImgSrc(res)} alt={`History ${i}`} className={`w-full h-full object-cover transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'} cursor-zoom-in ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
              </PhotoView>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
