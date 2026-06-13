import { useEffect, useState } from "react";
import { X, ImageIcon, Sparkles } from "lucide-react";
import { useQueueStore, type CompletionNotification } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { convertFileSrc } from "@tauri-apps/api/core";

function ToastItem({ item }: { item: CompletionNotification }) {
  const dismissNotification = useQueueStore((s) => s.dismissNotification);
  const privacyMode = useSettingsStore((s) => s.settings.privacyMode);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => dismissNotification(item.id), 400);
    }, 8000);
    return () => clearTimeout(timer);
  }, [item.id, dismissNotification]);

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(() => dismissNotification(item.id), 400);
  };

  return (
    <div
      className={`bg-[var(--glass-bg)] backdrop-blur-xl border border-green-500/30 rounded-2xl p-3 flex items-center gap-3 shadow-[0_8px_30px_rgba(34,197,94,0.15)] min-w-[320px] max-w-[420px] transition-all duration-400 transform origin-bottom-left ${
        leaving ? "opacity-0 translate-y-4 scale-95" : "opacity-100 translate-y-0 scale-100"
      }`}
    >
      <div className="flex-shrink-0 relative">
        {item.images?.[0] ? (
          <img
            src={item.images[0].startsWith('http') ? item.images[0] : convertFileSrc(item.images[0])}
            className={`w-14 h-14 rounded-xl object-cover border-2 border-green-500/30 shadow-md transition-all duration-300 ${privacyMode ? "blur-md hover:blur-none" : ""}`}
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-green-500/10 border-2 border-green-500/20 flex items-center justify-center">
            <ImageIcon size={20} className="text-green-400" />
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-[var(--glass-bg)]">
          <Sparkles size={10} className="text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-[var(--text-primary)] truncate">{item.projectTitle}</p>
        <p className="text-[10px] text-green-400 font-medium mt-0.5">
          已生成完成 · {item.images?.length || 0} 张图片
        </p>
      </div>

      <button
        onClick={handleDismiss}
        className="flex-shrink-0 w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function CompletionToast() {
  const notifications = useQueueStore((s) => s.completedNotifications);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-10 left-48 z-50 flex flex-col-reverse gap-2 pointer-events-none max-h-[80vh] overflow-hidden">
      {notifications.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItem item={item} />
        </div>
      ))}
    </div>
  );
}
