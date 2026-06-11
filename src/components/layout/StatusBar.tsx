import { Sparkles, Activity, Server, Image as ImageIcon, Search, MessageSquare, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";

export function StatusBar() {
  const { jobs, isConnected } = useQueueStore();
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const generatingJobs = jobs.filter(j => j.status === 'generating');
  const activeCount = pendingJobs.length + generatingJobs.length;
  return (
    <div
      className="h-[var(--spacing-statusbar-h)] flex-shrink-0 flex items-center gap-4 px-4 text-[11px] relative z-20 bg-black/40 text-white/50 border-t border-white/10"
      style={{
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="flex items-center gap-3 flex-1 font-medium tracking-wide">
        {/* Connection Status with Tooltip */}
        <div className="group relative flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: "#4CAF50", boxShadow: "0 0 8px #4CAF50" }} />
          <span className="text-white/70">127.0.0.1:8188</span>
          
          {/* Tooltip Popup */}
          <div className="absolute bottom-full left-0 mb-2 w-52 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-2 group-hover:translate-y-0">
            <div 
              className="p-3 rounded-xl flex flex-col gap-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              style={{
                background: "rgba(20, 15, 30, 0.85)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Server size={10} /> 服务连接状态
              </div>
              
              <div className="flex items-center justify-between text-white/80">
                <div className="flex items-center gap-1.5">
                  <ImageIcon size={12} className="text-pink-400" />
                  <span>ComfyUI 生图</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${isConnected ? 'bg-green-500 text-green-500' : 'bg-red-500 text-red-500'}`} />
                  <span className={`text-[10px] ${isConnected ? 'text-green-400' : 'text-red-400'}`}>{isConnected ? '已连接' : '未连接'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-white/80">
                <div className="flex items-center gap-1.5">
                  <Search size={12} className="text-purple-400" />
                  <span>WD14 反推</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#4CAF50]" />
                  <span className="text-[10px] text-green-400">已连接</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-white/80">
                <div className="flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-blue-400" />
                  <span>LLM 大模型</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#4CAF50]" />
                  <span className="text-[10px] text-green-400">已连接</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <span className="w-px h-3" style={{ background: "rgba(255,255,255,0.1)" }} />
        
        <div className="group relative flex items-center gap-1.5 px-2 py-0.5 rounded border border-transparent cursor-pointer hover:bg-white/5 hover:border-white/5 transition-colors">
          <Activity size={12} className={`transition-colors ${activeCount > 0 ? 'text-pink-400 animate-pulse' : 'text-white/40 group-hover:text-pink-400'}`} />
          <span className="text-white/60 group-hover:text-white/90 transition-colors">队列: {activeCount} 个任务</span>
          
          {/* Tooltip Popup */}
          <div className="absolute bottom-full left-0 mb-2 w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-2 group-hover:translate-y-0">
            <div 
              className="p-3 rounded-xl flex flex-col gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.4)] max-h-80 overflow-y-auto scrollbar-thin"
              style={{
                background: "rgba(20, 15, 30, 0.95)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Activity size={10} /> 任务队列</span>
                {jobs.length > 0 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); useQueueStore.getState().clearCompleted(); }}
                    className="text-white/30 hover:text-white/70 transition-colors"
                  >
                    清除已完成
                  </button>
                )}
              </div>
              
              {jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <Sparkles size={14} className="text-white/30" />
                  </div>
                  <span className="text-white/60 text-xs">当前队列为空</span>
                  <span className="text-white/30 text-[9px] mt-1">随时准备接受生成指令</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {jobs.map(job => (
                    <div key={job.id} className="bg-black/30 p-2 rounded-lg border border-white/5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/90 truncate pr-2 font-medium">{job.projectTitle}</span>
                        {job.status === 'pending' && <span className="text-[9px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">排队中</span>}
                        {job.status === 'generating' && <span className="text-[9px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> {job.progress}%</span>}
                        {job.status === 'completed' && <span className="text-[9px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle2 size={8} /> 完成</span>}
                        {job.status === 'failed' && <span className="text-[9px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded flex items-center gap-1"><XCircle size={8} /> 失败</span>}
                      </div>
                      {job.status === 'generating' && job.node && (
                        <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                          <div className="bg-blue-400 h-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                        </div>
                      )}
                      {job.status === 'failed' && (
                        <div className="text-[9px] text-red-400/70 truncate">{job.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-white/40">
        <Sparkles size={12} className="text-pink-400" />
        <span className="font-bold tracking-widest text-[9px] uppercase">詠唱机 EISHOUGI v0.1</span>
      </div>
    </div>
  );
}
