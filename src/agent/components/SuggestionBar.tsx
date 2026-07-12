/**
 * SuggestionBar — AI 建议选项横滑卡片条
 * 在生成完成后显示，点击直接发送为新消息
 */
import { Sparkles, ChevronRight } from "lucide-react";
import type { Suggestion } from "../types";

interface SuggestionBarProps {
  suggestions: Suggestion[];
  onSelect: (message: string) => void;
}

export function SuggestionBar({ suggestions, onSelect }: SuggestionBarProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-3 py-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1" style={{ scrollbarWidth: "thin" }}>
        <Sparkles size={12} className="text-[var(--accent-1)] flex-shrink-0" />
        {suggestions.map((sug, i) => (
          <button
            key={i}
            onClick={() => onSelect(sug.message)}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--glass-bg)] border border-[var(--accent-1)]/20 hover:border-[var(--accent-1)]/40 hover:bg-[var(--accent-1)]/10 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-1)] transition-all cursor-pointer group"
          >
            {sug.icon && <span>{sug.icon}</span>}
            <span>{sug.title}</span>
            <ChevronRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}
