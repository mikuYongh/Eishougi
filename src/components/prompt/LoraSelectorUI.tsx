import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Layers, Plus, Trash2, Search, X, SlidersHorizontal, Check } from "lucide-react";
import type { LoraConfig } from "../../stores/promptStore";

interface LoraSelectorUIProps {
  selectedLoras: LoraConfig[];
  onChange: (loras: LoraConfig[]) => void;
  availableLoras: string[];
}

export function LoraSelectorUI({ selectedLoras, onChange, availableLoras }: LoraSelectorUIProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChipIndex, setActiveChipIndex] = useState<number | null>(null);

  const filteredLoras = useMemo(() => {
    if (!searchQuery) return availableLoras;
    const lower = searchQuery.toLowerCase();
    return availableLoras.filter(l => l.toLowerCase().includes(lower));
  }, [searchQuery, availableLoras]);

  const updateLora = (index: number, updates: Partial<LoraConfig>) => {
    const newLoras = [...selectedLoras];
    newLoras[index] = { ...newLoras[index], ...updates };
    onChange(newLoras);
  };

  const removeLora = (index: number) => {
    const newLoras = [...selectedLoras];
    newLoras.splice(index, 1);
    onChange(newLoras);
    if (activeChipIndex === index) setActiveChipIndex(null);
  };

  const toggleLoraSelect = (loraName: string) => {
    const existsIndex = selectedLoras.findIndex(l => l.name === loraName);
    if (existsIndex >= 0) {
      removeLora(existsIndex);
    } else {
      onChange([...selectedLoras, { name: loraName, strength: 0.8, enabled: true }]);
    }
  };

  return (
    <div className="flex flex-col gap-3 relative z-30">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-[var(--text-primary)] uppercase tracking-wider font-bold flex items-center gap-2">
          <Layers size={14} className="text-[var(--accent-1)] drop-shadow-[0_0_8px_rgba(var(--accent-1-rgb),0.5)]" /> 
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)]">挂载的模型 (LoRA)</span>
        </label>
        <button
          onClick={() => setIsModalOpen(true)}
          className="group flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-gradient-to-r from-[var(--accent-1)]/10 to-[var(--accent-2)]/10 text-[var(--accent-1)] border border-[var(--accent-1)]/20 rounded-lg hover:from-[var(--accent-1)]/20 hover:to-[var(--accent-2)]/20 hover:border-[var(--accent-1)]/40 hover:shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.2)] transition-all cursor-pointer"
        >
          <Plus size={14} className="group-hover:rotate-90 transition-transform duration-300" /> 添加 LoRA
        </button>
      </div>

      {/* Selected Chips */}
      <div className="flex flex-wrap gap-2">
        {selectedLoras.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)] w-full text-center py-6 border border-dashed border-[var(--glass-border)] rounded-xl bg-black/10 backdrop-blur-sm">
            暂未添加 LoRA，点击右上角添加
          </div>
        ) : (
          selectedLoras.map((lora, i) => {
            const isActive = activeChipIndex === i;
            return (
              <div key={i} className="flex flex-col gap-1 relative group/chip">
                <div 
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-all duration-300 ${
                    lora.enabled ? (isActive ? 'bg-gradient-to-br from-[var(--accent-1)]/20 to-[var(--accent-2)]/10 border-[var(--accent-1)]/50 text-[var(--accent-1)] shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.15)] scale-105' : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-primary)] hover:border-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/5') 
                    : 'bg-black/40 border-transparent text-[var(--text-muted)] opacity-60 hover:opacity-100'
                  }`}
                  onClick={() => setActiveChipIndex(isActive ? null : i)}
                >
                  <div 
                    className={`w-2.5 h-2.5 rounded-full shadow-inner transition-colors duration-300 ${lora.enabled ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-gray-500'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLora(i, { enabled: !lora.enabled });
                    }}
                  />
                  <span className="max-w-[140px] truncate tracking-wide">{lora.name}</span>
                  <div className="h-4 w-px bg-[var(--glass-border)] mx-1" />
                  <span className="text-[10px] font-mono bg-black/20 px-1.5 py-0.5 rounded text-[var(--text-secondary)]">{lora.strength.toFixed(2)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Mobile-friendly Bottom Sheet for adjusting active LoRA */}
      {activeChipIndex !== null && selectedLoras[activeChipIndex] && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setActiveChipIndex(null)}>
          <div 
            className="w-full max-w-sm relative bg-[var(--bg-layer-2)]/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-t-3xl sm:rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] p-5 flex flex-col gap-5 animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Glow effect */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-24 bg-[var(--accent-1)]/20 blur-[40px] rounded-full pointer-events-none" />

            <div className="flex items-center justify-between text-xs font-bold relative z-10">
              <span className="flex items-center gap-2 text-[var(--text-primary)] text-sm">
                <div className="p-1.5 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)]">
                  <SlidersHorizontal size={14} />
                </div>
                调整模型权重
              </span>
              <button onClick={() => removeLora(activeChipIndex)} className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-xl transition-colors cursor-pointer"><Trash2 size={16} /></button>
            </div>
            
            <div className="relative z-10 bg-black/20 p-4 rounded-2xl border border-[var(--glass-border)]">
              <div className="text-xs text-[var(--text-secondary)] font-mono mb-4 truncate">{selectedLoras[activeChipIndex].name}</div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0" max="2" step="0.05" 
                  value={selectedLoras[activeChipIndex].strength} 
                  onChange={(e) => updateLora(activeChipIndex, { strength: parseFloat(e.target.value) })}
                  className="flex-1 h-2 bg-black/50 rounded-full appearance-none cursor-pointer accent-[var(--accent-1)] shadow-inner" 
                />
                <div className="text-sm font-mono font-bold text-[var(--accent-1)] w-12 text-center bg-[var(--accent-1)]/10 px-2 py-1 rounded-lg border border-[var(--accent-1)]/20">
                  {selectedLoras[activeChipIndex].strength.toFixed(2)}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setActiveChipIndex(null)}
              className="w-full py-3 relative z-10 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] rounded-xl text-sm font-bold hover:bg-white/10 transition-colors shadow-lg cursor-pointer"
            >
              完成调整
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Modal / Bottom Sheet for Adding LoRA */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}>
          <div 
            className="w-[95%] max-w-2xl relative bg-[var(--bg-layer-2)]/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] flex flex-col h-[85vh] animate-in zoom-in-95 duration-300 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Glow effect */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-32 bg-[var(--accent-1)]/20 blur-[50px] rounded-full pointer-events-none" />

            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--glass-border)] shrink-0 relative z-10 bg-black/20">
              <h3 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] flex items-center gap-2">
                <Layers size={18} className="text-[var(--accent-1)]" />
                选择 LoRA
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-white hover:bg-white/10 rounded-full transition-colors p-2 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 border-b border-[var(--glass-border)] shrink-0 relative z-10 bg-black/10">
              <div className="relative group">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-1)] transition-colors" />
                <input
                  type="text"
                  placeholder="输入关键字搜索 LoRA..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-black/30 border border-[var(--glass-border)] rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:border-[var(--accent-1)]/50 text-[var(--text-primary)] transition-all shadow-inner focus:shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.1)]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-24">
                {filteredLoras.map(lora => {
                  const isSelected = selectedLoras.some(l => l.name === lora);
                  return (
                    <button
                      key={lora}
                      onClick={() => toggleLoraSelect(lora)}
                      className={`text-left p-4 rounded-2xl border flex items-center justify-between transition-all duration-300 group cursor-pointer ${
                        isSelected 
                          ? 'bg-gradient-to-r from-[var(--accent-1)]/10 to-[var(--accent-2)]/5 border-[var(--accent-1)]/50 shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.1)]' 
                          : 'bg-black/20 border-[var(--glass-border)] hover:border-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/5'
                      }`}
                    >
                      <span className={`text-sm font-bold truncate pr-3 leading-relaxed transition-colors ${isSelected ? 'text-[var(--accent-1)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`} title={lora}>{lora}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[var(--accent-1)] text-white shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.5)]' : 'bg-[var(--glass-bg)] text-transparent group-hover:bg-white/5 group-hover:text-white/30 border border-[var(--glass-border)]'}`}>
                        <Check size={12} />
                      </div>
                    </button>
                  );
                })}
                {filteredLoras.length === 0 && (
                  <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-20 text-[var(--text-muted)] gap-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                      <Search size={24} className="opacity-50" />
                    </div>
                    <span className="text-sm font-bold tracking-wide">未找到匹配的 LoRA 模型</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[var(--bg-layer-2)] via-[var(--bg-layer-2)]/95 to-transparent shrink-0 z-20">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-full max-w-sm mx-auto flex items-center justify-center py-3.5 bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] text-white rounded-2xl text-sm font-bold shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.5)] hover:from-[var(--accent-1)] hover:to-[var(--accent-2)] transition-all active:scale-[0.98] cursor-pointer"
              >
                完成选择
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
