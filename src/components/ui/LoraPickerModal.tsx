import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Layers, Check } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';

interface LoraPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLoras: string[];
  onToggle: (loraName: string) => void;
}

export function LoraPickerModal({ isOpen, onClose, selectedLoras, onToggle }: LoraPickerModalProps) {
  const { loras } = useModelStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLoras = useMemo(() => {
    if (!searchQuery) return loras;
    const lowerQ = searchQuery.toLowerCase();
    return loras.filter(l => l.toLowerCase().includes(lowerQ));
  }, [loras, searchQuery]);

  if (!isOpen) return null;

  return createPortal(
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[var(--bg-layer-0)]/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <div 
        className="w-[95%] max-w-2xl relative bg-[var(--bg-layer-2)]/85 backdrop-blur-3xl border border-[var(--glass-border)] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_var(--glass-border)] flex flex-col h-[85vh] animate-in zoom-in-95 duration-300 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Glow effect */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-1)]/50 to-transparent" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-32 bg-[var(--accent-1)]/20 blur-[50px] rounded-full pointer-events-none" />

        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--glass-border)] shrink-0 relative z-10 bg-[var(--glass-bg)]">
          <h3 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] flex items-center gap-2">
            <Layers size={18} className="text-[var(--accent-1)]" />
            选择并添加工作流 LoRA
          </h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] rounded-full transition-colors p-2 cursor-pointer">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-[var(--glass-border)] shrink-0 relative z-10 bg-[var(--bg-layer-1)]">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-[var(--accent-1)] transition-colors" size={18} />
            <input
              type="text"
              placeholder="搜索 LoRA 模型名称..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-base)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-all"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[var(--glass-border)] scrollbar-track-transparent relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-24">
            {filteredLoras.map(lora => {
              const isSelected = selectedLoras.includes(lora);
              const displayName = lora.split('/').pop() || lora;
              return (
                <button
                  key={lora}
                  onClick={() => onToggle(lora)}
                  className={`text-left p-4 rounded-2xl border flex items-center justify-between transition-all duration-300 group cursor-pointer ${
                    isSelected 
                      ? 'bg-gradient-to-r from-[var(--accent-1)]/10 to-[var(--accent-2)]/5 border-[var(--accent-1)]/50 shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.1)]' 
                      : 'bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/5'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <p className={`text-sm font-bold truncate leading-relaxed transition-colors ${isSelected ? 'text-[var(--accent-1)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`} title={lora}>{displayName}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] truncate" title={lora}>{lora}</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[var(--accent-1)] text-white shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.5)]' : 'bg-[var(--glass-bg)] text-transparent group-hover:bg-[var(--glass-bg-hover)] group-hover:text-[var(--text-secondary)] border border-[var(--glass-border)]'}`}>
                    <Check size={12} />
                  </div>
                </button>
              );
            })}
            {filteredLoras.length === 0 && (
              <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-20 text-[var(--text-secondary)] gap-4">
                <div className="w-16 h-16 rounded-full bg-[var(--glass-bg)] flex items-center justify-center">
                  <Layers size={24} className="opacity-50" />
                </div>
                <span className="text-sm font-bold tracking-wide">没有找到匹配的 LoRA 模型</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[var(--bg-layer-2)] via-[var(--bg-layer-2)]/85 to-transparent shrink-0 z-20 pointer-events-none">
          <button 
            onClick={onClose}
            className="w-full max-w-sm mx-auto flex items-center justify-center py-3.5 bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] text-white rounded-2xl text-sm font-bold shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.5)] hover:opacity-90 transition-all active:scale-[0.98] cursor-pointer pointer-events-auto"
          >
            完成选择
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('main-content-area') || document.body
  );
}
