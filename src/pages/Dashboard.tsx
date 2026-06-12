import { Sparkles, PenSquare, FileText, Star, Zap, Paintbrush, Rocket, RefreshCw, FolderUp, Clock, Image as ImageIcon, Activity, Play, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { usePromptStore } from "../stores/promptStore";
import { useWorkflowStore } from "../stores/workflowStore";
import { useQueueStore } from "../stores/queueStore";
import { useSettingsStore } from "../stores/settingsStore";

export function Dashboard() {
  const navigate = useNavigate();
  const prompts = usePromptStore(state => state.prompts);
  const fetchPrompts = usePromptStore(state => state.fetchPrompts);
  const workflows = useWorkflowStore(state => state.workflows);
  const fetchWorkflows = useWorkflowStore(state => state.fetchWorkflows);
  const { jobs, isConnected, connect } = useQueueStore();
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);

  const [totalGenerated, setTotalGenerated] = useState(0);
  const [todayGenerated, setTodayGenerated] = useState(0);
  const [recentImages, setRecentImages] = useState<any[]>([]);

  useEffect(() => {
    fetchPrompts();
    fetchWorkflows();
    connect();
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await invoke<any[]>('list_generated_images');
      const completed = data.filter(d => d.status === 'completed');
      setTotalGenerated(completed.length);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      setTodayGenerated(completed.filter(d => d.createdAt >= todayStart.getTime()).length);
      setRecentImages(completed.slice(0, 6));
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  };

  const favoriteCount = useMemo(() => prompts.filter(p => p.isFavorite).length, [prompts]);

  // Recent prompts: sorted by updatedAt
  const recentPrompts = useMemo(() =>
    [...prompts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [prompts]
  );

  // Active queue jobs
  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'generating');
  const completedJobs = jobs.filter(j => j.status === 'completed');

  const handleImportWorkflow = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        JSON.parse(content); // validate JSON
        navigate('/workflows', { state: { importJson: content } });
      } catch {
        alert('无效的 JSON 文件，请检查后重试');
      }
    };
    input.click();
  };

  const getTimeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m}分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}小时前`;
    return `${Math.floor(h / 24)}天前`;
  };

  return (
    <div className="relative z-10 overflow-y-auto h-full pr-1 space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-[var(--accent-1)]" />
            <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md">欢迎回来</h2>
          </div>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">
            今天已生成 <span className="text-[var(--accent-1)] font-bold">{todayGenerated}</span> 张图 · 共 <span className="text-[var(--accent-2)] font-bold">{totalGenerated}</span> 张历史记录
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/prompts')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border transition-all duration-300 hover:scale-105 hover:bg-[var(--glass-bg-hover)] shadow-[0_4px_12px_rgba(0,0,0,0.1)] border-[var(--glass-border)] text-[var(--text-primary)] bg-[var(--glass-bg)]"
          >
            <FileText size={16} />
            提示词管理
          </button>
          <button
            onClick={() => navigate('/prompts/edit/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all duration-300 hover:scale-105 shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)] text-[var(--bg-layer-0)]"
            style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))", border: "1px solid var(--glass-border-active)" }}
          >
            <PenSquare size={16} />
            新建提示词
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <FileText size={24} />, num: prompts.length, lbl: "提示词总数", onClick: () => navigate('/prompts') },
          { icon: <Star size={24} />, num: favoriteCount, lbl: "收藏提示词", onClick: () => navigate('/prompts') },
          { icon: <Zap size={24} />, num: workflows.length, lbl: "工作流数量", onClick: () => navigate('/workflows') },
          { icon: <Paintbrush size={24} />, num: totalGenerated, lbl: "总生成次数", onClick: () => navigate('/history') },
        ].map((s, i) => (
          <div
            key={i}
            onClick={s.onClick}
            className="glass-panel p-5 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] cursor-pointer"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--glass-border-active)] to-transparent rounded-full -translate-y-16 translate-x-16 blur-2xl group-hover:scale-110 transition-transform" />
            <span className="text-[var(--text-secondary)] drop-shadow-[0_0_8px_rgba(0,0,0,0.1)]">{s.icon}</span>
            <div
              className="text-3xl font-extrabold mt-3 drop-shadow-lg"
              style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              {s.num}
            </div>
            <p className="text-xs font-semibold mt-1 text-[var(--text-muted)]">{s.lbl}</p>
          </div>
        ))}
      </div>

      {/* Row: Recent Prompts & Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Prompts */}
        <div className="glass-panel p-5 flex flex-col min-h-[240px]">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--glass-border)] pb-2">
            <div className="text-[13px] font-bold flex items-center gap-2 text-[var(--text-primary)]">
              <Clock size={16} className="text-blue-400" />
              最近提示词项目
            </div>
            <button onClick={() => navigate('/prompts')} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1">
              查看全部 <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {recentPrompts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] py-8">
                <FileText size={32} className="mb-2 opacity-50" />
                <p className="text-[12px]">还没有提示词，快去创建吧</p>
              </div>
            ) : recentPrompts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-layer-1)] border border-[var(--glass-border)] hover:bg-white/5 transition-colors cursor-pointer group"
                onClick={() => navigate(`/prompts/edit/${p.id}`)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {p.coverImage ? (
                    <img src={p.coverImage} className={`w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-[var(--glass-border)] transition-all duration-300 ${privacyMode ? 'blur-md hover:blur-none' : ''}`} />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-[var(--accent-2)]/10 text-blue-400 border-[var(--accent-2)]/20 flex-shrink-0">
                      <FileText size={14} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[var(--text-primary)] transition-colors truncate">{p.title}</h4>
                    <p className="text-[10px] text-[var(--text-muted)]">{getTimeAgo(p.updatedAt)}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/generate/${p.id}`); }}
                  className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent-2)]/30 to-[var(--accent-2)]/30 border border-[var(--glass-border)] text-[10px] font-bold text-[var(--text-primary)] hover:from-[var(--accent-2)]/50 hover:to-[var(--accent-2)]/50 transition-all flex items-center gap-1 flex-shrink-0 ml-2"
                >
                  <Play size={10} fill="currentColor" /> 生成
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Queue Preview */}
        <div className="glass-panel p-5 flex flex-col min-h-[240px]">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--glass-border)] pb-2">
            <div className="text-[13px] font-bold flex items-center gap-2 text-[var(--text-primary)]">
              <Activity size={16} className="text-orange-400" />
              当前生成队列
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activeJobs.length > 0 ? 'bg-orange-500/20 text-orange-400 border-orange-500/20' : 'bg-white/5 text-[var(--text-muted)] border-[var(--glass-border)]'}`}>
              {activeJobs.length > 0 ? `${activeJobs.length} 个任务进行中` : (isConnected ? '队列空闲' : '未连接引擎')}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {activeJobs.length === 0 && completedJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
                <ImageIcon size={32} className="mb-2 opacity-50" />
                <p className="text-[12px]">{isConnected ? '队列为空，去生成一张图吧' : '请先在设置中配置 ComfyUI 地址'}</p>
              </div>
            ) : (
              <>
                {activeJobs.map(job => (
                  <div key={job.id} className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 relative overflow-hidden">
                    <div className="relative z-10 flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-orange-400 flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        {job.status === 'generating' ? '正在渲染' : '等待中'}: {job.projectTitle}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">{job.progress}%</span>
                    </div>
                    <div className="relative z-10 w-full h-1.5 bg-[var(--glass-bg)] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-300 rounded-full" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                ))}
                {completedJobs.slice(0, 3).map(job => (
                  <div key={job.id} className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 flex items-center justify-between group relative cursor-pointer hover:bg-green-500/10 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <ImageIcon size={14} className="text-green-400 flex-shrink-0" />
                      <span className="text-[12px] font-bold text-[var(--text-primary)] truncate">{job.projectTitle}</span>
                    </div>
                    <span className="text-[10px] font-bold text-green-400 flex-shrink-0 ml-2">✓ 完成</span>

                    {/* Hover Bubble Image Preview */}
                    {job.images?.[0] && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 pointer-events-none translate-y-2 group-hover:translate-y-0">
                        <div className="bg-[var(--bg-layer-1)] backdrop-blur-2xl border border-green-500/40 p-2 rounded-2xl shadow-[0_8px_30px_rgba(34,197,94,0.3)]">
                          <img src={job.images[0]} className={`w-full aspect-square rounded-xl object-cover ${privacyMode ? 'blur-md' : ''}`} alt="preview" />
                          <div className="text-[10px] text-center mt-2 text-green-400 font-bold mb-1">点击查看大图</div>
                        </div>
                        {/* Tooltip Arrow */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[var(--bg-layer-1)] border-b border-r border-green-500/40 rotate-45 backdrop-blur-2xl" />
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Generated Images */}
      {recentImages.length > 0 && (
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--glass-border)] pb-2">
            <div className="text-[13px] font-bold flex items-center gap-2 text-[var(--text-primary)]">
              <ImageIcon size={16} className="text-green-400" />
              最近生成的图片
            </div>
            <button onClick={() => navigate('/history')} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1">
              查看全部历史 <ChevronRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {recentImages.map((img, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl overflow-hidden border border-[var(--glass-border)] hover:border-green-400/50 cursor-pointer group relative transition-all"
                onClick={() => navigate('/history')}
              >
                <img src={img.outputPath} className={`w-full h-full object-cover group-hover:scale-110 transition-all duration-500 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                <div className="absolute inset-0 bg-[var(--bg-layer-1)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ImageIcon size={20} className="text-[var(--text-primary)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass-panel p-6">
        <div className="text-sm font-bold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
          <Rocket size={16} className="text-[var(--accent-2)]" />
          快捷操作
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: <Rocket size={28} />,
              label: "立即生成",
              desc: recentPrompts[0] ? `使用「${recentPrompts[0].title}」` : "选择一个提示词",
              onClick: () => recentPrompts[0] ? navigate(`/generate/${recentPrompts[0].id}`) : navigate('/prompts'),
              disabled: recentPrompts.length === 0
            },
            {
              icon: <RefreshCw size={28} />,
              label: "生成历史",
              desc: `共 ${totalGenerated} 张记录`,
              onClick: () => navigate('/history'),
              disabled: false
            },
            {
              icon: <FolderUp size={28} />,
              label: "导入工作流",
              desc: "加载 ComfyUI JSON",
              onClick: handleImportWorkflow,
              disabled: false
            },
            {
              icon: <Zap size={28} />,
              label: "工作流管理",
              desc: `已有 ${workflows.length} 个工作流`,
              onClick: () => navigate('/workflows'),
              disabled: false
            },
          ].map((a, i) => (
            <div
              key={i}
              onClick={a.disabled ? undefined : a.onClick}
              className={`glass-panel p-4 text-center transition-all duration-300 group ${a.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(179,136,255,0.2)]'}`}
              style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)" }}
            >
              <span className={`flex justify-center mb-3 transition-colors group-hover:scale-110 duration-300 ${a.disabled ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)] group-hover:text-[var(--accent-1)] group-hover:drop-shadow-[0_0_8px_rgba(var(--accent-1-rgb), 0.5)]'}`}>
                {a.icon}
              </span>
              <div className="text-[13px] font-bold text-[var(--text-primary)]">{a.label}</div>
              <div className="text-[11px] mt-1 text-[var(--text-muted)] font-medium truncate">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
