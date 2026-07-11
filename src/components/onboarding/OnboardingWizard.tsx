import { useState, useEffect, useCallback, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useSettingsStore } from "../../stores/settingsStore";
import { usePromptStore } from "../../stores/promptStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useQueueStore } from "../../stores/queueStore";
import { comfyService } from "../../services/comfyService";
import { getImgSrc } from "../../utils/imageUtils";
import {
  Loader2, CheckCircle2, XCircle, Download, Play, ArrowRight, ArrowLeft,
  ExternalLink, RefreshCw, Sparkles, Cpu, Package, Zap, X, MessageCircle,
} from "lucide-react";
import qqGroupQR from "../../assets/qrcodes/qq_group.jpg";

// ComfyUI-aki download URL (placeholder — replace with actual network drive URL)
const AKI_DOWNLOAD_URL = "https://pan.quark.cn/s/df057d5baeab";

// QQ群 + 模型下载源（用户遇到问题时的主要求助渠道）
const QQ_GROUP_URL = "https://qm.qq.com/q/DOL54nJCSc";
const QQ_GROUP_NUMBER = "389236073";
const ANIMA_MODELS_URL = "https://huggingface.co/circlestone-labs/Anima/tree/main/split_files";

// 共享：遇到问题时显示的 QQ群求助卡片（扫码 + 加群按钮）
function HelpCard() {
  return (
    <div className="rounded-xl bg-[var(--accent-1)]/8 border border-[var(--accent-1)]/25 p-4 flex items-center gap-4">
      <img src={qqGroupQR} alt="QQ群二维码" className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-[var(--glass-border)]" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <MessageCircle size={14} className="text-[var(--accent-1)]" />
          遇到问题？扫码加群
        </p>
        <p className="text-[11px] text-[var(--text-secondary)] mt-1">QQ群 {QQ_GROUP_NUMBER} · 群内有完整模型包和安装教程</p>
        <button
          onClick={() => open(QQ_GROUP_URL)}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-1)]/20 border border-[var(--accent-1)]/40 text-[11px] font-bold text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 transition-colors cursor-pointer"
        >
          <ExternalLink size={12} /> 点此加群
        </button>
      </div>
    </div>
  );
}

type StepId = 0 | 1 | 2 | 3;
type CheckStatus = 'pending' | 'checking' | 'pass' | 'fail';

interface EnvCheck {
  online: boolean;
  url: string;
  checkpoints: string[];
  lora_count: number;
  missing_nodes: string[];
  installed_nodes: string[];
  missing_models?: string[];
  error?: string;
}

