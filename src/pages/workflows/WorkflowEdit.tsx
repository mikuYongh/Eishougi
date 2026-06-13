import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../stores/settingsStore";
import { ArrowLeft, Save, UploadCloud, FileJson, Layers, Sliders, Cpu, Plus, Trash2, Maximize2 } from "lucide-react";
import { useWorkflowStore, type WorkflowProject, type WorkflowType } from "../../stores/workflowStore";
import { useModelStore } from "../../stores/modelStore";
import { convertFileSrc } from "@tauri-apps/api/core";

const getImgSrc = (url?: string) => !url ? '' : (url.startsWith('http') || url.startsWith('data:') ? url : convertFileSrc(url));


import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { LoraPickerModal } from "../../components/ui/LoraPickerModal";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { comfyService } from "../../services/comfyService";

const SDXL_RESOLUTIONS = [
  { label: "1024x1024 (1:1 方幅)", value: "1024x1024" },
  { label: "896x1088 (4:5 纵幅)", value: "896x1088" },
  { label: "1088x896 (5:4 横幅)", value: "1088x896" },
  { label: "832x1216 (2:3 动漫肖像)", value: "832x1216" },
  { label: "1216x832 (3:2 动漫风景)", value: "1216x832" },
  { label: "768x1344 (9:16 竖版高清)", value: "768x1344" },
  { label: "1344x768 (16:9 横版宽屏)", value: "1344x768" },
];

