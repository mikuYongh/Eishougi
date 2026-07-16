import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";

type ConfirmTone = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  confirmText?: string;
  confirmTextPlaceholder?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const toneConfig: Record<ConfirmTone, { icon: typeof AlertTriangle; accent: string; button: string }> = {
  danger: {
    icon: AlertTriangle,
    accent: "text-red-400 bg-red-500/15 border-red-500/30",
    button: "bg-red-500 hover:bg-red-400 shadow-[0_0_24px_rgba(239,68,68,0.25)]",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-amber-300 bg-amber-400/15 border-amber-400/30",
    button: "bg-amber-400 hover:bg-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.25)]",
  },
  info: {
    icon: Info,
    accent: "text-[var(--accent-1)] bg-[var(--accent-1)]/15 border-[var(--accent-1)]/30",
    button: "bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_24px_rgba(var(--accent-1-rgb),0.25)]",
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "warning",
  busy = false,
  confirmText,
  confirmTextPlaceholder = "输入确认文字",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  const [confirmationValue, setConfirmationValue] = useState("");
  const config = toneConfig[tone];
  const Icon = config.icon;
  const canConfirm = !confirmText || confirmationValue === confirmText;

  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    if (open) setConfirmationValue("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (confirmText) confirmationInputRef.current?.focus();
      else cancelRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onCancelRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, confirmText]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-md" aria-label="关闭确认框" onClick={() => !busy && onCancel()} />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--bg-layer-1)]/95 shadow-[0_24px_100px_rgba(0,0,0,0.55)] animate-in fade-in zoom-in-95 duration-200">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-1)] to-transparent" />
        <div className="flex items-start gap-4 p-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${config.accent}`}>
            <Icon size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 id="confirm-dialog-title" className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
              <button ref={cancelRef} onClick={onCancel} disabled={busy} className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40" aria-label="取消">
                <X size={17} />
              </button>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          </div>
        </div>
        {confirmText && (
          <div className="px-6 pb-5">
            <label className="mb-1.5 block text-[11px] font-bold text-[var(--text-secondary)]">请输入确认文字：{confirmText}</label>
            <input
              ref={confirmationInputRef}
              value={confirmationValue}
              placeholder={confirmTextPlaceholder}
              className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-red-400/60"
              onChange={(event) => setConfirmationValue(event.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--glass-border)] bg-[var(--glass-bg)]/40 p-4 sm:flex-row sm:justify-end">
          <button onClick={onCancel} disabled={busy} className="rounded-xl border border-[var(--glass-border)] px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy || !canConfirm} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${config.button}`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : canConfirm ? <CheckCircle2 size={15} /> : null}
            {busy ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
