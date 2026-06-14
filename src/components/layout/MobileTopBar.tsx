import { Settings, Sparkles } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export function MobileTopBar() {
  const location = useLocation();
  
  // Simple mapping to get a nice title
  let title = "詠唱机";
  if (location.pathname.startsWith('/prompts')) title = "提示词";
  if (location.pathname.startsWith('/generate')) title = "生成";
  if (location.pathname.startsWith('/history')) title = "生成历史";
  if (location.pathname.startsWith('/vault')) title = "典藏库";
  if (location.pathname.startsWith('/settings')) title = "设置";

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--glass-border)] z-40 sticky top-0 pb-3 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-[var(--accent-1)]" />
        <h1 className="text-sm font-bold text-[var(--text-primary)] tracking-wider">
          {title} <span className="text-[10px] text-[var(--text-muted)] font-normal uppercase tracking-widest ml-1">Eishougi</span>
        </h1>
      </div>

      <Link to="/settings" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors">
        <Settings size={16} />
      </Link>
    </div>
  );
}
