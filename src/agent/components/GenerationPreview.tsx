/**
 * GenerationPreview — 生成预览审批卡片
 * 显示即将生成的参数，用户确认/修改/取消后才执行。
 *
 * 编辑模式下所有参数均可修改：
 * - 模型 → SearchableDropdown（从 ComfyUI 拉取 checkpoint 列表）
 * - 采样器/调度器 → GlassDropdown（静态选项）
 * - 步数/CFG/宽高 → number input
 * - LoRA → 紧凑列表（名称 + 强度滑块 + 启用开关）
 * - 正向/负面 Prompt → textarea
 * - 「告诉 AI 你想怎么改」→ 额外需求输入框
 */
import { useState, useEffect } from "react";
import { Palette, Check, X, Edit3, Cpu, Maximize2, Sliders, Layers, MessageSquare, RefreshCw } from "lucide-react";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import { useModelStore } from "../../stores/modelStore";
import { SAMPLER_OPTIONS, SCHEDULER_OPTIONS } from "../../lib/workflowOptions";
import type { GenerationPreviewAttachment } from "../types";

interface GenerationPreviewProps {
  preview: GenerationPreviewAttachment;
  onApprove: (edited?: GenerationPreviewAttachment, userNote?: string) => void;
  onReject: () => void;
}

