import React, { useState, useRef, useMemo, useEffect } from "react";
import { UploadCloud, Image as ImageIcon, Video, Play, FastForward, Clock, Maximize, Film, Layers, Loader2, Cpu } from "lucide-react";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useModelStore } from "../../stores/modelStore";
import { useQueueStore } from "../../stores/queueStore";
import { comfyService } from "../../services/comfyService";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export function VideoGenerate() {
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [fps, setFps] = useState(16);
  const [duration, setDuration] = useState(2); // in seconds
  const [resolution, setResolution] = useState("512x512");
  const [baseModel, setBaseModel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkpoints = useModelStore(state => state.checkpoints);

  const workflows = useWorkflowStore(state => state.workflows);
  const videoWorkflows = useMemo(() => workflows.filter(w => w.type === 'img2video'), [workflows]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(videoWorkflows.length > 0 ? videoWorkflows[0].id : '');

  const addVideoJob = useQueueStore(state => state.addVideoJob);
  const jobs = useQueueStore(state => state.jobs);
  
  // Find the active video job for this session (just grabbing the latest pending/generating one)
  const activeJob = useMemo(() => {
    return jobs.find(j => j.projectTitle === '图生视频工作区' && (j.status === 'pending' || j.status === 'generating'));
  }, [jobs]);

  const completedJob = useMemo(() => {
    return [...jobs].reverse().find(j => j.projectTitle === '图生视频工作区' && j.status === 'completed');
  }, [jobs]);

  // Set default workflow if none selected
  useEffect(() => {
    if (!selectedWorkflowId && videoWorkflows.length > 0) {
      setSelectedWorkflowId(videoWorkflows[0].id);
    }
  }, [videoWorkflows, selectedWorkflowId]);

  const isGenerating = !!activeJob;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(URL.createObjectURL(file));
    }
  };

  const handleGenerate = async () => {
    if (!image || !selectedWorkflowId) return;
    
    try {
      const tempProject = {
        id: 'video_' + Date.now(),
        title: '图生视频工作区',
        seed: Math.floor(Math.random() * 1000000000)
      };

      const [wStr, hStr] = resolution.split('x');
      const width = parseInt(wStr);
      const height = parseInt(hStr);
      const totalFrames = fps * duration;

      const response = await fetch(image);
      const blob = await response.blob();
      const filename = `upload_${Date.now()}.png`;
      const uploadedFilename = await comfyService.uploadImage(blob, filename);

      await addVideoJob(
        tempProject,
        selectedWorkflowId,
        uploadedFilename,
        fps,
        totalFrames,
        width,
        height,
        prompt,
        baseModel
      );
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-6xl mx-auto w-full">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
            <span className="text-[var(--accent-2)] flex items-center justify-center"><Film size={24} /></span> 图生视频 (Image to Video)
          </h2>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">使用 AnimateDiff 或 SVD 将静态图片转化为丝滑的动态视频</p>
        </div>
        <button 
          onClick={handleGenerate}
          disabled={!image || isGenerating || !selectedWorkflowId}
          className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-[14px] font-bold shadow-[0_4px_15px_rgba(156,39,176,0.3)] transition-all ${(!image || !selectedWorkflowId) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] cursor-pointer text-[var(--text-primary)]'}`}
          style={{ background: image ? "linear-gradient(135deg, #AB47BC, #7E57C2)" : "rgba(255,255,255,0.1)", border: image ? "1px solid rgba(255,255,255,0.2)" : "none" }}
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
          {isGenerating ? '正在渲染序列...' : '开始生成视频'}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
        
        {/* Left Column - Input Image & Params */}
        <div className="w-full md:w-[420px] flex flex-col gap-5 flex-shrink-0 overflow-y-auto pb-4 pr-1 scrollbar-hide">
          
          <div className="glass-panel p-1 rounded-2xl flex flex-col relative overflow-hidden group h-64 border border-[var(--glass-border)] hover:border-[var(--accent-2)]/30 transition-colors flex-shrink-0">
            <div className="absolute inset-0 bg-[var(--bg-layer-1)] z-0"></div>
            {image ? (
              <div className="relative w-full h-full z-10 flex flex-col items-center justify-center p-2 group/img">
                <img src={image} alt="Upload" className={`max-w-full max-h-full object-contain rounded-lg transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} />
                <button 
                  onClick={() => setImage(null)}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] backdrop-blur-md text-[var(--text-primary)] text-xs font-bold flex items-center gap-1 hover:bg-[var(--glass-bg)] transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  更换原图
                </button>
              </div>
            ) : (
              <div 
                className="relative w-full h-full z-10 flex flex-col items-center justify-center border-2 border-dashed border-[var(--glass-border)] hover:border-[var(--accent-2)]/50 m-2 rounded-xl bg-[var(--glass-bg-hover)] cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-full bg-[var(--accent-2)]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <UploadCloud size={32} className="text-[var(--accent-2)]/80" />
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">拖拽图片至此</h3>
                <p className="text-xs text-[var(--text-muted)]">支持 JPG, PNG 作为首帧参考</p>
              </div>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          </div>

          <div className="glass-panel p-5 rounded-2xl space-y-5 flex-shrink-0">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
              <Video size={16} className="text-[var(--accent-2)]" /> 动画参数控制
            </h3>

            <div className="space-y-4">
              <div className="relative z-[60]">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5"><Layers size={12}/> 工作流 (Workflow)</label>
                <GlassDropdown 
                  value={selectedWorkflowId}
                  onChange={v => setSelectedWorkflowId(v || '')}
                  options={videoWorkflows.map(w => ({ label: w.name, value: w.id }))}
                  accentColor="purple"
                />
                {videoWorkflows.length === 0 && (
                  <p className="text-xs text-orange-400 mt-1">未找到视频工作流，请先导入</p>
                )}
              </div>

              <div className="relative z-[50]">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5"><Cpu size={12}/> 基础模型 (Checkpoint)</label>
                <SearchableDropdown 
                  value={baseModel}
                  onChange={v => setBaseModel(v)}
                  options={checkpoints.map(c => ({ label: c, value: c }))}
                  placeholder="未选择，使用工作流默认模型..."
                />
              </div>

              <div className="relative z-[40]">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5">提示词 (Prompt)</label>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="可选，描述视频画面内容..."
                  className="w-full h-16 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl p-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-2)]/50 resize-none"
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5"><FastForward size={12}/> 帧率 (FPS)</label>
                  <span className="text-[12px] font-mono text-[var(--accent-2)] font-bold">{fps} fps</span>
                </div>
                <input type="range" min="8" max="24" step="2" value={fps} onChange={e => setFps(parseInt(e.target.value))} className="w-full h-1 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-2)]" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5"><Clock size={12}/> 时长 (Duration)</label>
                  <span className="text-[12px] font-mono text-[var(--accent-2)] font-bold">{duration} 秒 ({fps * duration} 帧)</span>
                </div>
                <input type="range" min="1" max="4" step="1" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full h-1 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-2)]" />
              </div>

              <div className="relative z-20 pt-2">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5"><Maximize size={12}/> 视频分辨率</label>
                <GlassDropdown 
                  value={resolution}
                  onChange={setResolution}
                  options={[
                    { label: "512x512 (标准方形)", value: "512x512" },
                    { label: "512x768 (竖屏画幅)", value: "512x768" },
                    { label: "768x512 (横屏画幅)", value: "768x512" }
                  ]}
                  accentColor="purple"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Result & Progress */}
        <div className="flex-1 flex flex-col">
          <div className="glass-panel rounded-2xl flex flex-col flex-1 overflow-hidden relative border border-[var(--glass-border)]">
            <div className="p-4 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--bg-layer-1)]">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Play size={16} className="text-[var(--accent-2)]" /> 播放预览
              </h3>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-5 bg-[var(--glass-bg)]">
              {activeJob ? (
                <div className="w-full max-w-md space-y-4">
                  <div className="flex justify-between text-[12px] font-bold text-[var(--accent-2)]">
                    <span>{activeJob.node ? `正在渲染节点: ${activeJob.node}` : '正在准备渲染...'}</span>
                    <span>{activeJob.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-layer-1)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[var(--accent-2)] to-[var(--accent-1)] transition-all duration-300" style={{ width: `${activeJob.progress}%` }}></div>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] text-center font-mono">{activeJob.status === 'pending' ? '等待排队...' : '生成中'}</p>
                </div>
              ) : completedJob && completedJob.images && completedJob.images.length > 0 ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  {completedJob.images[0].endsWith('.mp4') || completedJob.images[0].endsWith('.webm') ? (
                    <video src={convertFileSrc(completedJob.images[0])} autoPlay loop controls className={`max-w-full max-h-full rounded-lg shadow-2xl ${privacyMode ? 'blur-2xl hover:blur-none transition-all' : ''}`} />
                  ) : (
                    <img src={convertFileSrc(completedJob.images[0])} alt="Generated Video/Gif" className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl ${privacyMode ? 'blur-2xl hover:blur-none transition-all' : ''}`} />
                  )}
                </div>
              ) : (
                <div className="text-[var(--text-muted)] flex flex-col items-center">
                  <Video size={48} className="mb-4 opacity-20" />
                  <p className="text-[13px] font-bold uppercase tracking-widest">渲染完成后在此播放</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
