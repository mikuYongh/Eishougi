/**
 * GenerationPreview — 生成预览审批卡片
 * 显示即将生成的参数，用户确认/修改/取消后才执行
 */
import { useState } from "react";
import { Palette, Check, X, Edit3, Cpu, Maximize2, Sliders, Layers } from "lucide-react";
import type { GenerationPreviewAttachment } from "../types";

interface GenerationPreviewProps {
  preview: GenerationPreviewAttachment;
  onApprove: () => void;
  onReject: () => void;
}

export function GenerationPreview({ preview, onApprove, onReject }: GenerationPreviewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preview);

  const ParamRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
    <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
      <Icon size={10} className="text-[var(--text-muted)]" />
      <span className="text-[var(--text-muted)]">{label}:</span>
      <span className="font-mono text-[var(--text-primary)]">{value}</span>
    </div>
  );

  return (
    <div className="mx-3 my-2 rounded-2xl overflow-hidden border border-[var(--accent-1)]/25 bg-[var(--bg-layer-1)]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.1)] animate-in fade-in zoom-in-95 duration-300">
      {/* 顶部光带 */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-1)]/60 to-transparent" />

      <div className="p-3">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-1)]/20 flex items-center justify-center">
            <Palette size={13} className="text-[var(--accent-1)]" />
          </div>
          <span className="text-[12px] font-bold text-[var(--text-primary)]">即将生成</span>
        </div>

        {/* Prompt 预览 */}
        <div className="p-2 rounded-lg bg-[var(--bg-layer-0)]/60 border border-[var(--glass-border)] mb-2">
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-4 break-all">
            {editing ? (
              <textarea
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                className="w-full bg-transparent text-[11px] text-[var(--text-primary)] outline-none resize-none"
                rows={3}
              />
            ) : (
              draft.prompt
            )}
          </p>
        </div>

        {/* 参数 */}
        <div className="grid grid-cols-2 gap-1.5 mb-2.5">
          {draft.model && <ParamRow icon={Cpu} label="模型" value={draft.model} />}
          {draft.width && draft.height && <ParamRow icon={Maximize2} label="尺寸" value={`${draft.width}×${draft.height}`} />}
          {draft.steps && <ParamRow icon={Sliders} label="步数" value={String(draft.steps)} />}
          {draft.cfgScale && <ParamRow icon={Sliders} label="CFG" value={String(draft.cfgScale)} />}
          {draft.sampler && <ParamRow icon={Sliders} label="采样器" value={draft.sampler} />}
          {draft.loras && draft.loras.length > 0 && (
            <ParamRow icon={Layers} label="LoRA" value={draft.loras.map((l) => `${l.name.split(".")[0]}(${l.strength})`).join(", ")} />
          )}
        </div>

        {/* 负面提示词 */}
        {draft.negativePrompt && (
          <div className="p-1.5 rounded-lg bg-red-500/5 border border-red-500/10 mb-2.5">
            <p className="text-[9px] text-red-400/60 mb-0.5">负面:</p>
            <p className="text-[10px] text-red-400/80 line-clamp-2 break-all">{draft.negativePrompt}</p>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] text-[10px] font-medium transition-all cursor-pointer"
          >
            <Edit3 size={11} />
            {editing ? "完成编辑" : "修改"}
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[10px] font-medium transition-all cursor-pointer"
          >
            <X size={11} />
            取消
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[10px] font-bold transition-all cursor-pointer active:scale-95 ml-auto"
            style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))", boxShadow: "0 0 15px rgba(var(--accent-1-rgb),0.3)" }}
          >
            <Check size={11} />
            确认生成
          </button>
        </div>
      </div>
    </div>
  );
}
