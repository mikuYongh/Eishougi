import { Sparkles, Activity, Server, Image as ImageIcon, Search, MessageSquare, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";

export function StatusBar() {
  const { jobs, isConnected } = useQueueStore();
  
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const generatingJobs = jobs.filter(j => j.status === 'generating');
  const activeCount = pendingJobs.length + generatingJobs.length;
  return (
    <div
      className="h-[var(--spacing-statusbar-h)] flex-shrink-0 flex items-center gap-4 px-4 text-[11px] relative z-20 bg-[var(--glass-bg)] text-[var(--text-muted)] border-t border-[var(--glass-border)]"
      style={{
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="flex items-center gap-3 flex-1 font-medium tracking-wide">
        {/* Connection Status with Tooltip */}
        <div className="group relative flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--glass-border)] border border-[var(--glass-border)] cursor-pointer hover:bg-[var(--glass-border-active)] transition-colors">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: "#4CAF50", boxShadow: "0 0 8px #4CAF50" }} />
          <span className="text-[var(--text-secondary)]">127.0.0.1:8188</span>
          
          {/* Tooltip Popup */}
          <div className="absolute bottom-full left-0 mb-2 w-52 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-2 group-hover:translate-y-0">
            <div 
              className="p-3 rounded-xl flex flex-col gap-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              style={{
                background: "var(--bg-layer-1)",
                backdropFilter: "blur(16px)",
                border: "1px solid var(--glass-border)",
              }}
            >
              <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Server size={10} /> 服务连接状态
              </div>
              
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <ImageIcon size={12} className="text-[var(--accent-1)]" />
                  <span>ComfyUI 生图</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${isConnected ? 'bg-green-500 text-green-500' : 'bg-red-500 text-red-500'}`} />
                  <span className={`text-[10px] ${isConnected ? 'text-green-400' : 'text-red-400'}`}>{isConnected ? '已连接' : '未连接'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[var(--text-primary)]">
                <div className="flex items-center gap-1.5">
                  <Search size={12} className="text-[var(--accent-2)]" />
                  <span>WD14 反推</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#4CAF50]" />
                  <span className="text-[10px] text-green-400">已连接</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[var(--text-primary)]">
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
        <span className="w-px h-3" style={{ background: "var(--glass-border)" }} />
        
        <div className="group relative flex items-center gap-1.5 px-2 py-0.5 rounded border border-transparent cursor-pointer hover:bg-[var(--glass-border)] hover:border-[var(--glass-border)] transition-colors">
          <Activity size={12} className={`transition-colors ${activeCount > 0 ? 'text-[var(--accent-1)] animate-pulse' : 'text-[var(--text-muted)] group-hover:text-[var(--accent-1)]'}`} />
          <span className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">队列: {activeCount} 个任务</span>
          
          {/* Tooltip Popup */}
          <div className="absolute bottom-full left-0 mb-2 w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-2 group-hover:translate-y-0">
            <div 
              className="p-3 rounded-xl flex flex-col gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.4)] max-h-80 overflow-y-auto scrollbar-thin"
              style={{
                background: "var(--bg-layer-1)",
                backdropFilter: "blur(16px)",
                border: "1px solid var(--glass-border)",
              }}
            >
              <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Activity size={10} /> 任务队列</span>
                {jobs.length > 0 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); useQueueStore.getState().clearCompleted(); }}
                    className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    清除已完成
                  </button>
                )}
              </div>
              
              {jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-8 h-8 rounded-full bg-[var(--glass-border)] flex items-center justify-center mb-2">
                    <Sparkles size={14} className="text-[var(--text-muted)]" />
                  </div>
                  <span className="text-[var(--text-secondary)] text-xs">当前队列为空</span>
                  <span className="text-[var(--text-muted)] text-[9px] mt-1">随时准备接受生成指令</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {jobs.map(job => (
                    <div key={job.id} className="bg-[var(--glass-bg)] p-2 rounded-lg border border-[var(--glass-border)] flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-primary)] truncate pr-2 font-medium">{job.projectTitle}</span>
                        {job.status === 'pending' && <span className="text-[9px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">排队中</span>}
                        {job.status === 'generating' && (
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-[var(--accent-2)] bg-[var(--accent-2)]/10 px-1.5 py-0.5 rounded flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> {job.progress}%</span>
                            <button onClick={(e) => { e.stopPropagation(); useQueueStore.getState().interruptJob(); }} className="text-red-500 hover:text-red-400 p-1 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors" title="强制停止">
                              <div className="w-2 h-2 bg-current rounded-sm" />
                            </button>
                          </div>
                        )}
                        {job.status === 'completed' && <span className="text-[9px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle2 size={8} /> 完成</span>}
                        {job.status === 'failed' && <span className="text-[9px] text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded flex items-center gap-1"><XCircle size={8} /> 失败</span>}
                      </div>
                      {job.status === 'generating' && job.node && (
                        <div className="w-full bg-[var(--glass-border)] h-1 rounded-full overflow-hidden">
                          <div className="bg-[var(--accent-2)] h-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                        </div>
                      )}
                      {job.status === 'failed' && (
                        <div className="text-[9px] text-red-500/70 truncate">{job.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <Sparkles size={12} className="text-[var(--accent-1)]" />
        <span className="font-bold tracking-widest text-[9px] uppercase">詠唱机 EISHOUGI v0.1</span>
      </div>
    </div>
  );
}
