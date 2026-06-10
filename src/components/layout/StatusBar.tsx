import { Sparkles, Activity, Server, Image as ImageIcon, Search, MessageSquare } from "lucide-react";

export function StatusBar() {
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
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#4CAF50]" />
                  <span className="text-[10px] text-green-400">已连接</span>
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
        
        {/* Queue Status with Tooltip */}
        <div className="group relative flex items-center gap-1.5 px-2 py-0.5 rounded border border-transparent cursor-pointer hover:bg-white/5 hover:border-white/5 transition-colors">
          <Activity size={12} className="text-white/40 group-hover:text-pink-400 transition-colors" />
          <span className="text-white/60 group-hover:text-white/90 transition-colors">队列: 0 个任务</span>
          
          {/* Tooltip Popup */}
          <div className="absolute bottom-full left-0 mb-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-2 group-hover:translate-y-0">
            <div 
              className="p-3 rounded-xl flex flex-col gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              style={{
                background: "rgba(20, 15, 30, 0.85)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Activity size={10} /> 任务队列
              </div>
              
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-2">
                  <Sparkles size={14} className="text-white/30" />
                </div>
                <span className="text-white/60 text-xs">当前队列为空</span>
                <span className="text-white/30 text-[9px] mt-1">随时准备接受生成指令</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-white/40">
        <Sparkles size={12} className="text-pink-400" />
        <span className="font-bold tracking-widest text-[9px] uppercase">Prompt Muse v0.1</span>
      </div>
    </div>
  );
}
