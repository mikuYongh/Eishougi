import { useState, useMemo } from 'react';
import { Search, X, Layers } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';

interface LoraPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (loraName: string) => void;
}

export function LoraPickerModal({ isOpen, onClose, onSelect }: LoraPickerModalProps) {
  const { loras } = useModelStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLoras = useMemo(() => {
    if (!searchQuery) return loras;
    const lowerQ = searchQuery.toLowerCase();
    return loras.filter(l => l.toLowerCase().includes(lowerQ));
  }, [loras, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[70vh] max-h-[600px] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)] bg-[var(--bg-layer-2)]">
          <h3 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Layers size={18} className="text-yellow-400" /> 选择并添加 LoRA
          </h3>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-[var(--text-muted)]" />
            </div>
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索模型名称..."
              className="w-full bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none text-[var(--text-primary)] focus:border-yellow-500/50 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Lora List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredLoras.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-3">
              <Layers size={32} className="opacity-50" />
              <p className="text-sm font-bold">没有找到匹配的 LoRA 模型</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredLoras.map(lora => (
                <button
                  key={lora}
                  onClick={() => {
                    onSelect(lora);
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-transparent hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors text-left cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-layer-2)] border border-[var(--glass-border)] flex items-center justify-center group-hover:border-yellow-400/30 transition-colors flex-shrink-0">
                    <Layers size={16} className="text-[var(--text-secondary)] group-hover:text-yellow-400 transition-colors" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[var(--text-primary)] truncate" title={lora}>
                      {lora.split('/').pop() || lora}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate" title={lora}>
                      {lora}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
