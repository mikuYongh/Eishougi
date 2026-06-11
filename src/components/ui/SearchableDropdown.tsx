import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

interface Option {
  label: string;
  value: string;
}

interface SearchableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  accentColor?: "blue" | "purple" | "orange";
  placeholder?: string;
  searchPlaceholder?: string;
}

export function SearchableDropdown({ 
  value, 
  onChange, 
  options, 
  accentColor = "blue",
  placeholder = "请选择...",
  searchPlaceholder = "搜索选项..."
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const colors = {
    blue: {
      bg: "bg-blue-500/20",
      border: "border-blue-500/50",
      text: "text-blue-400",
      hover: "hover:bg-blue-500/30",
      shadow: "shadow-[0_0_15px_rgba(59,130,246,0.3)]",
    },
    purple: {
      bg: "bg-purple-500/20",
      border: "border-purple-500/50",
      text: "text-purple-400",
      hover: "hover:bg-purple-500/30",
      shadow: "shadow-[0_0_15px_rgba(168,85,247,0.3)]",
    },
    orange: {
      bg: "bg-orange-500/20",
      border: "border-orange-500/50",
      text: "text-orange-400",
      hover: "hover:bg-orange-500/30",
      shadow: "shadow-[0_0_15px_rgba(249,115,22,0.3)]",
    }
  };

  const theme = colors[accentColor];
  const selectedOption = options.find(o => o.value === value);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) || 
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    } else {
      setSearch("");
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border transition-all cursor-pointer ${isOpen ? theme.border + ' ' + theme.shadow : 'border-white/10 hover:border-white/20'}`}
      >
        <span className={`text-[12px] truncate ${selectedOption ? 'text-white/90' : 'text-white/40'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 ' + theme.text : 'text-white/40'}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#1A1625]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[300px] animate-in fade-in slide-in-from-top-2 duration-200">
          
          <div className="p-2 border-b border-white/5 flex-shrink-0">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-white/40" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-black/30 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12px] flex items-center justify-between transition-colors cursor-pointer ${value === option.value ? theme.bg + ' ' + theme.text : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {value === option.value && <Check size={14} />}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-[11px] text-white/30">
                未找到匹配项
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
