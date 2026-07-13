/**
 * SuggestionBar — AI 建议选项横滑卡片条
 * 在生成完成后显示。
 * - confirm=false（具体建议）：点击直接发送
 * - confirm=true（模糊建议，如"换场景"未给具体内容）：点击调 onRefine，
 *   让 LLM 针对当前画面展开成一组具体选项，用户再点选其一执行
 */
import { Sparkles, ChevronRight, Sparkle } from "lucide-react";
import type { Suggestion } from "../types";

interface SuggestionBarProps {
  suggestions: Suggestion[];
  onSelect: (message: string) => void;
  /** 模糊建议点击时触发：让 LLM 展开成具体选项 */
  onRefine?: (sug: Suggestion) => void;
}

export function SuggestionBar({ suggestions, onSelect, onRefine }: SuggestionBarProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-4 py-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        <Sparkles size={12} className="text-[var(--accent-1)] flex-shrink-0" />
        {suggestions.map((sug, i) => {
          const needsRefine = sug.confirm && onRefine;
          return (
            <button
              key={i}
              onClick={() => (needsRefine ? onRefine(sug) : onSelect(sug.message))}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--glass-bg)] border border-[var(--accent-1)]/20 hover:border-[var(--accent-1)]/40 hover:bg-[var(--accent-1)]/10 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-1)] transition-all cursor-pointer group flex-shrink-0 whitespace-nowrap"
            >
              {sug.confirm ? (
                <Sparkle size={9} className="text-[var(--accent-2)] group-hover:text-[var(--accent-1)]" />
              ) : null}
              <span>{sug.title}</span>
              <ChevronRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
