import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { detectHardware } from '../../utils/hardwareDetector';
import type { HardwareInfo } from '../../utils/hardwareDetector';
import { LocalGuide } from './LocalGuide';
import { CloudGuide } from './CloudGuide';
import { AutoDeployGuide } from './AutoDeployGuide';
import { Bot, Cpu, Cloud, ArrowRight, CheckCircle2, Server, Wand2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function OnboardingWizard() {
  const [step, setStep] = useState<number>(0);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [selectedRoute, setSelectedRoute] = useState<'local' | 'cloud' | 'auto' | null>(null);

  const completeOnboarding = () => {
    updateSettings({ hasCompletedOnboarding: true });
    toast.success('配置完成！欢迎使用詠唱机');
    setTimeout(() => {
      window.location.reload(); // Force reload to ensure transition out of onboarding
    }, 500);
  };

  const handleStartHardwareCheck = async () => {
    setIsChecking(true);
    const hw = await detectHardware();
    setHardware(hw);
    setIsChecking(false);
    setStep(1);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-[var(--accent-1)]/5 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[var(--accent-2)]/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-5xl max-h-[90vh] bg-[var(--bg-layer-1)]/80 backdrop-blur-3xl border border-[var(--glass-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[var(--glass-border)] flex items-center justify-between flex-shrink-0 z-10 bg-[var(--bg-layer-1)]/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Bot size={28} className="text-[var(--accent-1)]" />
            <h1 className="text-xl font-bold tracking-wider text-[var(--text-primary)]">詠唱机 EISHOUGI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-[var(--text-muted)] font-mono">
              {step === 0 && '1/3 欢迎与检测'}
              {step === 1 && '2/3 硬件报告'}
              {step === 2 && '3/3 配置向导'}
            </div>
            <button 
              onClick={completeOnboarding}
              className="px-4 py-1.5 rounded-full text-xs font-semibold text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--bg-layer-2)] hover:text-[var(--text-primary)] transition-all shadow-sm"
            >
              跳过配置 {'>'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col relative">
          {step === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 text-center max-w-2xl mx-auto animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 rounded-full bg-[var(--accent-1)]/10 flex items-center justify-center mb-6">
                <Bot size={48} className="text-[var(--accent-1)]" />
              </div>
              <h2 className="text-3xl font-bold mb-4">欢迎来到詠唱机</h2>
              <p className="text-[var(--text-secondary)] text-lg mb-10">
                为了获得最佳的 AI 绘画体验，我们需要为您配置底层引擎 (ComfyUI)。请先让我们检测一下您的系统硬件环境。
              </p>
              <button 
                onClick={handleStartHardwareCheck}
                disabled={isChecking}
                className="group relative inline-flex items-center justify-center gap-2 w-full sm:w-auto px-12 py-4 text-lg font-bold rounded-2xl bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] text-white shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(168,85,247,0.5)] hover:-translate-y-1 overflow-hidden disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_20px_rgba(168,85,247,0.3)] disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span className="relative z-10">{isChecking ? '正在检测系统环境...' : '开始硬件检测'}</span>
                {!isChecking && <ArrowRight size={22} className="relative z-10 group-hover:translate-x-1 transition-transform" />}
                {isChecking && <Loader2 size={22} className="relative z-10 animate-spin" />}
              </button>
            </div>
          )}

          {step === 1 && hardware && (
            <div className="flex flex-col max-w-4xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500 w-full">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <Cpu className="text-[var(--accent-1)]" />
                硬件检测报告
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-sm">
                  <div className="text-[var(--text-muted)] text-sm mb-1">显卡型号</div>
                  <div className="font-mono text-lg truncate" title={hardware.gpuRenderer}>
                    {hardware.gpuRenderer || '未知'}
                  </div>
                </div>
                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-sm">
                  <div className="text-[var(--text-muted)] text-sm mb-1">性能评估</div>
                  <div className="font-bold text-lg flex items-center gap-2">
                    {hardware.hasNvidiaGpu ? (
                      <span className="text-green-400 flex items-center gap-2"><CheckCircle2 size={18} /> 适合本地运行</span>
                    ) : (
                      <span className="text-yellow-400">建议使用云端算力</span>
                    )}
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-bold mb-4">请选择部署方式</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Local Option */}
                <button 
                  onClick={() => { setSelectedRoute('local'); setStep(2); }}
                  className="flex flex-col items-start p-6 text-left rounded-3xl border-2 border-[var(--glass-border)] bg-[var(--bg-layer-2)] hover:border-[var(--accent-1)] hover:bg-[var(--accent-1)]/5 transition-all group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-1)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Server size={32} className="text-[var(--accent-1)] mb-4" />
                  <h4 className="text-lg font-bold mb-2">手动本地配置</h4>
                  <p className="text-[var(--text-muted)] text-sm mb-4 line-clamp-3">
                    您已经自己下载好了 ComfyUI？只需跟着图文教程添加一个参数即可连接。
                  </p>
                  <div className="mt-auto px-3 py-1 bg-[var(--accent-1)]/10 text-[var(--accent-1)] rounded-full text-xs font-bold border border-[var(--accent-1)]/20">适合老手</div>
                </button>

                {/* Cloud Option */}
                <button 
                  onClick={() => { setSelectedRoute('cloud'); setStep(2); }}
                  className="flex flex-col items-start p-6 text-left rounded-3xl border-2 border-[var(--glass-border)] bg-[var(--bg-layer-2)] hover:border-[var(--accent-2)] hover:bg-[var(--accent-2)]/5 transition-all group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-2)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Cloud size={32} className="text-[var(--accent-2)] mb-4" />
                  <h4 className="text-lg font-bold mb-2">CNB 云端白嫖</h4>
                  <p className="text-[var(--text-muted)] text-sm mb-4 line-clamp-3">
                    没有高端显卡？没关系，免费使用云端顶级 GPU 算力。跟着教程三步启动。
                  </p>
                  {!hardware.hasNvidiaGpu && <div className="mt-auto px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold border border-yellow-500/30">推荐配置</div>}
                </button>

                {/* AI Auto Deploy Option */}
                <button 
                  onClick={() => { setSelectedRoute('auto'); setStep(2); }}
                  className="flex flex-col items-start p-6 text-left rounded-3xl border-2 border-[var(--accent-1)]/30 bg-[var(--bg-layer-2)] hover:border-[var(--accent-1)] hover:bg-[var(--accent-1)]/5 transition-all group relative overflow-hidden shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.1)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.2)] hover:-translate-y-1"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-1)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute -right-4 -top-4 text-[var(--accent-1)]/10 group-hover:text-[var(--accent-1)]/20 transition-colors">
                    <Wand2 size={100} />
                  </div>
                  <Wand2 size={32} className="text-[var(--accent-1)] mb-4 relative z-10" />
                  <h4 className="text-lg font-bold mb-2 text-[var(--text-primary)] relative z-10 flex items-center gap-2">
                    一键自动部署 <span className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--accent-1)] text-white font-black uppercase">NEW</span>
                  </h4>
                  <p className="text-[var(--text-muted)] text-sm mb-4 relative z-10">
                    纯 Rust 引擎，全自动安装 ComfyUI + PyTorch + 默认工作流，无需外部依赖。
                  </p>
                  {hardware.hasNvidiaGpu && <div className="mt-auto px-3 py-1 bg-[var(--accent-1)]/20 text-[var(--accent-1)] rounded-full text-xs font-bold border border-[var(--accent-1)]/30 relative z-10">新手强烈推荐</div>}
                </button>
              </div>
            </div>
          )}

          {step === 2 && selectedRoute === 'local' && (
            <LocalGuide onComplete={completeOnboarding} onBack={() => setStep(1)} />
          )}

          {step === 2 && selectedRoute === 'cloud' && (
            <CloudGuide onComplete={completeOnboarding} onBack={() => setStep(1)} />
          )}

          {step === 2 && selectedRoute === 'auto' && (
            <AutoDeployGuide onComplete={completeOnboarding} onBack={() => setStep(1)} />
          )}
        </div>
      </div>
    </div>
  );
}
