import { NAV_ITEMS } from "../../lib/constants";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Menu } from "lucide-react";
import { useNavStore } from "../../stores/navStore";
import { useQueueStore } from "../../stores/queueStore";

export function TopBar() {
  const location = useLocation();
  const toggleSidebar = useNavStore((state) => state.toggleSidebar);
  const navigate = useNavigate();
  const activeCount = useQueueStore(state => state.jobs.filter(job => job.status === "pending" || job.status === "generating").length);
  const currentNav = NAV_ITEMS.find((n) => {
    if (n.path === "/") return location.pathname === "/";
    return location.pathname.startsWith(n.path);
  });

  return (
    <div
      className="h-14 flex-shrink-0 flex items-center gap-3 px-6 relative z-10"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px)",
        borderBottom: "1px solid var(--glass-border)",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
      }}
    >
      <div className="flex items-center gap-2 text-[var(--text-primary)]">
        <button
          onClick={toggleSidebar}
          className="p-1.5 mr-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center text-[var(--text-secondary)] hover:text-white"
        >
          <Menu size={18} />
        </button>
        <span className="opacity-80">
          {currentNav?.icon}
        </span>
        <span className="text-sm font-bold tracking-wide">
          {currentNav?.label ?? ""}
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/prompts/new")} className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[var(--accent-1)]/40 hover:text-[var(--text-primary)]">
          <Sparkles size={14} className="text-[var(--accent-1)]" /> 开始创作
        </button>
        <button onClick={() => navigate("/history")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[var(--accent-2)]/40 hover:text-[var(--text-primary)]">
          <span className={`h-1.5 w-1.5 rounded-full ${activeCount > 0 ? "animate-pulse bg-orange-400" : "bg-[var(--text-muted)]"}`} />
          {activeCount > 0 ? `${activeCount} 个任务` : "历史记录"}
        </button>
      </div>
    </div>
  );
}
