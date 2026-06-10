import { Sparkles, FolderUp, PenSquare, FileText, Star, Zap, Paintbrush, Rocket, RefreshCw, Save, Clock, Image as ImageIcon, Activity } from "lucide-react";

export function Dashboard() {
  return (
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-6 px-1">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-pink-400" />
            <h2 className="text-2xl font-bold text-white drop-shadow-md">欢迎回来</h2>
          </div>
          <p className="text-sm mt-1 text-white/60 font-medium">今天已生成 0 张图</p>
        </div>
        <div className="flex gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border transition-all duration-300 hover:scale-105 hover:bg-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              borderColor: "rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <FolderUp size={16} />
            导入
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all duration-300 hover:scale-105 shadow-[0_4px_15px_rgba(255,107,157,0.4)] hover:shadow-[0_6px_20px_rgba(255,107,157,0.6)] text-white"
            style={{
              background: "linear-gradient(135deg, #FF6B9D, #B388FF)",
              border: "1px solid rgba(255,255,255,0.2)"
            }}
          >
            <PenSquare size={16} />
            新建提示词
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { icon: <FileText size={24} />, num: "--", lbl: "提示词总数" },
          { icon: <Star size={24} />, num: "--", lbl: "收藏提示词" },
          { icon: <Zap size={24} />, num: "--", lbl: "工作流数量" },
          { icon: <Paintbrush size={24} />, num: "--", lbl: "总生成次数" },
        ].map((s, i) => (
          <div key={i} className="glass-panel p-5 relative overflow-hidden group transition-transform duration-300 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent rounded-full -translate-y-16 translate-x-16 blur-2xl group-hover:scale-110 transition-transform" />
            <span className="text-white/80 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{s.icon}</span>
            <div
              className="text-3xl font-extrabold mt-3 drop-shadow-lg"
              style={{
                background: "linear-gradient(135deg, #FF6B9D, #B388FF)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {s.num}
            </div>
            <p className="text-xs font-semibold mt-1 text-white/50">{s.lbl}</p>
          </div>
        ))}
      </div>

      {/* RowLayout: Recent Prompts & Queue Preview */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Recent Prompts */}
        <div className="glass-panel p-5 flex flex-col min-h-[240px]">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <div className="text-[13px] font-bold flex items-center gap-2 text-white/90">
              <Clock size={16} className="text-blue-400" />
              最近使用的提示词
            </div>
            <button className="text-[11px] text-white/40 hover:text-white transition-colors cursor-pointer">查看全部</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {[
              { title: "赛博朋克城市", type: "正向", time: "10分钟前" },
              { title: "极致画质包", type: "正向", time: "2小时前" },
              { title: "基础防崩坏负向", type: "负向", time: "昨天" },
              { title: "机甲少女", type: "正向", time: "昨天" },
            ].map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${p.type === '正向' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    <FileText size={14} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-white/80 group-hover:text-white transition-colors">{p.title}</h4>
                    <p className="text-[10px] text-white/40">{p.time}</p>
                  </div>
                </div>
                <button className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded bg-white/10 text-[10px] font-bold text-white hover:bg-white/20 transition-all">
                  送入生成器
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Queue Preview */}
        <div className="glass-panel p-5 flex flex-col min-h-[240px]">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <div className="text-[13px] font-bold flex items-center gap-2 text-white/90">
              <Activity size={16} className="text-orange-400" />
              当前生成队列
            </div>
            <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/20">
              2 个任务进行中
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cGF0aCBkPSJNMCAwTDggOFYwSDBaIiBmaWxsPSJyZ2JhKDI1NSwxNzEsNjQsMC4xKSIvPgo8L3N2Zz4=')] bg-repeat opacity-50 animate-[slide_1s_linear_infinite]" />
              <div className="relative z-10 flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-orange-400 flex items-center gap-1.5">
                  <RefreshCw size={12} className="animate-spin" /> 正在渲染: 图生视频
                </span>
                <span className="text-[11px] font-mono text-white/60">45%</span>
              </div>
              <div className="relative z-10 w-full h-1 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400 w-[45%]" />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon size={14} className="text-white/30" />
                <span className="text-[12px] font-bold text-white/60">等待中: 文生图 (SDXL)</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">排队 #1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="glass-panel p-6">
        <div className="text-sm font-bold mb-4 flex items-center gap-2 text-white/90">
          <Rocket size={16} className="text-purple-400" /> 
          快捷操作
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: <Rocket size={28} />, label: "一键生图", desc: "当前提示词+模型" },
            { icon: <RefreshCw size={28} />, label: "反推提示词", desc: "从图片反推WD14" },
            { icon: <FolderUp size={28} />, label: "导入工作流", desc: "加载ComfyUI JSON" },
            { icon: <Save size={28} />, label: "导出备份", desc: "JSON全量备份" },
          ].map((a, i) => (
            <div
              key={i}
              className="glass-panel p-4 text-center cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(179,136,255,0.2)] group"
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <span className="flex justify-center text-white/60 mb-3 group-hover:text-pink-400 transition-colors group-hover:scale-110 duration-300 drop-shadow-[0_0_8px_rgba(255,107,157,0)] group-hover:drop-shadow-[0_0_8px_rgba(255,107,157,0.5)]">
                {a.icon}
              </span>
              <div className="text-[13px] font-bold text-white/90">{a.label}</div>
              <div className="text-[11px] mt-1 text-white/40 font-medium">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
