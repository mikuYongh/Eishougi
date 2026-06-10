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
  accentColor?: "pink" | "orange" | "blue" | "purple" | "green";
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
    pink: { text: "text-pink-400", bg: "bg-pink-500/10", border: "hover:border-pink-500/50" },
    orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "hover:border-orange-400/50" },
    blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "hover:border-blue-400/50" },
    purple: { text: "text-purple-400", bg: "bg-purple-500/10", border: "hover:border-purple-500/50" },
    green: { text: "text-green-400", bg: "bg-green-500/10", border: "hover:border-green-400/50" },
  };

  const c = colors[accentColor];
  const selectedLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        className={`w-full rounded-xl bg-black/40 border border-white/10 ${c.border} text-white/90 flex items-center justify-between cursor-pointer transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] group ${small ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-[13px]'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-bold tracking-wide truncate pr-2">{selectedLabel}</span>
        <ChevronDown size={small ? 14 : 16} className={`text-white/40 transition-transform duration-300 group-hover:text-white/80 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className={`absolute left-0 right-0 top-[110%] bg-black/90 backdrop-blur-3xl border border-white/10 rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[100] py-1 max-h-60 overflow-y-auto ${small ? 'text-xs' : 'text-[13px]'}`}>
          {options.map((opt) => (
            <div 
              key={opt.value}
              className={`px-4 py-2.5 font-bold cursor-pointer flex items-center justify-between transition-colors ${value === opt.value ? `${c.bg} ${c.text}` : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
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
