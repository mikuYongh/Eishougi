import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw, Download, CheckCircle2, Sparkles, AlertCircle, Loader2, Smartphone, Monitor,
} from "lucide-react";
import type { UpdateInfo } from "../../hooks/useUpdateCheck";
import { useAppVersion } from "../../hooks/useAppVersion";
import { toast } from "sonner";

/**
 * Update panel shown in Settings → 关于. Mirrors the McpServerPanel pattern: a self-contained
 * glass panel that runs its own check state and drives the install (Tauri Updater on desktop,
 * custom APK download+install on Android).
 *
 * Visual style matches the rest of the app: accent-1→accent-2 gradients, glass-panel card,
 * hairline + glow accents at the top, animate-in transitions, a shimmering progress bar.
 */
export function UpdatePanel() {
  const appVersion = useAppVersion();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100, for APK download
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const result = await invoke<UpdateInfo>("check_for_updates");
      setInfo(result);
      if (result.error) toast.error(`检查更新失败：${result.error}`);
    } catch (e: any) {
      toast.error(`检查失败：${e?.message || e}`);
    } finally {
      setChecking(false);
    }
  }, []);

  // Auto-check once on mount so the panel shows the right state without a click.
  useEffect(() => {
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Desktop install: Tauri Updater plugin (signature-verified, passive installer) ----
  const installDesktop = useCallback(async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        toast.info("已是最新版本");
        setInstalling(false);
        return;
      }
      setInstallMsg("正在下载更新…");
      let received = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            break;
          case "Progress":
            received += event.data.chunkLength;
            if (total > 0) setProgress(Math.min(100, Math.round((received / total) * 100)));
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      setInstallMsg("下载完成，即将重启安装…");
      toast.success("更新下载完成，应用将重启以完成安装");
      // Note: on Windows the updater's downloadAndInstall prompts the user to restart itself;
      // we don't auto-relaunch to avoid pulling in the plugin-process dependency.
    } catch (e: any) {
      setInstallMsg(null);
      toast.error(`更新失败：${e?.message || e}`);
    } finally {
      setInstalling(false);
    }
  }, []);

  // ---- Android install: download APK ourselves, then hand to system installer ----
  const installAndroid = useCallback(
    async (url: string) => {
      if (!url) {
        toast.error("没有可用的下载地址");
        return;
      }
      setInstalling(true);
      setProgress(0);
      setInstallMsg("正在下载安装包…");
      try {
        // The backend downloads to app_data_dir/updates and triggers the installer.
        await invoke("download_and_install_apk", { url });
        setProgress(100);
        setInstallMsg("已下载，请在弹出的系统安装器中确认安装");
        toast.success("下载完成，请在系统提示中安装");
      } catch (e: any) {
        setInstallMsg(null);
        toast.error(`下载失败：${e?.message || e}`);
      } finally {
        setInstalling(false);
      }
    },
    []
  );

  const handleInstall = () => {
    if (!info) return;
    if (info.isMobile && info.downloadUrl) {
      installAndroid(info.downloadUrl);
    } else {
      installDesktop();
    }
  };

  const hasUpdate = info?.hasUpdate === true;
  const checkedAndLatest = info && !info.hasUpdate && !info.error;

  return (
    <div className="glass-panel p-6 relative overflow-hidden">
      {/* Top hairline + accent glow (mirrors LoraPickerModal) */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-1)]/50 to-transparent pointer-events-none" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-24 bg-[var(--accent-1)]/15 blur-[50px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5 relative">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border ${hasUpdate ? "bg-[var(--accent-1)]/15 border-[var(--accent-1)]/30 text-[var(--accent-1)]" : "bg-[var(--bg-layer-2)] border-[var(--glass-border)] text-[var(--text-secondary)]"}`}>
            {hasUpdate ? <Sparkles size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              软件更新
              {info?.isMobile !== undefined && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-layer-2)] px-1.5 py-0.5 rounded-md border border-[var(--glass-border)]">
                  {info.isMobile ? <><Smartphone size={10} /> Android</> : <><Monitor size={10} /> 桌面端</>}
                </span>
              )}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">检查并安装最新版本</p>
          </div>
        </div>
        {/* Status pill */}
        {hasUpdate && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--accent-1)]/15 text-[var(--accent-1)] border border-[var(--accent-1)]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-1)] animate-pulse" />
            新版本 v{info?.latestVersion}
          </span>
        )}
        {checkedAndLatest && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
            <CheckCircle2 size={10} /> 已是最新
          </span>
        )}
      </div>

      {/* Version display */}
      <div className="flex items-end gap-3 mb-5">
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mb-1">当前版本</div>
          <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] leading-none">
            v{appVersion}
          </div>
        </div>
        {hasUpdate && info?.latestVersion && (
          <>
            <div className="pb-1 text-[var(--text-secondary)]">→</div>
            <div>
              <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mb-1">最新版本</div>
              <div className="text-2xl font-bold text-[var(--accent-1)] leading-none">
                v{info.latestVersion}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Update notes / changelog */}
      {hasUpdate && info?.notes && (
        <div className="mb-5 p-3 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] max-h-40 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">更新内容</div>
          <p className="text-[12px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{info.notes}</p>
        </div>
      )}

      {/* Progress bar (installing) */}
      {installing && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> {installMsg || "处理中…"}
            </span>
            <span className="text-[11px] font-mono font-bold text-[var(--accent-1)]">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg-layer-2)] overflow-hidden border border-[var(--glass-border)]">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] rounded-full shadow-[0_0_12px_rgba(var(--accent-1-rgb),0.6)] transition-all duration-300"
              style={{ width: `${progress || (installMsg ? 100 : 8)}%` }}
            />
          </div>
        </div>
      )}

      {/* Install complete hint (Android) */}
      {!installing && installMsg && (
        <div className="mb-5 p-3 rounded-xl bg-[var(--accent-1)]/8 border border-[var(--accent-1)]/25 flex items-start gap-2.5">
          <Sparkles size={15} className="text-[var(--accent-1)] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--text-primary)] leading-relaxed">{installMsg}</p>
        </div>
      )}

      {/* Error state */}
      {info?.error && !installing && (
        <div className="mb-5 p-3 rounded-xl bg-red-500/8 border border-red-500/20 flex items-start gap-2.5">
          <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-red-400 font-bold mb-0.5">检查更新失败</p>
            <p className="text-[11px] text-[var(--text-secondary)]">{info.error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {hasUpdate && !installing && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.5)] hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Download size={15} /> 立即更新
          </button>
        )}
        {!hasUpdate && (
          <button
            onClick={runCheck}
            disabled={checking}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-[var(--text-primary)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all cursor-pointer disabled:opacity-50"
          >
            {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {checking ? "检查中…" : "检查更新"}
          </button>
        )}
        {hasUpdate && (
          <button
            onClick={runCheck}
            disabled={checking || installing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-[var(--text-secondary)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> 重新检查
          </button>
        )}
      </div>
    </div>
  );
}
