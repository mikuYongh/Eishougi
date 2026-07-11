import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Loader2, AlertCircle } from "lucide-react";

interface Option {
  label: string;
  value: string;
}

interface GlassDropdownProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  accentColor?: "pink" | "orange" | "blue" | "purple" | "green" | "yellow";
  className?: string;
  small?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

export function GlassDropdown({ 
  options, 
  value, 
  onChange, 
  accentColor = "pink", 
  className = "", 
  small = false,
  isLoading = false,
  isError = false,
}: GlassDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const colors = {
    pink: { text: "text-[var(--accent-1)]", bg: "bg-[var(--accent-1)]/10", border: "hover:border-[var(--accent-1)]/50" },
    orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "hover:border-orange-400/50" },
    blue: { text: "text-blue-400", bg: "bg-[var(--accent-2)]/10", border: "hover:border-blue-400/50" },
    purple: { text: "text-[var(--accent-2)]", bg: "bg-[var(--accent-2)]/10", border: "hover:border-[var(--accent-2)]/50" },
    green: { text: "text-green-400", bg: "bg-green-500/10", border: "hover:border-green-400/50" },
    yellow: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "hover:border-yellow-400/50" },
  };

  const c = colors[accentColor] || colors.pink;
  const selectedLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        className={`w-full rounded-xl bg-[var(--glass-bg)] border ${isError ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : `border-[var(--glass-border)] ${c.border}`} text-[var(--text-primary)] flex items-center justify-between transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] group ${small ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-[13px]'} ${isLoading || isError ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !isLoading && !isError && setIsOpen(!isOpen)}
      >
        <span className={`font-bold tracking-wide truncate pr-2 ${isError ? 'text-red-400' : ''} ${isLoading ? 'opacity-60' : ''}`}>
          {isError ? "加载失败" : isLoading ? "加载中..." : selectedLabel}
        </span>
        {isLoading ? (
          <Loader2 size={small ? 14 : 16} className="text-[var(--accent-1)] animate-spin flex-shrink-0" />
        ) : isError ? (
          <AlertCircle size={small ? 14 : 16} className="text-red-500 flex-shrink-0" />
        ) : (
          <ChevronDown size={small ? 14 : 16} className={`text-[var(--text-secondary)] transition-transform duration-300 group-hover:text-[var(--text-primary)] flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </div>

      {isOpen && (
        <div className={`absolute left-0 right-0 top-[110%] bg-[var(--bg-layer-1)] backdrop-blur-3xl border border-[var(--glass-border-active)] rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[100] py-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent ${small ? 'text-xs' : 'text-[13px]'}`}>
          {options.map((opt) => (
            <div 
              key={opt.value}
              className={`px-4 py-2.5 font-bold cursor-pointer flex items-center justify-between transition-colors ${value === opt.value ? `${c.bg} ${c.text}` : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
              {value === opt.value && <Check size={14} className="flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
