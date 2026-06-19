import React, { useState, useMemo } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useQueueStore } from '../../stores/queueStore';
import { comfyService } from '../../services/comfyService';
import { invoke } from '@tauri-apps/api/core';
import { GlassDropdown } from '../ui/GlassDropdown';
import { SearchableDropdown } from '../ui/SearchableDropdown';
import { useModelStore } from '../../stores/modelStore';
import { Play, Layers, X, Settings2, Loader2, Cpu } from 'lucide-react';

interface Img2VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
}

export function Img2VideoModal({ isOpen, onClose, imageSrc }: Img2VideoModalProps) {
  const workflows = useWorkflowStore(state => state.workflows);
  const videoWorkflows = useMemo(() => workflows.filter(w => w.type === 'img2video'), [workflows]);
  
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(videoWorkflows.length > 0 ? videoWorkflows[0].id : '');
  const [prompt, setPrompt] = useState('');
  const [fps, setFps] = useState(8);
  const [duration, setDuration] = useState(16);
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [baseModel, setBaseModel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const checkpoints = useModelStore(state => state.checkpoints);
  const [error, setError] = useState<string | null>(null);

  const addVideoJob = useQueueStore(state => state.addVideoJob);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!selectedWorkflowId) {
      setError('请选择一个图生视频工作流');
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    try {
      const tempProject = {
        id: 'video_' + Date.now(),
        title: '图生视频',
        positivePrompt: prompt,
        negativePrompt: '',
        width,
        height,
        seed: Math.floor(Math.random() * 1000000000)
      };

      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const filename = `upload_${Date.now()}.png`;
      const uploadedFilename = await comfyService.uploadImage(blob, filename);

      await addVideoJob(
        tempProject,
        selectedWorkflowId,
        uploadedFilename,
        fps,
        duration,
        width,
        height,
        prompt,
        baseModel
      );
      
      console.log('Video job queued');
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e.message || '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={!isGenerating ? onClose : undefined} />
      <div className="relative bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl p-6 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col md:flex-row gap-6">
        
        {/* Left: Image Preview */}
        <div className="w-full md:w-1/2 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Play size={18} className="text-[var(--accent-1)]" /> 
              图生视频
            </h2>
            <button onClick={onClose} disabled={isGenerating} className="md:hidden p-1 hover:bg-white/10 rounded-lg">
              <X size={16} />
            </button>
          </div>
          
          <div className="flex-1 bg-black/40 rounded-xl p-2 border border-white/5 flex items-center justify-center min-h-[200px]">
            <img src={imageSrc} alt="Preview" className="max-w-full max-h-full rounded-lg object-contain" />
          </div>
        </div>

        {/* Right: Parameters */}
        <div className="w-full md:w-1/2 flex flex-col gap-4">
          <div className="hidden md:flex justify-end">
            <button onClick={onClose} disabled={isGenerating} className="p-1.5 hover:bg-white/10 rounded-lg text-[var(--text-muted)] hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}

          <div className="relative z-[60]">
            <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
              <Layers size={12} className="text-[var(--accent-1)]" /> 工作流
            </label>
            <div className="relative z-50">
              <GlassDropdown 
                value={selectedWorkflowId}
                onChange={v => setSelectedWorkflowId(v || '')}
                options={[
                  ...videoWorkflows.map(w => ({ label: w.name, value: w.id }))
                ]}
                accentColor="blue"
              />
            </div>
            {videoWorkflows.length === 0 && (
              <p className="text-xs text-orange-400 mt-1">未找到图生视频工作流，请先导入</p>
            )}
          </div>

          <div className="relative z-[50]">
            <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
              <Cpu size={12} className="text-[var(--accent-1)]" /> 基础模型
            </label>
            <div className="relative z-50">
              <SearchableDropdown 
                value={baseModel}
                onChange={v => setBaseModel(v)}
                options={checkpoints.map(c => ({ label: c, value: c }))}
                placeholder="未选择，使用工作流默认模型..."
              />
            </div>
          </div>

          <div className="relative z-[40]">
            <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
              提示词 (选填)
            </label>
            <textarea 
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="描述你想要的视频动态..."
              className="w-full h-20 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg p-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] font-bold mb-1.5 block">视频帧率 (FPS)</label>
              <input 
                type="number" 
                value={fps} 
                onChange={e => setFps(parseInt(e.target.value) || 8)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg p-2 text-sm text-[var(--text-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] font-bold mb-1.5 block">总帧数 (Duration)</label>
              <input 
                type="number" 
                value={duration} 
                onChange={e => setDuration(parseInt(e.target.value) || 16)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg p-2 text-sm text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating || videoWorkflows.length === 0}
            className={`mt-auto py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all ${
              isGenerating || videoWorkflows.length === 0
                ? 'bg-gray-500/50 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] hover:shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.6)] hover:opacity-90 active:scale-95'
            }`}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
            {isGenerating ? '正在提交队列...' : '生成视频'}
          </button>
        </div>
      </div>
    </div>
  );
}