export function GenerationPreview({ preview, onApprove, onReject }: GenerationPreviewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GenerationPreviewAttachment>(preview);
  const [userNote, setUserNote] = useState("");

  const { checkpoints, loras, fetchModels, isLoading: modelsLoading, isError: modelsError } = useModelStore();

  // 首次展开编辑模式时拉取模型列表
  useEffect(() => {
    if (editing && checkpoints.length === 0) {
      fetchModels();
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = <K extends keyof GenerationPreviewAttachment>(key: K, val: GenerationPreviewAttachment[K]) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
  };

  const updateLora = (idx: number, patch: Partial<{ name: string; strength: number; enabled: boolean }>) => {
    setDraft((prev) => ({
      ...prev,
      loras: (prev.loras || []).map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const removeLora = (idx: number) => {
    setDraft((prev) => ({
      ...prev,
      loras: (prev.loras || []).filter((_, i) => i !== idx),
    }));
  };

  const addLora = () => {
    setDraft((prev) => ({
      ...prev,
      loras: [...(prev.loras || []), { name: "", strength: 0.8, enabled: true }],
    }));
  };

  // ── 只读参数行 ──
  const ParamRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
    <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] min-w-0">
      <Icon size={10} className="text-[var(--text-muted)] flex-shrink-0" />
      <span className="text-[var(--text-muted)] flex-shrink-0">{label}:</span>
      <span className="font-mono text-[var(--text-primary)] truncate min-w-0">{value}</span>
    </div>
  );

  // ── 编辑模式参数标签 ──
  const EditLabel = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] uppercase tracking-wider">
      <Icon size={9} />
      <span>{label}</span>
    </div>
  );

  return (
    <div className="mx-3 my-2 flex flex-col rounded-2xl overflow-hidden border border-[var(--accent-1)]/25 bg-[var(--bg-layer-1)]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.1)] animate-in fade-in zoom-in-95 duration-300 max-h-[min(70vh,520px)]">
      {/* 顶部光带 */}
      <div className="h-[2px] flex-shrink-0 bg-gradient-to-r from-transparent via-[var(--accent-1)]/60 to-transparent" />

      {/* 可滚动正文区 —— LoRA 多时这里滚动，操作按钮永远可见 */}
      <div className="p-3 overflow-y-auto custom-scrollbar min-h-0">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-1)]/20 flex items-center justify-center">
            <Palette size={13} className="text-[var(--accent-1)]" />
          </div>
          <span className="text-[12px] font-bold text-[var(--text-primary)]">即将生成</span>
          {editing && (
            <span className="text-[9px] text-[var(--accent-1)] bg-[var(--accent-1)]/10 px-1.5 py-0.5 rounded-md">编辑中</span>
          )}
        </div>

        {/* ── Prompt 预览 ── */}
        <div className="p-2 rounded-lg bg-[var(--bg-layer-0)]/60 border border-[var(--glass-border)] mb-2">
          {editing ? (
            <>
              <textarea
                value={draft.prompt}
                onChange={(e) => updateField("prompt", e.target.value)}
                className="w-full bg-transparent text-[11px] text-[var(--text-primary)] outline-none resize-none"
                rows={3}
                placeholder="正向提示词..."
              />
              {draft.negativePrompt !== undefined && (
                <textarea
                  value={draft.negativePrompt || ""}
                  onChange={(e) => updateField("negativePrompt", e.target.value)}
                  className="w-full bg-transparent text-[10px] text-red-400/80 outline-none resize-none mt-1.5 pt-1.5 border-t border-red-500/10"
                  rows={2}
                  placeholder="负面提示词..."
                />
              )}
            </>
          ) : (
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-4 break-all">
              {draft.prompt}
            </p>
          )}
        </div>

        {/* ── 参数区域 ── */}
        {editing ? (
          /* 编辑模式：下拉框 + 数字输入 */
          <div className="space-y-2 mb-2.5">
            {/* 模型 */}
            <div>
              <EditLabel icon={Cpu} label="基础模型" />
              <SearchableDropdown
                value={draft.model || ""}
                onChange={(v) => updateField("model", v)}
                options={checkpoints.map((c) => ({ label: c, value: c }))}
                accentColor="purple"
                placeholder="选择模型..."
                searchPlaceholder="搜索模型..."
                isLoading={modelsLoading}
                isError={modelsError}
                containerClassName="mt-0.5"
              />
            </div>

            {/* 采样器 + 调度器 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <EditLabel icon={Sliders} label="采样器" />
                <div className="mt-0.5">
                  <GlassDropdown
                    value={draft.sampler || "euler"}
                    onChange={(v) => updateField("sampler", v)}
                    options={SAMPLER_OPTIONS}
                    accentColor="pink"
                    small
                  />
                </div>
              </div>
              <div>
                <EditLabel icon={Sliders} label="调度器" />
                <div className="mt-0.5">
                  <GlassDropdown
                    value={draft.scheduler || "normal"}
                    onChange={(v) => updateField("scheduler", v)}
                    options={SCHEDULER_OPTIONS}
                    accentColor="blue"
                    small
                  />
                </div>
              </div>
            </div>

            {/* 步数 + CFG */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <EditLabel icon={Sliders} label="步数" />
                <input
                  type="number"
                  value={draft.steps || 20}
                  onChange={(e) => updateField("steps", parseInt(e.target.value) || 20)}
                  min={1}
                  max={100}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div>
                <EditLabel icon={Sliders} label="CFG" />
                <input
                  type="number"
                  step="0.1"
                  value={draft.cfgScale || 5.0}
                  onChange={(e) => updateField("cfgScale", parseFloat(e.target.value) || 5.0)}
                  min={0.1}
                  max={30}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* 宽度 + 高度 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <EditLabel icon={Maximize2} label="宽度" />
                <input
                  type="number"
                  value={draft.width || 832}
                  onChange={(e) => updateField("width", parseInt(e.target.value) || 832)}
                  min={64}
                  max={2048}
                  step={64}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div>
                <EditLabel icon={Maximize2} label="高度" />
                <input
                  type="number"
                  value={draft.height || 1216}
                  onChange={(e) => updateField("height", parseInt(e.target.value) || 1216)}
                  min={64}
                  max={2048}
                  step={64}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* LoRA 列表 */}
            <div>
              <div className="flex items-center justify-between">
                <EditLabel icon={Layers} label="LoRA" />
                <button onClick={addLora} className="text-[9px] text-[var(--accent-1)] hover:underline cursor-pointer">+ 添加</button>
              </div>
              <div className="space-y-1 mt-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                {(Array.isArray(draft.loras) ? draft.loras : []).map((rawLora, i) => {
                  const lora = {
                    name: rawLora.name ?? "",
                    strength: typeof rawLora.strength === "number" ? rawLora.strength : 0.8,
                    enabled: typeof rawLora.enabled === "boolean" ? rawLora.enabled : true,
                  };
                  return (
                    <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                      <button
                        onClick={() => updateLora(i, { enabled: !lora.enabled })}
                        className={`w-4 h-4 rounded-full flex-shrink-0 transition-colors cursor-pointer ${lora.enabled ? "bg-[var(--accent-1)]" : "bg-[var(--glass-border)]"}`}
                      />
                      <SearchableDropdown
                        value={lora.name}
                        onChange={(v) => updateLora(i, { name: v })}
                        options={loras.map((l) => ({ label: l, value: l }))}
                        accentColor="orange"
                        placeholder="选择 LoRA..."
                        searchPlaceholder="搜索 LoRA..."
                        containerClassName="flex-1 min-w-0"
                        triggerClassName="!text-[10px] !py-1 !px-2"
                        dropUp
                      />
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={lora.strength}
                        onChange={(e) => updateLora(i, { strength: parseFloat(e.target.value) })}
                        className="w-16 accent-[var(--accent-1)] cursor-pointer flex-shrink-0"
                      />
                      <span className="text-[9px] font-mono text-[var(--text-secondary)] w-7 text-right flex-shrink-0">{lora.strength.toFixed(2)}</span>
                      <button onClick={() => removeLora(i)} className="text-[var(--text-muted)] hover:text-red-400 cursor-pointer flex-shrink-0 p-0.5">
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
                {(!Array.isArray(draft.loras) || draft.loras.length === 0) && (
                  <p className="text-[9px] text-[var(--text-muted)] py-1">无 LoRA</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* 只读模式：保持原有 ParamRow 展示，补充 scheduler */
          <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2.5">
            {draft.model && (
              <div className="min-w-0">
                <ParamRow icon={Cpu} label="模型" value={draft.model} />
              </div>
            )}
            {draft.width && draft.height && (
              <div className="min-w-0">
                <ParamRow icon={Maximize2} label="尺寸" value={`${draft.width}×${draft.height}`} />
              </div>
            )}
            {draft.steps && (
              <div className="min-w-0">
                <ParamRow icon={Sliders} label="步数" value={String(draft.steps)} />
              </div>
            )}
            {draft.cfgScale && (
              <div className="min-w-0">
                <ParamRow icon={Sliders} label="CFG" value={String(draft.cfgScale)} />
              </div>
            )}
            {draft.sampler && (
              <div className="min-w-0">
                <ParamRow icon={Sliders} label="采样器" value={draft.sampler} />
              </div>
            )}
            {draft.scheduler && (
              <div className="min-w-0">
                <ParamRow icon={Sliders} label="调度器" value={draft.scheduler} />
              </div>
            )}
          </div>

          {/* LoRA 列表（单独区块，可滚动，不挤在 grid 里撑破布局） */}
          {!editing && Array.isArray(draft.loras) && draft.loras.length > 0 && (
            <div className="mb-2.5">
              <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] mb-1">
                <Layers size={10} />
                <span>LoRA ({draft.loras.length})</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                {draft.loras.map((l, i) => (
                  <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${l.enabled === false ? "bg-[var(--bg-layer-0)]/50 text-[var(--text-muted)] border-[var(--glass-border)] line-through" : "bg-[var(--accent-1)]/10 text-[var(--accent-1)] border-[var(--accent-1)]/20"}`}>
                    {l.name?.split(".")[0] || l.name}{typeof l.strength === "number" ? ` ×${l.strength}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          </>
        )}

        {/* 负面提示词（只读模式） */}
        {!editing && draft.negativePrompt && (
          <div className="p-1.5 rounded-lg bg-red-500/5 border border-red-500/10 mb-2.5">
            <p className="text-[9px] text-red-400/60 mb-0.5">负面:</p>
            <p className="text-[10px] text-red-400/80 line-clamp-2 break-all">{draft.negativePrompt}</p>
          </div>
        )}

        {/* ── 向 AI 描述修改 ── */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <MessageSquare size={10} className="text-[var(--text-muted)]" />
            <span className="text-[9px] text-[var(--text-muted)]">告诉 AI 你想怎么改（可选）</span>
          </div>
          <input
            type="text"
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="例如：把画风改成水彩，增加光影细节"
            className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-layer-0)]/60 border border-[var(--glass-border)] text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/40 placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      {/* 操作按钮 —— 固定底部，永远可见，不被 LoRA 列表挤出可视区 */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-t border-[var(--glass-border)] bg-[var(--bg-layer-1)]/60 flex-shrink-0">
        <button
          onClick={() => setEditing(!editing)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all cursor-pointer ${editing ? "bg-[var(--accent-1)]/15 border-[var(--accent-1)]/30 text-[var(--accent-1)]" : "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)]"}`}
        >
          {editing ? <Check size={11} /> : <Edit3 size={11} />}
          {editing ? "完成编辑" : "修改参数"}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[10px] font-medium transition-all cursor-pointer"
        >
          <X size={11} />
          取消
        </button>
        <button
          onClick={() => onApprove(editing ? draft : undefined, userNote.trim() || undefined)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[10px] font-bold transition-all cursor-pointer active:scale-95 ml-auto"
          style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))", boxShadow: "0 0 15px rgba(var(--accent-1-rgb),0.3)" }}
        >
          <RefreshCw size={11} />
          确认生成
        </button>
      </div>
    </div>
  );
}
