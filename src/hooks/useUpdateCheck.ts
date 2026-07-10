import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

/** Result shape returned by the backend `check_for_updates` command. */
export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string | null;
  currentVersion: string;
  notes: string | null;
  pubDate: string | null;
  downloadUrl: string | null;
  signature: string | null;
  isMobile: boolean;
  error: string | null;
}

const LAST_NOTIFY_KEY = "last_update_notify_ts";
const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h — don't nag the user about the same release.

/**
 * App-startup update check. Runs once a few seconds after mount, fetches the latest manifest via
 * the backend, and — if a newer version exists AND we haven't notified in the last 24h — pops a
 * sonner toast with a "查看" action that the host can wire to open the update panel.
 *
 * Returns `triggerManualCheck` so the Settings update panel can re-run the check on demand (that
 * path bypasses the cooldown and the toast — the panel shows its own result).
 */
export function useUpdateCheck(onViewUpdate?: () => void) {
  const [lastResult, setLastResult] = useState<UpdateInfo | null>(null);

  const runCheck = useCallback(async (): Promise<UpdateInfo | null> => {
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setLastResult(info);
      return info;
    } catch (e: any) {
      console.warn("[Update] check failed:", e);
      return null;
    }
  }, []);

  // Manual check (from the Settings panel) — always runs, no toast, returns the raw result.
  const triggerManualCheck = useCallback(async () => {
    return runCheck();
  }, [runCheck]);

  // Silent startup check + conditional toast. Called once from App.tsx.
  const silentCheckOnStartup = useCallback(async () => {
    const info = await runCheck();
    if (!info || !info.hasUpdate) return;

    // Cooldown: skip the toast if we already notified about an update within 24h.
    const lastNotify = Number(localStorage.getItem(LAST_NOTIFY_KEY) || "0");
    if (Date.now() - lastNotify < NOTIFY_COOLDOWN_MS) return;

    localStorage.setItem(LAST_NOTIFY_KEY, String(Date.now()));
    toast(`✨ 发现新版本 v${info.latestVersion}`, {
      description: info.notes ? info.notes.slice(0, 120) : "点击查看更新内容",
      duration: 10000,
      action: onViewUpdate
        ? { label: "查看", onClick: () => onViewUpdate() }
        : undefined,
    });
  }, [runCheck, onViewUpdate]);

  return { lastResult, triggerManualCheck, silentCheckOnStartup };
}
