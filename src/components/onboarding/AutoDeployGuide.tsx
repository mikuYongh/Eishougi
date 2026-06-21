import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, PlayCircle, Wand2, CheckCircle2, AlertTriangle, Circle, Box, Folder, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { useSettingsStore } from '../../stores/settingsStore';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

type StepState = {
  status: 'waiting' | 'running' | 'success' | 'error';
  message: string;
};

export function AutoDeployGuide({ onComplete, onBack }: Props) {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [comfyDir, setComfyDir] = useState('C:\\ComfyUI');
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const [steps, setSteps] = useState<StepState[]>([
    { status: 'waiting', message: '检查环境 (Python/Git)' },
    { status: 'waiting', message: '检测 NVIDIA GPU' },
    { status: 'waiting', message: '克隆 ComfyUI 仓库' },
    { status: 'waiting', message: '安装 PyTorch (自动 CUDA/CPU)' },
    { status: 'waiting', message: '安装 ComfyUI 依赖' },
    { status: 'waiting', message: '安装自定义节点 (5 个)' },
    { status: 'waiting', message: '创建启动脚本' },
    { status: 'waiting', message: '创建模型目录' },
    { status: 'waiting', message: '导入默认工作流' },
    { status: 'waiting', message: '生成模型下载指引' },
  ]);
  const [deployResult, setDeployResult] = useState<any>(null);
  const [comfyUrl, setComfyUrl] = useState('');
  const [useMirror, setUseMirror] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadStates, setDownloadStates] = useState<Record<string, { percent: number; status: string; mb: string }>>({});
  const downloadingCount = Object.values(downloadStates).filter(d => d.status === 'downloading').length;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      unlisten = await listen<any>('model-download-progress', (event) => {
        const { name, percent, status, mb } = event.payload;
        setDownloadStates(prev => ({ ...prev, [name]: { percent, status, mb } }));
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const downloadModel = async (url: string, name: string, subdir: string) => {
    const baseDir = deployResult?.comfy_dir || 'C:\\ComfyUI';
    const dest = `${baseDir}\\${subdir?.replace('/', '\\')}\\${name}`;
    // Skip if file already exists
    try {
      const exists = await invoke<boolean>('check_file_exists', { path: dest });
      if (exists) {
        setDownloadStates(prev => ({ ...prev, [name]: { percent: 100, status: 'done', mb: '(已存在)' } }));
        return;
      }
    } catch {}
    try {
      await invoke('download_model_file', { url, destPath: dest, modelName: name });
    } catch (e: any) {
      setDownloadStates(prev => ({ ...prev, [name]: { percent: 0, status: 'error', mb: String(e) } }));
    }
  };

  const downloadSelected = () => {
    if (!deployResult?.models_needed) return;
    for (const m of deployResult.models_needed) {
      if (m.url && downloadStates[m.name]?.status !== 'done') {
        downloadModel(m.url, m.name, m.subdir);
      }
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      unlisten = await listen<any>('deploy-progress', (event) => {
        const { step, total, status: stepStatus, message } = event.payload;
        setSteps(prev => {
          const next = [...prev];
          if (step > 0 && step <= next.length) {
            next[step - 1] = {
              status: stepStatus === 'success' ? 'success' : stepStatus === 'error' ? 'error' : 'running',
              message
            };
          }
          return next;
        });
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const startDeploy = async () => {
    setStatus('running');
    setErrorMsg('');
    setDeployResult(null);
    setSteps(prev => prev.map(s => ({ ...s, status: 'waiting' as const })));

    try {
      const result = await invoke<any>('deploy_comfyui', { targetDir: comfyDir || null, useMirror });
      setDeployResult(result);
      // Check which models already exist
      if (result?.models_needed) {
        const baseDir = result.comfy_dir || comfyDir || 'C:\\ComfyUI';
        const states: Record<string, any> = {};
        for (const m of result.models_needed) {
          if (m.url) {
            const dest = `${baseDir}\\${(m.subdir || '').replace('/', '\\')}\\${m.name}`;
            try {
              const exists = await invoke<boolean>('check_file_exists', { path: dest });
              if (exists) states[m.name] = { percent: 100, status: 'done', mb: '(已存在)' };
            } catch {}
          }
        }
        setDownloadStates(states);
      }
      updateSettings({ comfyUrl: 'http://127.0.0.1:8188', comfyDir: comfyDir || result.comfy_dir });
      toast.success('ComfyUI 部署完成');
      // Auto-start ComfyUI
      try {
        const url = await invoke<string>('start_comfyui', { comfyDir: comfyDir || null, port: null });
        setComfyUrl(url);
        toast.success(`ComfyUI 已启动 ${url}`);
      } catch {
        toast.error('请手动双击 run_api.bat 启动 ComfyUI');
      }
      setStatus('success');
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setErrorMsg(e.toString());
      toast.error('部署失败，请查看错误详情');
      setSteps(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error' as const } : s
      ));
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: '选择 ComfyUI 安装目录'
      });
      if (selectedPath && typeof selectedPath === 'string') {
        setComfyDir(selectedPath);
      }
    } catch (e) {
      console.error('Failed to open dialog:', e);
    }
  };

  const stepIcon = (s: StepState) => {
    switch (s.status) {
      case 'running': return <Loader2 size={18} className="animate-spin text-[var(--accent-1)]" />;
      case 'success': return <CheckCircle2 size={18} className="text-green-500" />;
      case 'error': return <AlertTriangle size={18} className="text-red-500" />;
      default: return <Circle size={18} className="text-[var(--text-secondary)] opacity-50" />;
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-500 w-full relative">
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center">
          <button
            onClick={onBack}
            disabled={status === 'running'}
            className="p-2 hover:bg-[var(--glass-bg)] border border-transparent hover:border-[var(--glass-border)] rounded-xl mr-4 transition-all disabled:opacity-50"
          >
            <ArrowLeft size={20} className="text-[var(--text-secondary)]" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
              一键自动部署
            </h2>
            <span className="text-sm text-[var(--text-secondary)] mt-0.5">Eishougi Auto Setup</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-layer-2)]/50 backdrop-blur-md rounded-2xl border border-[var(--glass-border)] overflow-hidden relative shadow-sm">
        
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar relative z-10">
          {status === 'idle' && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-in fade-in duration-500">
              <div className="mb-6 bg-[var(--accent-1)]/10 p-4 rounded-full border border-[var(--accent-1)]/20">
                <Box size={48} className="text-[var(--accent-1)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">全自动部署</h3>
              <p className="text-[var(--text-secondary)] text-sm max-w-md mb-8">
                无需手动配置环境。向导将自动检测系统硬件、同步加速镜像、配置 PyTorch 与运行依赖。
              </p>

              <div className="w-full max-w-md bg-[var(--bg-base)]/50 p-6 rounded-2xl border border-[var(--glass-border)] text-left shadow-sm">
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">下载源选择</label>
                  <div className="flex gap-4">
                    <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-layer-1)] cursor-pointer hover:bg-[var(--glass-bg)] transition-all has-[:checked]:bg-[var(--accent-1)]/10 has-[:checked]:border-[var(--accent-1)]/50 text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name="mirror"
                        checked={useMirror}
                        onChange={() => setUseMirror(true)}
                        className="hidden"
                      />
                      <span className="text-sm font-medium">国内镜像加速</span>
                    </label>
                    <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-layer-1)] cursor-pointer hover:bg-[var(--glass-bg)] transition-all has-[:checked]:bg-[var(--accent-1)]/10 has-[:checked]:border-[var(--accent-1)]/50 text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name="mirror"
                        checked={!useMirror}
                        onChange={() => setUseMirror(false)}
                        className="hidden"
                      />
                      <span className="text-sm font-medium">GitHub 官方</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">安装路径</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={comfyDir}
                      onChange={(e) => setComfyDir(e.target.value)}
                      placeholder="C:\ComfyUI"
                      className="flex-1 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] focus:ring-1 focus:ring-[var(--accent-1)] transition-all"
                    />
                    <button 
                      onClick={handleSelectFolder}
                      className="px-4 py-3 bg-[var(--bg-layer-1)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-[var(--accent-1)]/50 rounded-xl transition-all flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] group"
                      title="选择文件夹"
                    >
                      <Folder size={18} className="group-hover:text-[var(--accent-1)] transition-colors" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(status === 'running' || status === 'error') && (
            <div className="space-y-3 max-w-2xl mx-auto py-2">
              {steps.map((step, i) => (
                <div key={i} className={`flex items-start gap-4 p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 ${
                  step.status === 'success' ? 'bg-green-500/5 border-green-500/20' :
                  step.status === 'running' ? 'bg-[var(--accent-1)]/10 border-[var(--accent-1)]/30' :
                  step.status === 'error' ? 'bg-red-500/10 border-red-500/30' :
                  'bg-[var(--bg-base)]/30 border-[var(--glass-border)] opacity-60'
                }`}>
                  <div className="mt-0.5 shrink-0">
                    {stepIcon(step)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium ${
                      step.status === 'success' ? 'text-[var(--text-primary)]' :
                      step.status === 'running' ? 'text-[var(--accent-1)]' :
                      step.status === 'error' ? 'text-red-400' :
                      'text-[var(--text-secondary)]'
                    }`}>
                      {step.message}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] shrink-0 font-medium bg-[var(--bg-layer-1)] px-2 py-1 rounded-md">
                    {i + 1} / 10
                  </span>
                </div>
              ))}
              
              {errorMsg && (
                <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in">
                  <div className="flex items-center gap-2 mb-2 text-red-500">
                    <AlertTriangle size={16} />
                    <span className="font-bold text-sm">部署遇到错误</span>
                  </div>
                  <div className="text-red-400 text-xs whitespace-pre-wrap break-all bg-black/20 p-3 rounded-lg border border-red-500/10 font-mono">
                    {errorMsg}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => { setStatus('idle'); setErrorMsg(''); }} className="px-5 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white text-sm font-medium transition-all shadow-sm">
                      重新尝试
                    </button>
                    <button onClick={onBack} className="px-5 py-2 bg-[var(--glass-bg)] hover:bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium transition-all">
                      返回上一步
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'running' && steps.every(s => s.status === 'success') && (
            <div className="flex items-center justify-center gap-2 text-[var(--accent-1)] mt-6 animate-pulse p-3 bg-[var(--accent-1)]/5 rounded-xl border border-[var(--accent-1)]/20 max-w-sm mx-auto">
              <Loader2 size={16} className="animate-spin" />
              <span className="font-medium text-sm">正在启动 ComfyUI 服务...</span>
            </div>
          )}
        </div>

        {/* Success State */}
        {status === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-500 p-8 w-full h-full">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20 shadow-sm">
              <CheckCircle2 size={40} className="text-green-500" />
            </div>
            
            <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2">部署圆满完成</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-8">环境已配置完毕，服务准备就绪</p>

            <div className="w-full max-w-3xl space-y-4">
              <div className="p-5 bg-[var(--bg-base)] border border-[var(--glass-border)] rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[var(--text-secondary)] text-sm mb-1">本地服务地址</span>
                  {comfyUrl ? (
                    <span className="text-green-500 font-mono text-lg">{comfyUrl}</span>
                  ) : (
                    <span className="text-yellow-500 text-sm">请手动双击 run_api.bat 启动</span>
                  )}
                </div>
                {deployResult?.comfy_dir && (
                  <div className="flex flex-col text-right border-l border-[var(--glass-border)] pl-6">
                    <span className="text-[var(--text-secondary)] text-sm mb-1">安装目录</span>
                    <span className="text-[var(--text-primary)] font-mono text-sm max-w-[250px] truncate" title={deployResult.comfy_dir}>{deployResult.comfy_dir}</span>
                  </div>
                )}
              </div>

              {deployResult?.models_needed?.length > 0 && (
                <div className="p-6 bg-[var(--bg-base)] border border-[var(--glass-border)] rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-[var(--text-primary)] font-bold text-lg">基础模型依赖</h4>
                      <p className="text-[var(--text-secondary)] text-sm mt-1">检测到 {deployResult.models_count} 个推荐模型未安装，建议立即补齐以确保功能正常</p>
                    </div>
                    <button
                      onClick={downloadSelected}
                      disabled={downloadingCount > 0}
                      className="px-6 py-2.5 rounded-xl bg-[var(--accent-1)] hover:bg-[var(--accent-2)] disabled:opacity-50 text-white text-sm font-bold transition-all shadow-md flex items-center gap-2"
                    >
                      {downloadingCount > 0 ? (
                        <><Loader2 size={16} className="animate-spin" /> 下载中...</>
                      ) : (
                        '一键下载全部'
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2 mt-4">
                    {deployResult.models_needed.map((m: any, i: number) => {
                      const ds = downloadStates[m.name];
                      return (
                        <div key={i} className={`text-xs p-2.5 rounded-lg border ${
                          ds?.status === 'done' ? 'bg-green-500/5 border-green-500/20' :
                          ds?.status === 'error' ? 'bg-red-500/5 border-red-500/20' :
                          ds?.status === 'downloading' ? 'bg-yellow-500/5 border-yellow-500/20' :
                          'bg-[var(--bg-layer-1)] border-[var(--glass-border)]'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`font-medium truncate mr-3 ${ds?.status === 'done' ? 'text-green-400' : ds?.status === 'error' ? 'text-red-400' : 'text-[var(--text-primary)]'}`} title={m.name}>
                              {m.name}
                            </span>
                            {m.url ? (
                              ds?.status === 'done' ? <CheckCircle2 size={16} className="text-green-500 shrink-0" /> :
                              ds?.status === 'downloading' ? <span className="text-[var(--accent-1)] font-mono shrink-0">{Math.round(ds.percent || 0)}%</span> :
                              <button 
                                onClick={() => downloadModel(m.url, m.name, m.subdir)}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--accent-1)]/10 hover:bg-[var(--accent-1)]/20 text-[var(--accent-1)] transition-colors shrink-0"
                              >
                                <Download size={12} />
                                {ds?.status === 'error' ? '重试' : '下载'}
                              </button>
                            ) : (
                              <span className="text-yellow-500 shrink-0 text-xs">无自动链接</span>
                            )}
                          </div>
                          {ds?.status === 'downloading' && (
                            <div className="w-full bg-[var(--bg-layer-2)] rounded-full h-2 mt-2 border border-[var(--glass-border)] overflow-hidden">
                              <div className="bg-[var(--accent-1)] h-full transition-all duration-300 relative" style={{ width: `${Math.max(5, ds.percent)}%` }}>
                                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                              </div>
                            </div>
                          )}
                          {ds?.status === 'downloading' && ds.mb && (
                            <div className="text-xs text-[var(--text-secondary)] mt-1.5 font-mono text-right">{ds.mb}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            <button onClick={onComplete} className="mt-10 px-12 py-4 bg-[var(--accent-1)] hover:bg-[var(--accent-2)] rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-3">
              进入詠唱机
              <ArrowLeft size={20} className="rotate-180" />
            </button>
          </div>
        )}
      </div>

      {status === 'idle' && (
        <div className="mt-6 flex justify-end relative z-10 animate-in fade-in">
          <button
            onClick={startDeploy}
            className="rounded-xl px-8 py-3 bg-[var(--accent-1)] hover:bg-[var(--accent-2)] text-white font-medium shadow-md flex items-center gap-2 transition-all"
          >
            <PlayCircle size={20} />
            开始全自动装配
          </button>
        </div>
      )}
    </div>
  );
}