export function WorkflowEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workflows = useWorkflowStore((state) => state.workflows);
  const updateWorkflow = useWorkflowStore((state) => state.updateWorkflow);
  const addWorkflow = useWorkflowStore((state) => state.addWorkflow);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  
  const { checkpoints, loras, fetchModels } = useModelStore();

  const [workflow, setWorkflow] = useState<Partial<WorkflowProject>>({
    name: "", description: "", type: "text2img", jsonContent: "", tags: []
  });

  const [draftParams, setDraftParams] = useState<any>({
    baseModel: null,
    width: null,
    height: null,
    steps: null,
    cfgScale: null,
    loraConfigs: []
  });

  const [isLoraPickerOpen, setIsLoraPickerOpen] = useState(false);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (id && id !== 'new') {
      const w = workflows.find(w => w.id === id);
      if (w) {
        setWorkflow(w);
        if (w.jsonContent) {
          parseAndSetParams(w.jsonContent);
        }
      }
    }
  }, [id, workflows]);

  const parseAndSetParams = (jsonStr: string) => {
    const parsed = comfyService.analyzeWorkflow(jsonStr);
    setDraftParams({
      baseModel: parsed.baseModel,
      width: parsed.width,
      height: parsed.height,
      steps: parsed.steps,
      cfgScale: parsed.cfgScale,
      loraConfigs: parsed.loras.map((l, i) => ({
        id: `lora_${Date.now()}_${i}`,
        name: l.name,
        strength: l.strength,
        enabled: l.enabled
      }))
    });
  };

  const handleImportJson = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false
      });
      if (filePath && typeof filePath === 'string') {
        const content: string = await invoke('read_text_file', { path: filePath });
        updateField('jsonContent', content);
        parseAndSetParams(content);
      }
    } catch (e) {
      console.error("Failed to import JSON", e);
    }
  };

  const handleSave = async () => {
    let finalJson = workflow.jsonContent;
    if (finalJson) {
      try {
        finalJson = await comfyService.injectParameters(finalJson, draftParams);
        if (typeof finalJson === 'object') {
          finalJson = JSON.stringify(finalJson, null, 2);
        }
      } catch (e) {
        console.error("Failed to inject parameters before saving", e);
      }
    }

    const payload = {
      ...workflow,
      jsonContent: finalJson || "",
      updatedAt: Date.now(),
    };

    if (id && id !== 'new') {
      await updateWorkflow(id, payload as WorkflowProject);
    } else {
      await addWorkflow({
        ...payload as WorkflowProject,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      });
    }
    navigate('/workflows');
  };

  const updateField = (key: keyof WorkflowProject, value: any) => {
    setWorkflow(prev => ({ ...prev, [key]: value }));
  };

  const updateDraft = (key: string, value: any) => {
    setDraftParams((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateResolution = (val: string) => {
    const parts = val.split('x');
    if (parts.length === 2) {
      updateDraft('width', parseInt(parts[0]));
      updateDraft('height', parseInt(parts[1]));
    }
  };

  const currentResStr = (draftParams.width && draftParams.height) ? `${draftParams.width}x${draftParams.height}` : "";

  const typeOptions = [
    { label: "基础文生图 (Text2Img)", value: "text2img" },
    { label: "图生视频 (Img2Video)", value: "img2video" },
    { label: "反推工具 (Tagger)", value: "tagger" },
    { label: "放大/修复 (Upscale)", value: "upscale" },
    { label: "自定义 (Custom)", value: "custom" }
  ];

  const modelOptions = useMemo(() => {
    return checkpoints.map(m => ({ label: m, value: m }));
  }, [checkpoints]);

  const loraOptions = useMemo(() => {
    return loras.map(m => ({ label: m, value: m }));
  }, [loras]);

  return (
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 bg-[var(--bg-layer-1)] p-4 rounded-2xl border border-[var(--glass-border)] backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/workflows')}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] drop-shadow-md">
              {id === 'new' ? '新建工作流配置' : '编辑工作流配置'}
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">{workflow.name || "未命名工作流"}</p>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(255,213,79,0.3)] hover:scale-[1.02] transition-all text-black cursor-pointer"
          style={{ background: "linear-gradient(135deg, #FFCA28, #FF9800)", border: "1px solid rgba(255,255,255,0.4)" }}
        >
          <Save size={16} /> 保存配置
        </button>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 overflow-y-auto pb-10">
        
        {/* Left Column - Metadata */}
        <div className="w-[380px] flex-shrink-0 flex flex-col gap-5">
          <div className="glass-panel p-5 space-y-5">
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">工作流名称</label>
              <input 
                type="text" value={workflow.name} onChange={e => updateField('name', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] text-sm outline-none focus:border-yellow-500/50 transition-colors font-bold"
                placeholder="例如：基础文生图"
              />
            </div>
            
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">用途描述</label>
              <textarea 
                value={workflow.description} onChange={e => updateField('description', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-muted)] text-xs outline-none focus:border-yellow-500/50 transition-colors h-24 resize-none"
                placeholder="工作流的具体用途和使用场景..."
              />
            </div>

            <div className="relative z-50">
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">工作流类型</label>
              <GlassDropdown 
                value={workflow.type || "text2img"}
                onChange={v => updateField('type', v as WorkflowType)}
                options={typeOptions}
                accentColor="yellow"
              />
            </div>
          </div>

          {/* Thumbnail Uploader */}
          <div className="glass-panel p-5">
            <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">缩略图</label>
            <div className="h-40 w-full rounded-xl border-2 border-dashed border-[var(--glass-border)] hover:border-yellow-400/50 bg-[var(--glass-bg-hover)] flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer transition-colors">
              {workflow.thumbnail ? (
                <div className="absolute inset-0 z-0 group-hover/cover:bg-[var(--bg-layer-2)] transition-colors flex items-center justify-center cursor-pointer">
                  <img src={getImgSrc(workflow.thumbnail)} alt="Thumbnail" className={`w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <UploadCloud size={16} className="text-[var(--text-muted)] group-hover:text-yellow-400 transition-colors" />
                  </div>
                  <span className="text-[11px] font-bold text-[var(--text-muted)]">上传缩略图 (可选)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Parameters / Editor */}
        <div className="flex-1 flex flex-col min-w-0 glass-panel overflow-hidden bg-[var(--bg-layer-1)]">
          <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
            <h3 className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Sliders size={18} className="text-yellow-400" /> 默认参数配置
            </h3>
            <button 
              onClick={handleImportJson}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-[12px] font-bold transition-colors cursor-pointer border border-yellow-500/20"
            >
              <FileJson size={14} /> 重新导入 JSON
            </button>
          </div>

          {!workflow.jsonContent ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border-2 border-dashed border-white/10">
                <FileJson size={32} className="text-[var(--text-muted)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">尚未导入工作流</h3>
              <p className="text-sm text-[var(--text-muted)] max-w-md">
                请先导入 ComfyUI API 格式的 JSON 文件。导入后，系统将自动解析模型、分辨率等参数，供您设置默认值。
              </p>
              <button 
                onClick={handleImportJson}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-bold text-[var(--text-primary)] transition-colors cursor-pointer shadow-lg"
              >
                选择 JSON 文件
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Models */}
              <div className="space-y-4">
                <h4 className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--glass-border)] pb-2">
                  <Cpu size={14} /> 模型设定
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative z-[60]">
                    <label className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5 block">基础模型 (Base Model)</label>
                    <SearchableDropdown 
                      value={draftParams.baseModel || ""}
                      onChange={v => updateDraft('baseModel', v)}
                      options={modelOptions}
                      placeholder="默认模型..."
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5 block">采样步数 (Steps)</label>
                    <input 
                      type="number" value={draftParams.steps || ""} onChange={e => updateDraft('steps', parseInt(e.target.value) || undefined)}
                      className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Resolution */}
              <div className="space-y-4">
                <h4 className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--glass-border)] pb-2">
                  <Maximize2 size={14} /> 分辨率与尺寸
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative z-[50]">
                    <label className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5 block">预设分辨率</label>
                    <GlassDropdown 
                      value={SDXL_RESOLUTIONS.some(r => r.value.startsWith(currentResStr)) ? SDXL_RESOLUTIONS.find(r => r.value.startsWith(currentResStr))?.value || "" : ""}
                      onChange={v => updateResolution(v)}
                      options={SDXL_RESOLUTIONS}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5 block">宽 (Width)</label>
                      <input 
                        type="number" value={draftParams.width || ""} onChange={e => updateDraft('width', parseInt(e.target.value) || undefined)}
                        className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm outline-none text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5 block">高 (Height)</label>
                      <input 
                        type="number" value={draftParams.height || ""} onChange={e => updateDraft('height', parseInt(e.target.value) || undefined)}
                        className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm outline-none text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* LoRAs */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-[var(--glass-border)] pb-2">
                  <h4 className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                    <Layers size={14} /> 内置 LoRA
                  </h4>
                  <button 
                    onClick={() => setIsLoraPickerOpen(true)}
                    className="flex items-center gap-1 text-[11px] text-[var(--accent-1)] hover:text-yellow-300 font-bold px-2 py-1 bg-white/5 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus size={12} /> 添加 LoRA
                  </button>
                </div>
                
                <div className="space-y-3">
                  {draftParams.loraConfigs.length === 0 ? (
                    <div className="text-center py-6 text-[12px] text-[var(--text-muted)] bg-white/5 rounded-xl border border-white/5">
                      此工作流尚未配置默认 LoRA
                    </div>
                  ) : (
                    draftParams.loraConfigs.map((lora: any, i: number) => (
                      <div 
                        key={lora.id} 
                        className={`flex flex-col gap-3 p-4 rounded-xl border relative shadow-[0_4px_20px_rgba(0,0,0,0.1)] transition-colors group ${lora.enabled !== false ? 'bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-yellow-500/30' : 'bg-black/20 border-white/5 opacity-60 grayscale'}`}
                        style={{ zIndex: 100 - i }}
                      >
                        <div className="flex items-center justify-between">
                          <h5 className={`text-[12px] font-bold flex items-center gap-2 ${lora.enabled !== false ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                            <div className={`w-2 h-2 rounded-full ${lora.enabled !== false ? (lora.name ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 'bg-gray-500') : 'bg-gray-600'}`}></div> 
                            LoRA 节点 {i + 1}
                            {lora.enabled === false && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 ml-2">已禁用</span>}
                          </h5>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => {
                                const newList = [...draftParams.loraConfigs];
                                newList[i].enabled = lora.enabled === false ? true : false;
                                updateDraft('loraConfigs', newList);
                              }}
                              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${lora.enabled !== false ? 'text-green-400 hover:bg-green-400/10' : 'text-[var(--text-muted)] hover:bg-white/10'}`}
                              title={lora.enabled !== false ? "点击禁用" : "点击启用"}
                            >
                              <div className={`w-3.5 h-3.5 rounded-sm border ${lora.enabled !== false ? 'border-green-400 bg-green-400/20' : 'border-[var(--text-muted)]'}`}></div>
                            </button>
                            <button 
                              onClick={() => {
                                const newList = [...draftParams.loraConfigs];
                                newList.splice(i, 1);
                                updateDraft('loraConfigs', newList);
                              }}
                              className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                              title="移除此节点"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-4 items-start relative" style={{ zIndex: 50 }}>
                          <div className="flex-1 min-w-0 relative">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] mb-1.5 block uppercase tracking-wider">选择模型 (Model)</label>
                            <SearchableDropdown 
                              value={lora.name}
                              onChange={v => {
                                const newList = [...draftParams.loraConfigs];
                                newList[i].name = v;
                                updateDraft('loraConfigs', newList);
                              }}
                              options={loraOptions}
                              placeholder="搜索或选择 LoRA..."
                            />
                          </div>
                          <div className="w-24 flex-shrink-0">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] mb-1.5 block uppercase tracking-wider text-center">权重</label>
                            <div className="flex items-center bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl overflow-hidden">
                              <input 
                                type="number" step="0.05" value={lora.strength} 
                                onChange={e => {
                                  const newList = [...draftParams.loraConfigs];
                                  newList[i].strength = parseFloat(e.target.value) || 0;
                                  updateDraft('loraConfigs', newList);
                                }}
                                className="w-full bg-transparent py-2.5 text-[13px] text-[var(--text-primary)] font-mono text-center outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider w-8">微调</span>
                          <input 
                            type="range" min="-2" max="2" step="0.05" value={lora.strength}
                            onChange={e => {
                              const newList = [...draftParams.loraConfigs];
                              newList[i].strength = parseFloat(e.target.value) || 0;
                              updateDraft('loraConfigs', newList);
                            }}
                            className="flex-1 h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-yellow-400"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <LoraPickerModal 
        isOpen={isLoraPickerOpen}
        onClose={() => setIsLoraPickerOpen(false)}
        onSelect={(loraName) => {
          updateDraft('loraConfigs', [
            ...draftParams.loraConfigs, 
            { id: Date.now().toString(), name: loraName, strength: 1.0, enabled: true }
          ]);
        }}
      />
    </div>
  );
}
