/**
 * ModelPickerModal — 模型选择器（基础模型 / VAE / LoRA）
 *
 * 从 ComfyUI 拉取本地模型列表，用户搜索选择后通过 onConfirm 回调。
 * 由 AI 调用 select_model 工具触发。
 */
import { useState, useEffect, useMemo } from "react";
import { X, Search, Cpu, Loader2 } from "lucide-react";
import { useModelStore } from "../../stores/modelStore";

interface ModelPickerModalProps {
  kind: "checkpoint" | "vae" | "lora";
  onClose: () => void;
  onConfirm: (modelName: string) => void;
}

export function ModelPickerModal({ kind, onClose, onConfirm }: ModelPickerModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { checkpoints, loras, vaes, isLoading, fetchModels } = useModelStore();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const models = useMemo(() => {
    if (kind === "vae") return vaes;
    if (kind === "lora") return loras;
    return checkpoints;
  }, [kind, checkpoints, loras, vaes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, search]);

  const kindLabel = kind === "vae" ? "VAE" : kind === "lora" ? "LoRA" : "基础模型";

  const handleConfirm = () => {
    if (selected) onConfirm(selected);
  };

  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[var(--bg-layer-0)]/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-[var(--bg-layer-1)] border border-[var(--glass-border-active)] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-[var(--accent-1)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">选择{kindLabel}</h3>
            <span className="text-[10px] text-[var(--text-muted)]">{filtered.length} 个模型</span>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--glass-border)]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`搜索${kindLabel}...`}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {isLoading && models.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
              <Loader2 size={20} className="animate-spin mr-2" />
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <p className="text-[12px]">{search ? "没有匹配的模型" : "本地没有可用的模型，请检查 ComfyUI 连接"}</p>
            </div>
          ) : (
            filtered.map((m) => (
              <div
                key={m}
                onClick={() => setSelected(m)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all mb-0.5 ${
                  selected === m
                    ? "bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/30"
                    : "hover:bg-[var(--glass-bg-hover)] border border-transparent"
                }`}
              >
                <span className="text-[12px] font-mono text-[var(--text-primary)] truncate flex-1">{m}</span>
                {selected === m && <Cpu size={14} className="text-[var(--accent-1)] flex-shrink-0" />}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--glass-border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[12px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="px-4 py-2 rounded-lg text-[12px] font-bold text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))" }}
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
}
