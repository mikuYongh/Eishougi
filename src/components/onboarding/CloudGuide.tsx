import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../stores/settingsStore';
import { ArrowLeft, Cloud, ExternalLink, Link, CheckCircle2, PlayCircle, TerminalSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-shell';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function CloudGuide({ onComplete, onBack }: Props) {
  const [inputUrl, setInputUrl] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const checkConnection = async () => {
    if (!inputUrl) {
      toast.error('请输入外网地址');
      return;
    }
    
    // Normalize URL
    let url = inputUrl.trim();
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    setIsPinging(true);
    try {
      const result = await invoke<any>('check_comfyui_status', { url });
      
      if (result.online) {
        updateSettings({ comfyUrl: url });
        toast.success('云端实例连接成功！');
        onComplete();
      } else {
        toast.error(result.error || '连接失败');
      }
    } catch (err) {
      toast.error('无法连接到该地址，请检查地址是否正确或实例是否启动。');
    } finally {
      setIsPinging(false);
    }
  };

  const steps = [
    {
      title: "1. 访问并克隆",
      desc: "点击进入 CNB 平台，找到 o-comfy 仓库，可能需要您先登录。",
      img: "/assets/guide/cloud_step1.png",
      icon: <ExternalLink size={20} />
    },
    {
      title: "2. 启动实例",
      desc: "在仓库页面，点击“启动 o-comfy”按钮来创建一个免费的云端实例。",
      img: "/assets/guide/cloud_step2.png",
      icon: <PlayCircle size={20} />
    },
    {
      title: "3. 运行服务",
      desc: "进入实例后，在终端（Terminal）中输入 bash start.sh 并回车运行。",
      img: "/assets/guide/cloud_step3.png",
      icon: <TerminalSquare size={20} />
    },
    {
      title: "4. 获取地址",
      desc: "启动成功后，系统会分配一个外网地址，将该地址复制下来并填入下方。",
      img: "/assets/guide/cloud_step4.png",
      icon: <Link size={20} />
    }
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-500 w-full">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="p-2 hover:bg-[var(--glass-bg)] rounded-lg mr-2 transition-colors">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]" />
        </button>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Cloud className="text-[var(--accent-2)]" />
          CNB 云端配置指南
        </h2>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="mb-6 px-4 py-3 bg-[var(--accent-2)]/10 border border-[var(--accent-2)]/20 rounded-xl flex items-center justify-between">
          <span className="text-sm">第一步：前往 CNB 平台</span>
          <button 
            onClick={() => open('https://cnb.cool/ywywyw/o-comfy')}
            className="px-4 py-2 rounded-lg bg-[var(--accent-2)] text-white hover:bg-[var(--accent-2)]/90 flex items-center gap-2 transition-all shadow-md"
          >
            打开 CNB 仓库 <ExternalLink size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {steps.map((s, i) => (
            <div 
              key={i}
              className={`rounded-xl border-2 transition-all p-4 cursor-pointer ${
                activeStep === i ? 'border-[var(--accent-2)] bg-[var(--accent-2)]/5' : 'border-[var(--glass-border)] bg-[var(--bg-layer-2)] hover:border-[var(--accent-2)]/50'
              }`}
              onClick={() => setActiveStep(i)}
            >
              <div className="flex items-center gap-2 mb-2 text-[var(--accent-2)] font-bold text-sm">
                {s.icon} {s.title}
              </div>
              <p className="text-[var(--text-secondary)] text-xs leading-relaxed mb-3 h-12">{s.desc}</p>
              <div className="w-full aspect-video bg-black/40 rounded-lg overflow-hidden border border-[var(--glass-border)] relative flex items-center justify-center">
                <span className="text-[10px] text-[var(--text-muted)] absolute z-0">截图位置: B{i+1}</span>
                <img src={s.img} alt={s.title} className="w-full h-full object-cover relative z-10" onError={(e) => e.currentTarget.style.display = 'none'} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto bg-[var(--glass-bg)] border border-[var(--accent-2)]/30 rounded-2xl p-6 flex flex-col shadow-[0_0_20px_rgba(var(--accent-2-rgb),0.1)]">
          <h4 className="font-bold text-lg mb-4">输入外网地址</h4>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Link size={18} className="text-[var(--text-muted)]" />
              </div>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="例如: https://xxxxxxxx.cnb.cool"
                className="w-full pl-10 pr-4 py-3 bg-[var(--bg-base)] border border-[var(--glass-border)] rounded-xl focus:border-[var(--accent-2)] focus:ring-1 focus:ring-[var(--accent-2)] outline-none transition-all text-sm font-mono"
              />
            </div>
            <button 
              onClick={checkConnection}
              disabled={isPinging || !inputUrl}
              className="px-6 py-3 rounded-xl bg-[var(--accent-2)] text-white hover:bg-[var(--accent-2)]/90 transition-all flex-shrink-0 disabled:opacity-50 shadow-md"
            >
              {isPinging ? <Loader2 size={20} className="animate-spin" /> : '连接并完成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
