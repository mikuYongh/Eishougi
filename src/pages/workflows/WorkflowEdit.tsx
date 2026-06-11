import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../stores/settingsStore";
import { ArrowLeft, Save, Code, Cpu, UploadCloud } from "lucide-react";
import { useWorkflowStore, type WorkflowProject, type WorkflowType } from "../../stores/workflowStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";

export function WorkflowEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workflows = useWorkflowStore((state) => state.workflows);
  const updateWorkflow = useWorkflowStore((state) => state.updateWorkflow);
  const addWorkflow = useWorkflowStore((state) => state.addWorkflow);
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  
  const [workflow, setWorkflow] = useState<Partial<WorkflowProject>>({
    name: "", description: "", type: "text2img", jsonContent: "{\n  // 在此处粘贴 ComfyUI API 格式的 JSON\n}", tags: []
  });

  useEffect(() => {
    if (id && id !== 'new') {
      const w = workflows.find(w => w.id === id);
      if (w) setWorkflow(w);
    }
  }, [id, workflows]);

  const handleSave = () => {
    if (id && id !== 'new') {
      updateWorkflow(id, workflow);
    } else {
      addWorkflow({
        ...workflow as WorkflowProject,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    navigate('/workflows');
  };

  const updateField = (key: keyof WorkflowProject, value: any) => {
    setWorkflow(prev => ({ ...prev, [key]: value }));
  };

  const typeOptions = [
    { label: "基础文生图 (Text2Img)", value: "text2img" },
    { label: "图生视频 (Img2Video)", value: "img2video" },
    { label: "反推工具 (Tagger)", value: "tagger" },
    { label: "放大/修复 (Upscale)", value: "upscale" },
    { label: "自定义 (Custom)", value: "custom" }
  ];

  return (
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-6xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 bg-[var(--bg-layer-1)] p-4 rounded-2xl border border-[var(--glass-border)] backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/workflows')}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--glass-border)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] drop-shadow-md">
              {id === 'new' ? '新建工作流配置' : '编辑工作流配置'}
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">{workflow.name || "未命名工作流"}</p>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-[0_4px_15px_rgba(255,213,79,0.3)] hover:scale-[1.02] transition-all text-black cursor-pointer"
          style={{ background: "linear-gradient(135deg, #FFCA28, #FF9800)", border: "1px solid rgba(255,255,255,0.4)" }}
        >
          <Save size={16} /> 保存配置
        </button>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 overflow-y-auto pb-10">
        
        {/* Left Column - Metadata */}
        <div className="w-[380px] flex-shrink-0 flex flex-col gap-5">
          <div className="glass-panel p-5 space-y-5">
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">工作流名称</label>
              <input 
                type="text" value={workflow.name} onChange={e => updateField('name', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] text-sm outline-none focus:border-yellow-500/50 transition-colors font-bold"
                placeholder="例如：基础文生图"
              />
            </div>
            
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">用途描述</label>
              <textarea 
                value={workflow.description} onChange={e => updateField('description', e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-[var(--text-muted)] text-xs outline-none focus:border-yellow-500/50 transition-colors h-24 resize-none"
                placeholder="工作流的具体用途和使用场景..."
              />
            </div>

            <div className="relative z-50">
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">工作流类型</label>
              <GlassDropdown 
                value={workflow.type || "text2img"}
                onChange={v => updateField('type', v as WorkflowType)}
                options={typeOptions}
                accentColor="yellow"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-2">不同的类型将决定它在生成界面的挂载位置。</p>
            </div>
          </div>

          {/* Thumbnail Uploader */}
          <div className="glass-panel p-5">
            <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">缩略图</label>
            <div className="h-40 w-full rounded-xl border-2 border-dashed border-[var(--glass-border)] hover:border-yellow-400/50 bg-[var(--glass-bg-hover)] flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer transition-colors">
              {workflow.thumbnail ? (
                <div className="absolute inset-0 z-0 group-hover/cover:bg-[var(--bg-layer-2)] transition-colors flex items-center justify-center cursor-pointer">
                  <img src={workflow.thumbnail} alt="Thumbnail" className={`w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-all duration-300 ${privacyMode ? 'blur-2xl group-hover:blur-none' : ''}`} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity">
                    <span className="bg-[var(--glass-bg)] backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-primary)]">点击更换图片</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <UploadCloud size={16} className="text-[var(--text-muted)] group-hover:text-yellow-400 transition-colors" />
                  </div>
                  <span className="text-[11px] font-bold text-[var(--text-muted)]">上传缩略图 (可选)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - JSON Editor */}
        <div className="flex-1 flex flex-col min-w-0 glass-panel overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[var(--glass-border)] bg-[var(--bg-layer-1)]">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2 px-2">
              <Code size={16} className="text-yellow-400" /> ComfyUI API JSON (API Format)
            </h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] text-[11px] font-bold transition-colors cursor-pointer">
              <Cpu size={12} /> 校验并格式化
            </button>
          </div>
          <div className="flex-1 p-0 relative">
            {/* 临时替代方案：textarea。真实场景中应替换为 Monaco Editor 或 CodeMirror */}
            <textarea 
              value={workflow.jsonContent}
              onChange={e => updateField('jsonContent', e.target.value)}
              className="absolute inset-0 w-full h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[13px] p-4 outline-none resize-none leading-relaxed"
              spellCheck="false"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
