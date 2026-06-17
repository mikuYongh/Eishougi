import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Loader2, Plus, Minus, Image as ImageIcon } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { ComfyService, getComfyUrl } from '../../services/comfyService';

interface Img2VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
}

export function Img2VideoModal({ isOpen, onClose, imageSrc }: Img2VideoModalProps) {
  const { workflows } = useWorkflowStore();
  const videoWorkflows = workflows.filter(w => w.type === 'img2video');

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10);
  const [fps, setFps] = useState(25);
  const [batchCount, setBatchCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  
  useEffect(() => {
    if (videoWorkflows.length > 0 && !selectedWorkflowId) {
      setSelectedWorkflowId(videoWorkflows[0].id);
    }
  }, [videoWorkflows, selectedWorkflowId]);

  useEffect(() => {
    if (!isOpen) {
      setGeneratedVideos([]);
      setProgress(0);
      setStatusText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!imageSrc) return;
    
    const targetWorkflow = videoWorkflows.find(w => w.id === selectedWorkflowId);
    if (!targetWorkflow || !targetWorkflow.jsonContent) {
      alert("未找到指定的工作流配置！");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedVideos([]);

    try {
      const comfyService = new ComfyService();
      
      // 1. Read image dimensions first
      setStatusText("读取图片尺寸...");
      const imgObj = new Image();
      imgObj.src = imageSrc;
      await new Promise((resolve, reject) => {
        imgObj.onload = resolve;
        imgObj.onerror = reject;
      });
      const imgW = imgObj.naturalWidth || 832;
      const imgH = imgObj.naturalHeight || 1216;

      // 2. Fetch image blob
      setStatusText("正在处理原图...");
      const imgResponse = await fetch(imageSrc);
      const imgBlob = await imgResponse.blob();
      const filename = `img2video_${Date.now()}.png`;

      // 3. Upload image
      setStatusText("正在上传图片...");
      const uploadedFilename = await comfyService.uploadImage(imgBlob, filename);

      // 4. Inject workflow
      const workflowJson = JSON.parse(targetWorkflow.jsonContent);
      const injectedWorkflow = comfyService.injectVideoParameters(
        workflowJson,
        uploadedFilename,
        prompt,
        fps,
        duration,
        imgW, 
        imgH
      );

      // 4. Connect to WS
      setStatusText("连接 ComfyUI...");
      await new Promise<void>((resolve, reject) => {
        let completedCount = 0;
        comfyService.connect(
          (prog) => {
            setProgress(Math.round((prog.value / prog.max) * 100));
            setStatusText(`正在生成 (${prog.node})...`);
          },
          (images) => {
            setGeneratedVideos(prev => [...prev, ...images]);
            completedCount++;
            if (completedCount >= batchCount) {
              comfyService.disconnect();
              resolve();
            }
          },
          (err) => {
            alert(`生成失败: ${err}`);
            comfyService.disconnect();
            reject(err);
          }
        );

        // Queue prompts based on batch count
        const queuePromises = Array.from({ length: batchCount }).map(() => 
          comfyService.queuePrompt(injectedWorkflow)
        );
        
        Promise.all(queuePromises).catch(err => {
          alert(`排队失败: ${err.message}`);
          reject(err);
        });
      });

      setStatusText("生成完成");
      setProgress(100);
    } catch (e: any) {
      console.error(e);
      setStatusText("发生错误");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full h-[90vh] md:h-[85vh] max-w-6xl bg-[var(--bg-base)] md:rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-[var(--glass-border)] animate-in slide-in-from-bottom-8 duration-500">
        
        {/* Left / Top : Controls */}
        <div className="w-full md:w-[400px] flex flex-col border-r border-[var(--glass-border)] bg-[var(--bg-layer-1)]">
          <div className="p-4 flex items-center justify-between border-b border-[var(--glass-border)]">
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Play className="text-[var(--accent-1)]" size={20} /> 图生视频
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-[var(--text-secondary)]">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
            {/* Image Preview */}
            <div className="relative w-full aspect-[2/3] max-h-[300px] rounded-2xl overflow-hidden bg-black border border-[var(--glass-border)] shadow-inner flex items-center justify-center">
              {imageSrc ? (
                <img src={imageSrc} alt="Source" className="w-full h-full object-contain" />
              ) : (
                <ImageIcon size={40} className="text-white/20" />
              )}
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md text-[10px] text-white/80 border border-white/10">
                源图片
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">工作流 (Workflow)</label>
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all appearance-none cursor-pointer"
                >
                  {videoWorkflows.length === 0 && <option value="">未找到图生视频工作流</option>}
                  {videoWorkflows.map(w => (
                    <option key={w.id} value={w.id} className="bg-[var(--bg-base)] text-white">{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">视频场景描述 (Prompt)</label>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="w-full h-24 px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all custom-scrollbar resize-none"
                  placeholder="用英文描述视频中的动作或场景... (例如: cherry blossoms falling, wind blowing)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">时长 (Duration)</label>
                  <input 
                    type="number"
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">帧率 (FPS)</label>
                  <input 
                    type="number"
                    value={fps}
                    onChange={e => setFps(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">批量生成数量 (Batch Count)</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setBatchCount(Math.max(1, batchCount - 1))} className="w-10 h-10 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-[var(--text-primary)]">
                    <Minus size={16} />
                  </button>
                  <div className="flex-1 h-10 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center font-bold text-[var(--text-primary)]">
                    {batchCount}
                  </div>
                  <button onClick={() => setBatchCount(batchCount + 1)} className="w-10 h-10 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-[var(--text-primary)]">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-[var(--glass-border)]">
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isGenerating 
                  ? 'bg-white/10 text-white/50 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] text-white hover:shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.4)] active:scale-[0.98]'
              }`}
            >
              {isGenerating ? (
                <><Loader2 size={18} className="animate-spin" /> {statusText} ({progress}%)</>
              ) : (
                <><Play size={18} /> 开始生成</>
              )}
            </button>
          </div>
        </div>

        {/* Right / Bottom : Results */}
        <div className="flex-1 flex flex-col bg-black/20 p-4 overflow-y-auto custom-scrollbar">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 uppercase tracking-widest opacity-80">生成产物 ({generatedVideos.length})</h3>
          
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {generatedVideos.map((vidSrc, idx) => (
              <div key={idx} className="aspect-[2/3] rounded-2xl overflow-hidden bg-black/40 border border-[var(--glass-border)] relative group">
                {vidSrc.endsWith('.mp4') || vidSrc.endsWith('.webm') ? (
                  <video src={vidSrc} controls loop className="w-full h-full object-cover" />
                ) : (
                  <img src={vidSrc} className="w-full h-full object-cover" alt={`Generated ${idx}`} />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <a href={vidSrc} target="_blank" rel="noreferrer" download className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-[var(--accent-1)] transition-colors border border-white/20">
                    <Play size={16} className="ml-1" />
                  </a>
                </div>
              </div>
            ))}

            {isGenerating && Array.from({ length: Math.max(0, batchCount - generatedVideos.length) }).map((_, idx) => (
              <div key={`loading-${idx}`} className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 relative flex flex-col items-center justify-center animate-pulse">
                <Loader2 size={32} className="text-[var(--accent-1)] animate-spin mb-4" />
                <div className="w-2/3 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent-1)] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ))}

            {!isGenerating && generatedVideos.length === 0 && (
              <div className="col-span-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] py-20">
                <Play size={48} className="opacity-20 mb-4" />
                <p>点击左侧“开始生成”制作视频</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
