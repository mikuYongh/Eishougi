import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../stores/settingsStore';
import { CheckCircle2, ArrowLeft, Loader2, PlayCircle, Settings, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function LocalGuide({ onComplete, onBack }: Props) {
  const [isPinging, setIsPinging] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const checkConnection = async () => {
    setIsPinging(true);
    try {
      const result = await invoke<any>('check_comfyui_status', { url: null });
      if (result.online) {
        setIsConnected(true);
        updateSettings({ comfyUrl: result.url || 'http://127.0.0.1:8188' });
        toast.success('本地 ComfyUI 连接成功！');
      } else {
        toast.error('未检测到本地 ComfyUI，请检查是否已启动并配置了 --listen');
      }
    } catch {
      toast.error('未检测到本地 ComfyUI，请检查是否已启动并配置了 --listen');
    }
    setIsPinging(false);
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const steps = [
    {
      title: "1. 找到启动脚本",
      desc: "在您的 ComfyUI 安装目录中，找到启动文件（例如 run_nvidia_gpu.bat），右键选择“编辑”或者用记事本打开它。",
      img: "/src/assets/guide/local_step1.jpg",
      icon: <Settings size={20} />
    },
    {
      title: "2. 添加 API 参数",
      desc: "在文件的启动命令（通常是以 python main.py 开头的那一行）中，添加 --listen 参数，以开启跨域访问。",
      img: "/src/assets/guide/local_step2.jpg",
      icon: <TerminalSquare size={20} />
    },
    {
      title: "3. 启动并验证",
      desc: "保存文件后，双击运行该脚本。等待命令行中出现 Starting server 并且显示 8188 端口，就说明启动成功啦！",
      img: "/src/assets/guide/local_step3.jpg",
      icon: <PlayCircle size={20} />
    }
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-500 w-full">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="p-2 hover:bg-[var(--glass-bg)] rounded-lg mr-2 transition-colors">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]" />
        </button>
        <h2 className="text-2xl font-bold">手动本地配置指南</h2>
      </div>

      {isConnected ? (
        <div className="flex flex-col items-center justify-center flex-1 py-12">
          <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6 border-2 border-green-500/30">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
          <h3 className="text-2xl font-bold mb-2">连接成功</h3>
          <p className="text-[var(--text-secondary)] mb-8">我们已成功探测到您本地运行的 ComfyUI。</p>
          <button onClick={onComplete} className="px-8 py-3 text-lg rounded-xl bg-[var(--accent-1)] text-white hover:bg-[var(--accent-1)]/90 transition-all shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.3)]">
            进入詠唱机
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex gap-4 mb-8 overflow-x-auto snap-x custom-scrollbar pb-4">
            {steps.map((s, i) => (
              <div 
                key={i}
                className={`flex-1 min-w-[280px] snap-center rounded-2xl border-2 transition-all p-5 cursor-pointer ${
                  activeStep === i ? 'border-[var(--accent-1)] bg-[var(--accent-1)]/5' : 'border-[var(--glass-border)] bg-[var(--bg-layer-2)] hover:border-[var(--accent-1)]/50'
                }`}
                onClick={() => setActiveStep(i)}
              >
                <div className="flex items-center gap-2 mb-3 text-[var(--accent-1)] font-bold">
                  {s.icon} {s.title}
                </div>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4 h-16">{s.desc}</p>
                <div className="w-full aspect-video bg-black/40 rounded-lg overflow-hidden border border-[var(--glass-border)] relative flex items-center justify-center">
                  <span className="text-xs text-[var(--text-muted)] absolute z-0">截图位置: A{i+1}</span>
                  <img src={s.img} alt={s.title} className="w-full h-full object-cover relative z-10" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto bg-[var(--glass-bg)] border border-[var(--accent-1)]/30 rounded-2xl p-6 flex items-center justify-between shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.1)]">
            <div>
              <h4 className="font-bold text-lg mb-1">配置好了吗？</h4>
              <p className="text-[var(--text-secondary)] text-sm">确认命令行已提示 Starting server 后点击重新检测。</p>
            </div>
            <button 
              onClick={checkConnection}
              disabled={isPinging}
              className="px-6 py-3 rounded-xl bg-transparent border-2 border-[var(--accent-1)] text-[var(--accent-1)] hover:bg-[var(--accent-1)] hover:text-white transition-all disabled:opacity-50"
            >
              {isPinging ? <Loader2 size={20} className="animate-spin" /> : '重新检测连接'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
