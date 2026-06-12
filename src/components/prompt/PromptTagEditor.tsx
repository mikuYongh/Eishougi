import { useState, useEffect, useRef } from 'react';
import { Star, Copy, Trash2, LayoutGrid, FileText, Check, Plus, X, FolderHeart, Sparkles } from 'lucide-react';
import { useFavoriteStore } from '../../stores/favoriteStore';
import { LibraryModal } from '../library/LibraryModal';

interface PromptTagEditorProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type: 'positive' | 'negative';
}

export function PromptTagEditor({ label, value, onChange, type }: PromptTagEditorProps) {
  const [mode, setMode] = useState<'tag' | 'text'>('tag');
  const [newTag, setNewTag] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoriteLabel, setFavoriteLabel] = useState('');
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  
  const { positiveFavorites, negativeFavorites, fetchFavorites, addFavorite, deleteFavorite } = useFavoriteStore();

  const favorites = type === 'positive' ? positiveFavorites : negativeFavorites;

  useEffect(() => {
    fetchFavorites();
  }, []);

  const tags = value
    ? value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    
    // Check if tag already exists
    if (!tags.includes(trimmed)) {
      const updatedTags = [...tags, trimmed];
      onChange(updatedTags.join(', '));
    }
    setNewTag('');
  };

  const handleRemoveTag = (indexToRemove: number) => {
    const updatedTags = tags.filter((_, i) => i !== indexToRemove);
    onChange(updatedTags.join(', '));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleClear = () => {
    onChange('');
  };

  const handleAddFavoriteTag = async (tag: string) => {
    await addFavorite(tag, type);
  };

  const handleAddFavoriteAll = async () => {
    const labelVal = favoriteLabel.trim() || undefined;
    await addFavorite(value, type, labelVal);
    setFavoriteLabel('');
  };

  const handleInsertFavorite = (content: string) => {
    if (!value) {
      onChange(content);
    } else {
      onChange(`${value}, ${content}`);
    }
  };

  // Generate color based on tag content
  const getTagColor = (tag: string) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'from-pink-500/20 to-purple-500/20 border-pink-500/30 text-pink-200',
      'from-blue-500/20 to-indigo-500/20 border-blue-500/30 text-blue-200',
      'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-200',
      'from-violet-500/20 to-fuchsia-500/20 border-violet-500/30 text-violet-200',
      'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-200',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="w-full flex flex-col gap-3 rounded-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] p-4 shadow-[inset_0_2px_15px_rgba(0,0,0,0.1)] transition-all duration-300">
      {/* Editor Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <span className="text-sm font-semibold tracking-wide text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5">
            <button
              onClick={() => setMode('tag')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                mode === 'tag'
                  ? 'bg-[var(--accent-1)] text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <LayoutGrid size={13} />
              <span>标签模式</span>
            </button>
            <button
              onClick={() => setMode('text')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                mode === 'text'
                  ? 'bg-[var(--accent-1)] text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <FileText size={13} />
              <span>文本模式</span>
            </button>
          </div>

          {/* Summon Library Button */}
          {type === 'positive' && (
            <button
              onClick={() => setIsLibraryModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-[var(--accent-1)]/20 hover:bg-[var(--accent-1)] text-[var(--accent-1)] hover:text-white border border-[var(--accent-1)]/30 hover:border-transparent rounded-lg text-xs font-bold transition-all shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.2)] ml-2"
              title="召唤图库，快速插入画师或角色"
            >
              <Sparkles size={14} /> <span>召唤图库</span>
            </button>
          )}

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-[var(--text-secondary)] hover:text-white rounded-lg transition-all"
            title="复制全部"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClear}
            className="p-1.5 bg-white/5 hover:bg-red-500/20 border border-white/5 text-[var(--text-secondary)] hover:text-red-400 rounded-lg transition-all"
            title="清空"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      {mode === 'tag' ? (
        <div className="flex flex-col gap-3">
          {/* Tag Chips Container */}
          <div className="flex flex-wrap gap-2 min-h-[80px] p-3 rounded-xl bg-black/10 border border-white/5 max-h-[220px] overflow-y-auto custom-scrollbar">
            {tags.length === 0 ? (
              <span className="text-xs text-white/30 italic m-auto">暂无标签，在下方输入或从收藏夹添加</span>
            ) : (
              tags.map((tag, index) => {
                const colorClass = getTagColor(tag);
                const isFav = favorites.some(fav => fav.content === tag);
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-gradient-to-r ${colorClass} border shadow-sm group hover:scale-[1.02] transition-all duration-200`}
                  >
                    <span className="text-xs font-medium">{tag}</span>
                    <button
                      onClick={() => {
                        if (isFav) {
                          const favItem = favorites.find(fav => fav.content === tag);
                          if (favItem) deleteFavorite(favItem.id);
                        } else {
                          handleAddFavoriteTag(tag);
                        }
                      }}
                      className="p-0.5 rounded text-white/40 hover:text-yellow-400 opacity-40 group-hover:opacity-100 transition-all cursor-pointer"
                      title={isFav ? "取消收藏" : "收藏该标签"}
                    >
                      <Star size={10} className={isFav ? "text-yellow-400 fill-yellow-400" : ""} />
                    </button>
                    <button
                      onClick={() => handleRemoveTag(index)}
                      className="p-0.5 rounded text-white/40 hover:text-red-400 hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Tag Input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入标签并按回车或点击添加..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              className="flex-1 px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent-1)]/50 focus:shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.1)] transition-all"
            />
            <button
              onClick={handleAddTag}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-[var(--accent-1)] hover:bg-[var(--accent-1)]/80 text-white text-xs font-medium transition-all shadow-md active:scale-95"
            >
              <Plus size={14} />
              <span>添加</span>
            </button>
          </div>
        </div>
      ) : (
        <textarea
          placeholder="请输入提示词，用英文逗号分隔..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-32 px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent-1)]/50 focus:shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.1)] transition-all resize-none custom-scrollbar"
        />
      )}

      {/* Favorites Panel Toggle */}
      <div className="flex flex-col gap-2 mt-1">
        <button
          onClick={() => setShowFavorites(!showFavorites)}
          className="flex items-center gap-2 self-start text-xs font-medium text-[var(--accent-1)] hover:text-[var(--accent-1)]/80 transition-all"
        >
          <FolderHeart size={14} />
          <span>{showFavorites ? '隐藏收藏夹' : '查看收藏夹'}</span>
        </button>

        {showFavorites && (
          <div className="flex flex-col gap-3 p-3 rounded-xl bg-black/20 border border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Add current prompt to favorites */}
            {value && (
              <div className="flex gap-2 items-center pb-2 border-b border-white/5">
                <input
                  type="text"
                  placeholder="给当前整段提示词起个备注名..."
                  value={favoriteLabel}
                  onChange={(e) => setFavoriteLabel(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/5 text-xs text-white focus:outline-none focus:border-[var(--accent-1)]/30"
                />
                <button
                  onClick={handleAddFavoriteAll}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium border border-white/5 transition-all"
                >
                  <Star size={12} className="text-yellow-400 fill-yellow-400" />
                  <span>收藏整段</span>
                </button>
              </div>
            )}

            {/* Favorites List */}
            <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto custom-scrollbar">
              {favorites.length === 0 ? (
                <span className="text-xs text-white/30 italic">收藏夹空空如也，快去收藏一些吧</span>
              ) : (
                favorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-white/5 border border-white/5 text-xs text-white hover:border-yellow-500/30 transition-all group"
                  >
                    <button
                      onClick={() => handleInsertFavorite(fav.content)}
                      className="text-left font-medium hover:text-[var(--accent-1)] max-w-[150px] truncate"
                      title={fav.content}
                    >
                      {fav.label ? `${fav.label}: ${fav.content}` : fav.content}
                    </button>
                    <button
                      onClick={() => deleteFavorite(fav.id)}
                      className="p-0.5 rounded text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="删除收藏"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <LibraryModal 
        isOpen={isLibraryModalOpen} 
        onClose={() => setIsLibraryModalOpen(false)} 
        onSelect={handleInsertFavorite} 
      />
    </div>
  );
}