export function OnboardingWizard() {
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [step, setStep] = useState<StepId>(0);

  const complete = useCallback(() => {
    updateSettings({ hasCompletedOnboarding: true } as any);
    setTimeout(() => window.location.reload(), 100);
  }, [updateSettings]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Ambient glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-[var(--accent-1)]/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-[var(--accent-2)]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="relative bg-[var(--bg-layer-1)]/90 backdrop-blur-3xl border border-[var(--glass-border)] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_var(--glass-border)] overflow-hidden">
          {/* Top hairline */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-1)]/60 to-transparent" />

          {/* Close / skip — marks onboarding done and reloads */}
          <button
            type="button"
            onClick={complete}
            title="跳过引导"
            aria-label="跳过引导"
            className="absolute top-4 right-4 z-10 p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-layer-2)] transition-colors"
          >
            <X size={20} />
          </button>

          {/* Step indicator */}
          <StepIndicator current={step} />

          {/* Content */}
          <div className="p-8 pt-6">
            {step === 0 && <Step0_Welcome onStart={() => setStep(1)} />}
            {step === 1 && <Step1_Connection onOnline={() => setStep(3)} onOffline={() => setStep(2)} />}
            {step === 2 && <Step2_GetComfyUI onBack={() => setStep(1)} onConnected={() => setStep(3)} />}
            {step === 3 && <Step3_CheckAndTest onComplete={complete} onBack={() => setStep(1)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ Step Indicator ============================

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { id: 0, icon: Sparkles },
    { id: 1, icon: Cpu },
    { id: 2, icon: Download },
    { id: 3, icon: CheckCircle2 },
  ];
  return (
    <div className="flex items-center justify-center gap-2 pt-6 pb-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            current === s.id
              ? "bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] text-white shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.5)] scale-110"
              : current > s.id
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-[var(--bg-layer-2)] text-[var(--text-muted)] border border-[var(--glass-border)]"
          }`}>
            {current > s.id ? <CheckCircle2 size={14} /> : <s.icon size={14} />}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-[2px] mx-1 rounded-full transition-all duration-300 ${current > s.id ? "bg-green-500/40" : "bg-[var(--glass-border)]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================ Step 0: Welcome ============================

function Step0_Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center animate-in fade-in zoom-in-95 duration-400">
      <div className="mb-6 flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-[var(--accent-1)]/30 blur-2xl rounded-full" />
          <img src="/logo.png" alt="EISHOUGI" className="relative w-32 h-auto drop-shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.4)]" />
        </div>
      </div>
      <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] mb-2">
        欢迎使用詠唱机
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md mx-auto leading-relaxed">
        AI 图片创作工作台。让我们花一分钟配置好你的 ComfyUI 环境，开启创作之旅。
      </p>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-[15px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_25px_rgba(var(--accent-1-rgb),0.4)] hover:shadow-[0_0_35px_rgba(var(--accent-1-rgb),0.6)] hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
      >
        开始配置 <ArrowRight size={18} />
      </button>
    </div>
  );
}

// ============================ Step 1: Connection Check ============================

function Step1_Connection({ onOnline, onOffline }: { onOnline: () => void; onOffline: () => void }) {
  const [status, setStatus] = useState<CheckStatus>('checking');
  const { settings, updateSettings } = useSettingsStore();

  const check = useCallback(async () => {
    setStatus('checking');
    try {
      const result = await invoke<any>('check_comfyui_status', { url: settings.comfyUrl || null });
      if (result?.online) {
        setStatus('pass');
        setTimeout(onOnline, 600);
      } else {
        setStatus('fail');
        setTimeout(onOffline, 600);
      }
    } catch {
      setStatus('fail');
      setTimeout(onOffline, 600);
    }
  }, [settings.comfyUrl, onOnline, onOffline]);

  useEffect(() => { check(); }, [check]);

  return (
    <div className="text-center animate-in fade-in slide-in-from-right-4 duration-300">
      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">检测 ComfyUI 连接</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-8">正在检查 {settings.comfyUrl || '127.0.0.1:8188'}...</p>

      <div className="flex flex-col items-center gap-4 mb-8">
        {status === 'checking' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={48} className="text-[var(--accent-1)] animate-spin" />
            <span className="text-sm text-[var(--text-secondary)]">正在连接...</span>
          </div>
        )}
        {status === 'pass' && (
          <div className="flex flex-col items-center gap-3 animate-in zoom-in-50 duration-300">
            <CheckCircle2 size={48} className="text-green-400" />
            <span className="text-sm font-bold text-green-400">ComfyUI 已连接！</span>
          </div>
        )}
        {status === 'fail' && (
          <div className="flex flex-col items-center gap-3 animate-in zoom-in-50 duration-300">
            <XCircle size={48} className="text-red-400" />
            <span className="text-sm text-[var(--text-secondary)]">未检测到 ComfyUI 运行中</span>
          </div>
        )}
      </div>

      {status === 'fail' && (
        <div className="space-y-3">
          <button
            onClick={check}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-[var(--text-primary)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all cursor-pointer"
          >
            <RefreshCw size={15} /> 重新检测
          </button>
        </div>
      )}

      <details className="mt-6 text-left">
        <summary className="text-xs text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
          ComfyUI 地址不同？点击修改
        </summary>
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={settings.comfyUrl}
            onChange={(e) => updateSettings({ comfyUrl: e.target.value })}
            placeholder="http://127.0.0.1:8188"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-layer-2)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50"
          />
          <button
            onClick={check}
            className="px-4 py-2 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] text-[13px] font-bold border border-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/30 transition-all cursor-pointer"
          >
            检测
          </button>
        </div>
      </details>
    </div>
  );
}

// ============================ Step 2: Get ComfyUI ============================

function Step2_GetComfyUI({ onBack, onConnected }: { onBack: () => void; onConnected: () => void }) {
  const [mode, setMode] = useState<'choose' | 'newbie' | 'expert'>('choose');
  const { settings, updateSettings } = useSettingsStore();
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await invoke<any>('check_comfyui_status', { url: settings.comfyUrl || null });
      if (result?.online) { onConnected(); return; }
    } catch {}
    setChecking(false);
  };

  if (mode === 'choose') {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 text-center">配置 ComfyUI</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6 text-center">选择适合你的方式</p>

        <div className="space-y-3">
          <button
            onClick={() => setMode('newbie')}
            className="w-full p-5 rounded-2xl bg-[var(--bg-layer-2)] border border-[var(--glass-border)] hover:border-[var(--accent-1)]/40 hover:bg-[var(--glass-bg-hover)] transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/25 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <Download size={22} className="text-[var(--accent-1)]" />
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-[var(--text-primary)]">我是新手 — 下载 ComfyUI 整合包</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1">下载 ComfyUI-aki 一键整合包，无需配置环境</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('expert')}
            className="w-full p-5 rounded-2xl bg-[var(--bg-layer-2)] border border-[var(--glass-border)] hover:border-[var(--accent-2)]/40 hover:bg-[var(--glass-bg-hover)] transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-2)]/15 border border-[var(--accent-2)]/25 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <Cpu size={22} className="text-[var(--accent-2)]" />
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-[var(--text-primary)]">我已有 ComfyUI</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1">输入地址连接已有的 ComfyUI 实例</p>
              </div>
            </div>
          </button>
        </div>

        <button onClick={onBack} className="mt-6 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1 mx-auto">
          <ArrowLeft size={12} /> 返回重新检测
        </button>
      </div>
    );
  }

  if (mode === 'newbie') {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 text-center">下载并启动 ComfyUI</h3>

        <div className="space-y-3 mb-6">
          {[
            { icon: Download, text: '下载 ComfyUI-aki 整合包', action: () => open(AKI_DOWNLOAD_URL) },
            { icon: Package, text: '解压到任意目录（如 D:\\）' },
            { icon: Play, text: '打开文件夹中的「绘世启动器.exe」' },
            { icon: Zap, text: '在绘世启动器中点击「一键运行」' },
            { icon: Loader2, text: '等待终端窗口出现启动信息' },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-layer-2)] border border-[var(--glass-border)]">
              <div className="w-7 h-7 rounded-full bg-[var(--accent-1)]/15 text-[var(--accent-1)] text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <s.icon size={16} className="text-[var(--text-secondary)] flex-shrink-0" />
              <span className="text-[13px] text-[var(--text-primary)] flex-1">{s.text}</span>
              {s.action && (
                <button onClick={s.action} className="text-xs text-[var(--accent-1)] font-bold flex items-center gap-1 cursor-pointer hover:underline">
                  打开 <ExternalLink size={11} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleCheck}
          disabled={checking}
          className="w-full py-3 rounded-2xl text-[14px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.5)] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {checking ? <><Loader2 size={16} className="animate-spin" /> 检测中...</> : <><CheckCircle2 size={16} /> 我已启动，重新检测</>}
        </button>
        <button onClick={() => setMode('choose')} className="mt-4 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer mx-auto block">
          返回选择
        </button>
      </div>
    );
  }

  // Expert
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 text-center">连接已有 ComfyUI</h3>
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">ComfyUI 地址</label>
          <input
            type="text"
            value={settings.comfyUrl}
            onChange={(e) => updateSettings({ comfyUrl: e.target.value })}
            placeholder="http://127.0.0.1:8188"
            className="w-full px-4 py-3 rounded-xl bg-[var(--bg-layer-2)] border border-[var(--glass-border)] text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all"
          />
        </div>
      </div>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="w-full py-3 rounded-2xl text-[14px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.5)] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {checking ? <><Loader2 size={16} className="animate-spin" /> 检测中...</> : <>检测连接 <ArrowRight size={16} /></>}
      </button>
      <button onClick={() => setMode('choose')} className="mt-4 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer mx-auto block">
        返回选择
      </button>
    </div>
  );
}

// ============================ Step 3: Check Components + Test ============================

function Step3_CheckAndTest({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const { settings } = useSettingsStore();
  const [phase, setPhase] = useState<'checking' | 'missing_nodes' | 'missing_models' | 'testing' | 'done' | 'error'>('checking');
  const [envResult, setEnvResult] = useState<EnvCheck | null>(null);
  const [testImage, setTestImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  // Guard against React StrictMode / HMR double-invoking useEffect (which would submit two jobs).
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runEnvCheck();
  }, []);

  const runEnvCheck = async () => {
    setPhase('checking');
    setErrorMsg('');
    try {
      const result = await invoke<EnvCheck>('check_environment', { url: settings.comfyUrl || null });
      setEnvResult(result);
      if (!result.online) {
        setErrorMsg('ComfyUI 不可达，请返回上一步检查连接');
        setPhase('error');
        return;
      }
      // If the default workflow needs custom nodes that aren't installed, stop here —
      // queuing the prompt would just 400 because ComfyUI doesn't recognize the node types.
      // Ask the user to install them in ComfyUI (via Manager) and re-check.
      if (result.missing_nodes.length > 0) {
        setPhase('missing_nodes');
        return;
      }
      // The default Anima workflow references specific model files (unet / vae / clip).
      // If any are missing from disk, ComfyUI will reject the prompt with 400 "model not
      // found". Stop here and tell the user exactly what to download + where to put it.
      if (result.missing_models && result.missing_models.length > 0) {
        setPhase('missing_models');
        return;
      }
      setPhase('testing');
      await runTestGeneration();
    } catch (e: any) {
      setErrorMsg(String(e?.message || e));
      setPhase('error');
    }
  };

  const runTestGeneration = async () => {
    setPhase('testing');
    setErrorMsg('');
    try {
      const workflows = useWorkflowStore.getState().workflows;
      let wf = workflows.find(w => w.type === 'text2img' && w.isDefault) || workflows.find(w => w.type === 'text2img');
      if (!wf) {
        setErrorMsg('未找到 text2img 工作流，请先在工作流管理中导入');
        setPhase('error');
        return;
      }

      // Parse sampler/scheduler/baseModel from the workflow so we don't inject empty strings
      // (empty strings would override the workflow's own values and ComfyUI would reject them).
      let wfSampler = '';
      let wfScheduler = '';
      let wfBaseModel = '';
      let wfLoras: any[] = [];
      if (wf.jsonContent) {
        try {
          const a = comfyService.analyzeWorkflow(wf.jsonContent);
          wfSampler = a.samplerName || '';
          wfScheduler = a.scheduler || '';
          wfBaseModel = a.baseModel || '';
          wfLoras = a.loras || [];
        } catch {}
      }

      const now = Date.now();
      const testProject = {
        id: `onboard_test_${now}`,
        title: '引导测试',
        description: '',
        positivePrompt: '1girl, solo, smile, simple background',
        negativePrompt: 'lowres, bad anatomy, bad hands',
        artistPrompt: '',
        promptSyntax: 'danbooru' as const,
        width: 832,
        height: 1216,
        steps: 20,
        cfgScale: 5.0,
        seed: '-1',
        sampler: wfSampler,
        scheduler: wfScheduler,
        baseModel: wfBaseModel,
        vaeModel: 'auto',
        loraConfigs: wfLoras,
        workflowId: wf.id,
        tags: [],
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
        instanceImages: [],
      };

      const results = await useQueueStore.getState().addJob(testProject, wf.id, 1);
      const images = results.flat();

      if (images.length > 0) {
        // images[0] is a local file path from process_executed (e.g. C:\Users\...\uploads\gen_xxx.png)
        // getImgSrc handles backslash→slash conversion + convertFileSrc + ComfyUI URL rewriting.
        const src = getImgSrc(images[0]);
        setTestImage(src);
        setPhase('done');
      } else {
        setErrorMsg('生成完成但未返回图片，可能缺少模型');
        setPhase('error');
      }
    } catch (e: any) {
      setErrorMsg(String(e?.message || e));
      setPhase('error');
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {phase === 'checking' && (
        <div className="text-center py-4">
          <Loader2 size={48} className="text-[var(--accent-1)] animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">正在检测组件环境...</h3>
          <p className="text-sm text-[var(--text-secondary)]">检查模型、自定义节点等</p>
        </div>
      )}

      {envResult && (phase === 'testing' || phase === 'done' || phase === 'error' || phase === 'missing_nodes' || phase === 'missing_models') && (
        <div className="space-y-2 mb-6">
          <CheckRow label="ComfyUI 在线" status={envResult.online ? 'pass' : 'fail'} detail={envResult.online ? envResult.url : '不可达'} />
          <CheckRow label="Checkpoint 模型" status={envResult.checkpoints.length > 0 ? 'pass' : (phase === 'missing_models' ? 'fail' : 'pending')} detail={`${envResult.checkpoints.length} 个可用`} />
          <CheckRow label="LoRA 模型" status={envResult.lora_count > 0 ? 'pass' : 'pending'} detail={`${envResult.lora_count} 个可用`} />
          <CheckRow label="自定义节点" status={envResult.missing_nodes.length === 0 ? 'pass' : (phase === 'missing_nodes' ? 'fail' : 'pending')} detail={envResult.missing_nodes.length === 0 ? `${envResult.installed_nodes.length} 个已安装` : `缺少: ${envResult.missing_nodes.join(', ')}`} />
        </div>
      )}

      {phase === 'missing_nodes' && envResult && (
        <div className="text-center py-4 animate-in zoom-in-95 duration-300">
          <Package size={48} className="text-orange-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">缺少自定义节点</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-2 max-w-md mx-auto">
            默认工作流需要以下节点，请在 ComfyUI 的 <span className="font-bold text-[var(--text-primary)]">Manager → Install Custom Nodes</span> 中安装后重启 ComfyUI：
          </p>
          <div className="flex flex-col items-center justify-center gap-2 mb-4">
            {envResult.missing_nodes.map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--bg-layer-1)] border border-red-500/50 text-[13px] font-bold text-[var(--text-primary)] shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                <XCircle size={14} className="text-red-400 flex-shrink-0" />
                {n}
              </span>
            ))}
          </div>
          <div className="mb-5">
            <HelpCard />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={runEnvCheck}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] hover:opacity-90 transition-all cursor-pointer"
            >
              <RefreshCw size={15} /> 我已安装，重新检测
            </button>
            <button
              onClick={onComplete}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer px-4 py-2.5"
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {phase === 'missing_models' && envResult && (
        <div className="py-4 animate-in zoom-in-95 duration-300">
          <div className="text-center mb-5">
            <Download size={48} className="text-[var(--accent-1)] mx-auto mb-3" />
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">缺少模型文件</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
              默认工作流需要以下模型，放到 ComfyUI 对应目录后点「我已下载，重新检测」。
            </p>
          </div>
          <div className="space-y-2 mb-5">
            {(envResult.missing_models || []).map((raw) => {
              // Backend format: "filename.safetensors (models/dir/)"
              const name = raw.split(' (')[0];
              const dir = (raw.match(/\(([^)]+)\)/)?.[1] || '').replace(/\/$/, '');
              return (
              <div key={name} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)]">
                <Download size={16} className="text-[var(--accent-1)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">{name}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] font-mono">→ {dir}/</p>
                </div>
              </div>
              );
            })}
          </div>

          {/* 方式一：QQ群（推荐，群内有完整模型包 + 安装教程）*/}
          <div className="mb-3">
            <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">方式一 · 加群获取（推荐）</p>
            <HelpCard />
          </div>

          {/* 方式二：自行从 HuggingFace 下载 */}
          <div className="mb-5">
            <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">方式二 · 自行下载</p>
            <button
              onClick={() => open(ANIMA_MODELS_URL)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] hover:border-[var(--accent-1)]/40 transition-colors cursor-pointer text-left"
            >
              <ExternalLink size={16} className="text-[var(--accent-2)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[var(--text-primary)]">从 HuggingFace 下载 Anima 模型</p>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">huggingface.co/circlestone-labs/Anima</p>
              </div>
            </button>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={runEnvCheck}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] hover:opacity-90 transition-all cursor-pointer"
            >
              <RefreshCw size={15} /> 我已下载，重新检测
            </button>
            <button
              onClick={onComplete}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer px-4 py-2.5"
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {phase === 'testing' && (
        <div className="text-center py-4">
          <Loader2 size={48} className="text-[var(--accent-1)] animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">正在测试生成...</h3>
          <p className="text-sm text-[var(--text-secondary)]">用一张简单图片验证你的环境</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="text-center py-4 animate-in zoom-in-95 duration-400">
          {testImage && (
            <img
              src={testImage}
              className="w-48 h-48 object-cover rounded-2xl mx-auto mb-4 border-2 border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]"
              alt="test result"
            />
          )}
          <CheckCircle2 size={48} className="text-green-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] mb-2">
            环境就绪！
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6">一切配置完成，可以开始创作了</p>
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-[15px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_25px_rgba(var(--accent-1-rgb),0.4)] hover:shadow-[0_0_35px_rgba(var(--accent-1-rgb),0.6)] hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
          >
            进入詠唱机 <ArrowRight size={18} />
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="py-4 animate-in zoom-in-95 duration-300">
          <div className="text-center mb-5">
            <XCircle size={48} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">测试未通过</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">{errorMsg}</p>
          </div>
          <div className="mb-5">
            <HelpCard />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={runTestGeneration}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] hover:opacity-90 transition-all cursor-pointer"
            >
              <RefreshCw size={15} /> 重试
            </button>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-[var(--text-secondary)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all cursor-pointer"
            >
              返回检查
            </button>
            <button
              onClick={onComplete}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer px-4 py-2.5"
            >
              跳过
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================ Check Row ============================

function CheckRow({ label, status, detail }: { label: string; status: CheckStatus; detail?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-layer-2)] border border-[var(--glass-border)]">
      <div className="flex-shrink-0">
        {status === 'checking' && <Loader2 size={18} className="text-[var(--accent-1)] animate-spin" />}
        {status === 'pass' && <CheckCircle2 size={18} className="text-green-400" />}
        {status === 'fail' && <XCircle size={18} className="text-red-400" />}
        {status === 'pending' && <div className="w-[18px] h-[18px] rounded-full border-2 border-yellow-500/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-bold text-[var(--text-primary)]">{label}</span>
        {detail && <span className="text-[11px] text-[var(--text-secondary)] ml-2">{detail}</span>}
      </div>
    </div>
  );
}
