import { useState, useEffect } from 'react';
import { Sparkles, X, Plus, Image } from 'lucide-react';
import { PRESET_STYLES } from '../../data/styles';
import type { PresetStyle } from '../../data/styles';
import { invoke } from '@tauri-apps/api/core';

interface StyleSelectorProps {
  selectedStyles: PresetStyle[];
  onChange: (styles: PresetStyle[]) => void;
}

export function StyleSelector({ selectedStyles, onChange }: StyleSelectorProps) {
  const [activeTab, setActiveTab] = useState<'全部' | '画风' | '色调' | '场景' | '自定义'>('全部');
  const [customStyles, setCustomStyles] = useState<PresetStyle[]>([]);
  
  // Custom Style Creator state
  const [showCreator, setShowCreator] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleTrigger, setNewStyleTrigger] = useState('');

  const fetchCustomStyles = async () => {
    try {
      const dbStyles = await invoke<any[]>('get_custom_styles');
      const formatted = dbStyles.map(s => ({
        id: s.id,
        name: s.name,
        trigger: s.trigger,
        category: '自定义',
        preview: s.preview || undefined
      }));
      setCustomStyles(formatted);
    } catch (e) {
      console.error("Failed to fetch custom styles:", e);
    }
  };

  useEffect(() => {
    fetchCustomStyles();
  }, []);

  const handleAddCustomStyle = async () => {
    const name = newStyleName.trim();
    const trigger = newStyleTrigger.trim();
    if (!name || !trigger) return;

    try {
      await invoke('add_custom_style', {
        name,
        trigger,
        category: '自定义',
        preview: null
      });
      setNewStyleName('');
      setNewStyleTrigger('');
      setShowCreator(false);
      fetchCustomStyles();
    } catch (e) {
      console.error("Failed to add custom style:", e);
    }
  };

  const handleDeleteCustomStyle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('delete_custom_style', { id });
      // Deselect if deleted style was selected
      onChange(selectedStyles.filter(s => s.id !== id));
      fetchCustomStyles();
    } catch (err) {
      console.error("Failed to delete custom style:", err);
    }
  };

  const toggleStyle = (style: PresetStyle) => {
    const exists = selectedStyles.some(s => s.id === style.id);
    if (exists) {
      onChange(selectedStyles.filter(s => s.id !== style.id));
    } else {
      onChange([...selectedStyles, style]);
    }
  };

  const getFilteredStyles = () => {
    const allList = [...PRESET_STYLES, ...customStyles];
    if (activeTab === '全部') return allList;
    return allList.filter(s => s.category === activeTab);
  };

  const categories: ('全部' | '画风' | '色调' | '场景' | '自定义')[] = ['全部', '画风', '色调', '场景', '自定义'];

  return (
    <div className="w-full flex flex-col gap-3 rounded-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] p-4 shadow-[inset_0_2px_15px_rgba(0,0,0,0.1)] transition-all duration-300">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent-1)]" />
          <span className="text-sm font-semibold tracking-wide text-[var(--text-secondary)]">艺术画风</span>
        </div>
        {activeTab === '自定义' && (
          <button
            onClick={() => setShowCreator(!showCreator)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-1)] hover:bg-[var(--accent-1)]/80 text-white text-xs font-medium transition-all shadow-md"
          >
            <Plus size={12} />
            <span>新增风格</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => {
              setActiveTab(cat);
              setShowCreator(false);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 border ${
              activeTab === cat
                ? 'bg-[var(--accent-1)]/15 border-[var(--accent-1)]/30 text-[var(--accent-1)]'
                : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Custom Style Creator Form */}
      {showCreator && activeTab === '自定义' && (
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/20 border border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
          <input
            type="text"
            placeholder="风格名称 (如: 赛博朋克)"
            value={newStyleName}
            onChange={(e) => setNewStyleName(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/5 text-xs text-white focus:outline-none focus:border-[var(--accent-1)]/30"
          />
          <textarea
            placeholder="风格提示词 (如: cyberpunk, neon lights, night view)"
            value={newStyleTrigger}
            onChange={(e) => setNewStyleTrigger(e.target.value)}
            className="w-full h-16 px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/5 text-xs text-white focus:outline-none focus:border-[var(--accent-1)]/30 resize-none"
          />
          <div className="flex gap-2 justify-end mt-1">
            <button
              onClick={() => setShowCreator(false)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
            >
              取消
            </button>
            <button
              onClick={handleAddCustomStyle}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-1)] hover:bg-[var(--accent-1)]/80 text-white text-xs font-medium transition-all shadow-md"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* Grid of Styles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[220px] overflow-y-auto custom-scrollbar p-0.5">
        {getFilteredStyles().map(style => {
          const isSelected = selectedStyles.some(s => s.id === style.id);
          return (
            <div
              key={style.id}
              onClick={() => toggleStyle(style)}
              className={`relative flex flex-col justify-end h-16 rounded-xl border p-2 cursor-pointer transition-all duration-300 overflow-hidden group select-none shadow-sm ${
                isSelected
                  ? 'border-[var(--accent-1)] bg-[var(--accent-1)]/10 ring-1 ring-[var(--accent-1)]'
                  : 'border-white/5 bg-black/10 hover:border-white/20 hover:bg-black/20'
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-10 group-hover:opacity-20 transition-opacity">
                <Image size={24} className="text-white" />
              </div>
              <span className="relative z-10 text-[11px] font-semibold text-white/90 truncate group-hover:text-white transition-colors">
                {style.name}
              </span>
              {style.category === '自定义' && (
                <button
                  onClick={(e) => handleDeleteCustomStyle(style.id, e)}
                  className="absolute top-1 right-1 p-0.5 rounded text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all z-20"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Selection Tags View */}
      {selectedStyles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
          {selectedStyles.map(style => (
            <div
              key={style.id}
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/20 text-[10px] font-medium text-[var(--accent-1)]"
            >
              <span>{style.name}</span>
              <button
                onClick={() => toggleStyle(style)}
                className="p-0.5 rounded hover:bg-white/10"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
