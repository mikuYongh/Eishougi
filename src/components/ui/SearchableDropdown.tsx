import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check, Loader2, AlertCircle } from "lucide-react";

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
  triggerClassName?: string;
  dropdownClassName?: string;
  containerClassName?: string;
  isLoading?: boolean;
  isError?: boolean;
}

export function SearchableDropdown({ 
  value, 
  onChange, 
  options, 
  accentColor = "blue",
  placeholder = "请选择...",
  searchPlaceholder = "搜索选项...",
  triggerClassName = "",
  dropdownClassName = "",
  containerClassName = "",
  isLoading = false,
  isError = false,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const colors = {
    blue: {
      bg: "bg-[var(--accent-2)]/20",
      border: "border-[var(--accent-2)]/50",
      text: "text-blue-400",
      hover: "hover:bg-[var(--accent-2)]/30",
      shadow: "shadow-[0_0_15px_rgba(59,130,246,0.3)]",
    },
    purple: {
      bg: "bg-[var(--accent-2)]/20",
      border: "border-[var(--accent-2)]/50",
      text: "text-[var(--accent-2)]",
      hover: "hover:bg-[var(--accent-2)]/30",
      shadow: "shadow-[0_0_15px_rgba(var(--accent-2-rgb), 0.3)]",
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

  // If the current value isn't in the options list (e.g. the model file was deleted,
  // or the workflow references a model that hasn't been scanned yet), we still need to
  // display it. Inject it as a synthetic option so the user can see what's set and the
  // dropdown doesn't misleadingly show the placeholder.
  const valueExists = options.some(o => o.value === value);
  const allOptions = value && !valueExists
    ? [{ label: `${value} (不在本地)`, value }, ...options]
    : options;
  const selectedOption = allOptions.find(o => o.value === value);

  const filteredOptions = allOptions.filter(o => 
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
    <div className={`relative ${containerClassName}`} ref={containerRef}>
      <button
        type="button"
        disabled={isLoading || isError}
        onClick={() => !isLoading && !isError && setIsOpen(!isOpen)}
        className={`flex items-center justify-between transition-all ${isLoading || isError ? 'cursor-not-allowed' : 'cursor-pointer'} ${
          triggerClassName 
            ? `${triggerClassName} ${isOpen ? 'ring-2 ring-[var(--accent-2)]/50' : ''}`
            : `w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border ${isError ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : isOpen ? theme.border + ' ' + theme.shadow : 'border-[var(--glass-border)] hover:border-[var(--glass-border-active)]'}`
        }`}
      >
        <span className={`text-[12px] truncate ${isError ? 'text-red-400' : selectedOption ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'} ${isLoading ? 'opacity-60' : ''}`}>
          {isError ? "加载失败" : isLoading ? "正在加载模型..." : (selectedOption ? selectedOption.label : placeholder)}
        </span>
        {isLoading ? (
          <Loader2 size={14} className="text-[var(--accent-1)] animate-spin" />
        ) : isError ? (
          <AlertCircle size={14} className="text-red-500" />
        ) : (
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 ' + theme.text : 'text-[var(--text-secondary)]'}`} />
        )}
      </button>

      {isOpen && (
        <div className={`absolute z-[100] mt-2 bg-[var(--bg-layer-1)] backdrop-blur-3xl border border-[var(--glass-border-active)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[300px] animate-in fade-in slide-in-from-top-2 duration-200 ${dropdownClassName || 'w-full left-0'}`}>
          
          <div className="p-2 border-b border-[var(--glass-border)] flex-shrink-0">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-[var(--text-secondary)]" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--glass-border-active)] transition-colors"
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
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12px] flex items-center justify-between transition-colors cursor-pointer ${value === option.value ? theme.bg + ' ' + theme.text : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {value === option.value && <Check size={14} />}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-[11px] text-[var(--text-secondary)]">
                未找到匹配项
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
