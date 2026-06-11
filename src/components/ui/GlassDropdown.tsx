import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

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
}

export function GlassDropdown({ 
  options, 
  value, 
  onChange, 
  accentColor = "pink", 
  className = "", 
  small = false 
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
        className={`w-full rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] ${c.border} text-[var(--text-primary)] flex items-center justify-between cursor-pointer transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] group ${small ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-[13px]'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-bold tracking-wide truncate pr-2">{selectedLabel}</span>
        <ChevronDown size={small ? 14 : 16} className={`text-[var(--text-muted)] transition-transform duration-300 group-hover:text-[var(--text-primary)] flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className={`absolute left-0 right-0 top-[110%] bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[100] py-1 max-h-60 overflow-y-auto ${small ? 'text-xs' : 'text-[13px]'}`}>
          {options.map((opt) => (
            <div 
              key={opt.value}
              className={`px-4 py-2.5 font-bold cursor-pointer flex items-center justify-between transition-colors ${value === opt.value ? `${c.bg} ${c.text}` : 'text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]'}`}
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
