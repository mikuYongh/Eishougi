import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Image as ImageIcon, Loader2, ArrowLeft, Download, Maximize2, RefreshCw, Cpu, Layers, Plus, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { usePromptStore, type LoraConfig } from "../../stores/promptStore";
import { useQueueStore } from "../../stores/queueStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useModelStore } from "../../stores/modelStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";

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
  const project = prompts.find(p => p.id === promptId) || prompts[0];

  const { jobs, isConnected, connect, addJob } = useQueueStore();
  const workflows = useWorkflowStore(state => state.workflows);
  const { checkpoints, loras, fetchModels } = useModelStore();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Local overrides for Generate page
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [overrideBaseModel, setOverrideBaseModel] = useState<string>("");
  const [overrideLoras, setOverrideLoras] = useState<LoraConfig[]>([]);

  useEffect(() => {
    if (project) {
      setOverrideBaseModel(project.baseModel || "sd_xl_base_1.0.safetensors");
    }
  }, [project]);

  // When workflow changes, parse LoRAs from the workflow JSON. If no workflow selected, fallback to project config.
  useEffect(() => {
    if (selectedWorkflowId) {
      const workflow = workflows.find(w => w.id === selectedWorkflowId);
      if (workflow && workflow.jsonContent) {
        const parsedLoras = parseLoraFromWorkflow(workflow.jsonContent);
        setOverrideLoras(parsedLoras);
      } else {
        setOverrideLoras([]);
      }
    } else {
      if (project) {
        setOverrideLoras(JSON.parse(JSON.stringify(project.loraConfigs || [])));
      }
    }
  }, [selectedWorkflowId, workflows, project]);
  
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
    const mergedProject = {
      ...project,
      baseModel: overrideBaseModel,
      loraConfigs: overrideLoras
    };
    await addJob(mergedProject, selectedWorkflowId || undefined);
  };

  if (!project) {
    return <div className="p-10 text-white/50 text-center">请先选择或创建一个提示词项目</div>;
  }

  return (
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-7xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 bg-black/20 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/prompts')}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer border border-white/10"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2">
              <span className="text-blue-400">⚡</span> 渲染控制台
            </h2>
            <p className="text-[12px] text-white/50">当前项目: {project.title}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
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
            className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-[14px] font-bold shadow-[0_4px_15px_rgba(100,181,246,0.3)] transition-all ${(isGenerating || !isConnected) ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-[1.02] cursor-pointer text-white'}`}
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
            {isGenerating ? '排队/渲染中...' : (!isConnected ? '未连接引擎' : '开始渲染')}
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        
        {/* Left Column - Main Preview & Progress */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 glass-panel rounded-2xl overflow-hidden relative border border-white/5">
          {error && (
            <div className="absolute top-4 left-4 right-4 z-50 bg-red-500/80 backdrop-blur-md text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-between shadow-2xl">
              <span>⚠️ {error}</span>
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black/40 relative">
            
            {results.length > 0 && !isGenerating ? (
              <div className="relative w-full h-full flex items-center justify-center group">
                <img src={results[0]} alt="Generated" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                
                <div className="absolute bottom-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md text-white text-[13px] font-bold hover:bg-black/80 transition-colors shadow-lg border border-white/10">
                    <Maximize2 size={16} /> 放大
                  </button>
                  <a href={results[0]} download="generated.png" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/80 backdrop-blur-md text-white text-[13px] font-bold hover:bg-blue-500 transition-colors shadow-lg border border-blue-400/50">
                    <Download size={16} /> 下载原图
                  </a>
                </div>
              </div>
            ) : isGenerating ? (
              <div className="w-full max-w-lg space-y-6 flex flex-col items-center">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-mono font-bold text-blue-400">
                      {progress ? Math.round((progress.value / progress.max) * 100) : 0}%
                    </span>
                  </div>
                </div>
                
                <div className="w-full space-y-2 text-center">
                  <p className="text-[14px] font-bold text-white/90 animate-pulse">正在与 ComfyUI 进行量子纠缠...</p>
                  <p className="text-[11px] text-white/40 font-mono tracking-widest uppercase">
                    {progress ? `Processing Node: ${progress.node}` : 'Initializing workflow...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-white/20 flex flex-col items-center">
                <ImageIcon size={64} className="mb-6 opacity-50" />
                <p className="text-[14px] font-bold uppercase tracking-widest text-white/40">点击右上角开始渲染</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Project Params Summary */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-4">
          <div className="glass-panel p-5 rounded-2xl flex-1 flex flex-col gap-5 overflow-y-auto">
            <h3 className="text-[13px] font-bold text-white/90 border-b border-white/5 pb-3">项目参数概览</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Cpu size={12} className="text-purple-400" /> 基础模型
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
                <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1.5 block flex items-center gap-1.5">
                  <Layers size={12} className="text-blue-400" /> 工作流
                </label>
                <div className="relative z-40">
                  <GlassDropdown 
                    value={selectedWorkflowId}
                    onChange={v => setSelectedWorkflowId(v)}
                    options={[
                      { label: "默认工作流 (Default)", value: "" },
                      ...workflows.map(w => ({ label: w.name, value: w.id }))
                    ]}
                    accentColor="blue"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1.5 block">正向提示词</label>
                <div className="text-[11px] text-white/70 font-mono bg-black/30 p-2 rounded-lg border border-white/5 max-h-32 overflow-y-auto leading-relaxed">
                  {project.positivePrompt}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                  <label className="text-[9px] text-white/40 uppercase font-bold block mb-1">分辨率</label>
                  <span className="text-[12px] text-white/90 font-mono font-bold">{project.width}x{project.height}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                  <label className="text-[9px] text-white/40 uppercase font-bold block mb-1">Steps</label>
                  <span className="text-[12px] text-white/90 font-mono font-bold">{project.steps}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                  <label className="text-[9px] text-white/40 uppercase font-bold block mb-1">CFG</label>
                  <span className="text-[12px] text-white/90 font-mono font-bold">{project.cfgScale}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                  <label className="text-[9px] text-white/40 uppercase font-bold block mb-1">Seed</label>
                  <span className="text-[12px] text-white/90 font-mono font-bold truncate block">{project.seed}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Layers size={12} className="text-orange-400" /> 挂载的 LoRA
                  </label>
                </div>
                
                <div className="space-y-2">
                  {overrideLoras.map((lora, i) => (
                    <div key={i} className={`p-2 rounded-lg border transition-colors ${lora.enabled ? 'bg-black/40 border-white/10' : 'bg-black/20 border-white/5 opacity-60'}`}>
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
                            className="w-3 h-3 rounded border-white/20 accent-orange-500 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-white/80 truncate">{lora.name}</span>
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
                          className="flex-1 h-1 bg-black/40 rounded-lg appearance-none cursor-pointer accent-orange-400" 
                        />
                        <span className="text-[10px] font-mono font-bold text-orange-400 w-6 text-right">
                          {lora.strength.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {overrideLoras.length === 0 && (
                    <div className="text-[11px] text-white/30 text-center py-3 border border-dashed border-white/10 rounded-lg">
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
        <div className="flex-shrink-0 glass-panel p-3 rounded-2xl border border-white/5 flex gap-3 overflow-x-auto no-scrollbar">
          {results.slice(1).map((res, i) => (
            <div key={i} className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 hover:border-blue-400/50 cursor-pointer transition-colors relative group">
              <img src={res} alt={`History ${i}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
