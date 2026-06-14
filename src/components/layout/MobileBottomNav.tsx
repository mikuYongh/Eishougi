import { useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Sparkles, FolderHeart, Clock, Bot, Loader2 } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { useQueueStore } from "../../stores/queueStore";

export function MobileBottomNav() {
  const location = useLocation();
  const path = location.pathname;
  const toggleMobileAgent = useAgentStore(state => state.toggleMobileAgent);
  const isGenerating = useAgentStore(state => state.isGenerating);
  const { jobs } = useQueueStore();
  
  const activeJobsCount = jobs.filter(j => j.status === 'pending' || j.status === 'generating').length;

  const isActive = (p: string) => path === p || path.startsWith(p + '/');

  return (
    <div className="fixed left-4 right-4 z-50 pb-[env(safe-area-inset-bottom)] bottom-4">
      {/* Glassmorphism Capsule */}
      <div className="bg-[var(--glass-bg)]/90 backdrop-blur-3xl border border-[var(--glass-border)] rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-1.5 flex items-center justify-between">
        
        {/* Left Links */}
        <div className="flex flex-1 justify-around">
          <Link to="/" className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${path === '/' ? 'text-[var(--accent-1)] scale-110' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <LayoutDashboard size={18} />
            <span className="text-[8px] font-bold">主页</span>
          </Link>
          <Link to="/generate" className={`relative flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${isActive('/generate') ? 'text-[var(--accent-1)] scale-110' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <Sparkles size={18} />
            {activeJobsCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 text-white text-[8px] font-bold flex items-center justify-center shadow-[0_0_10px_#22c55e]">
                {activeJobsCount}
              </span>
            )}
            <span className="text-[8px] font-bold">创作</span>
          </Link>
        </div>

        {/* Center Agent Orb */}
        <div className="relative -top-5 mx-2 flex items-center justify-center">
          {isGenerating && (
            <div className="absolute inset-[-8px] rounded-full border-2 border-[var(--accent-1)] opacity-50 animate-ping z-0" />
          )}
          
          {/* Glass Halo / Gaussian Blur Ring */}
          <div className="absolute inset-[-6px] rounded-full bg-[var(--glass-bg)]/60 backdrop-blur-xl border border-[var(--glass-border)] shadow-xl z-0" />

          <button 
            onClick={() => toggleMobileAgent()}
            className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 ${isGenerating ? 'bg-gradient-to-br from-[var(--accent-1)]/80 to-[var(--accent-2)]/80 shadow-[0_0_25px_rgba(var(--accent-1-rgb),0.8)] shadow-[var(--accent-1)] animate-pulse' : 'bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] shadow-[0_0_25px_rgba(var(--accent-1-rgb),0.6)]'}`}
          >
            {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Bot size={24} className="animate-pulse" />}
          </button>
        </div>

        {/* Right Links */}
        <div className="flex flex-1 justify-around">
          <Link to="/history" className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${isActive('/history') ? 'text-[var(--accent-1)] scale-110' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <Clock size={18} />
            <span className="text-[8px] font-bold">历史</span>
          </Link>
          <Link to="/vault" className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${isActive('/vault') ? 'text-[var(--accent-1)] scale-110' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <FolderHeart size={18} />
            <span className="text-[8px] font-bold">典藏库</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
