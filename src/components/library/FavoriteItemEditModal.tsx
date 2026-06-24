import { useState, useRef } from "react";
import { useFavoriteLibraryStore } from "../../stores/favoriteLibraryStore";
import type { FavoriteCharacter, FavoriteArtist } from "../../stores/favoriteLibraryStore";
import { X, Image as ImageIcon, Loader2, Plus, Tag } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

interface FavoriteItemEditModalProps {
  item: FavoriteCharacter | FavoriteArtist;
  onClose: () => void;
  isArtist: boolean;
}

export function FavoriteItemEditModal({ item, onClose, isArtist }: FavoriteItemEditModalProps) {
  const [displayName, setDisplayName] = useState(item.displayName || "");
  const [trigger, setTrigger] = useState(item.trigger || "");
  const [notes, setNotes] = useState(item.notes || "");
  
  // Custom tag state for characters
  const [tags, setTags] = useState<string[]>((item as FavoriteCharacter).tags || []);
  const [newTag, setNewTag] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const favStore = useFavoriteLibraryStore();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        // Save the image via backend
        const savedPath = await invoke<string>("save_base64_image", { base64Data });
        
        // Update the item
        if (isArtist) {
          await favStore.updateArtist(item.id, { exampleImage: savedPath });
        } else {
          await favStore.updateCharacter(item.id, { exampleImage: savedPath });
        }
        
        // Refresh local state without closing
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to upload image", err);
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isArtist) {
        await favStore.updateArtist(item.id, { displayName, trigger, notes });
      } else {
        await favStore.updateCharacter(item.id, { displayName, trigger, notes, tags });
      }
      onClose();
    } catch (e) {
      console.error("Failed to save changes", e);
    } finally {
      setIsSaving(false);
    }
  };

  const getImgSrc = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    if (url.includes('/') || url.includes('\\\\')) return convertFileSrc(url);
    return `https://blobs.animadex.net/Outputs/thumbs/${encodeURIComponent(url)}`;
  };

  // Auto-refresh the image src using the store data in case it was just uploaded
  const currentStoreItem = isArtist 
    ? favStore.artists.find(a => a.id === item.id) 
    : favStore.characters.find(c => c.id === item.id);
  
  const imgSrc = getImgSrc(currentStoreItem?.resolvedImage || item.resolvedImage);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-auto max-h-full animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left column - Image */}
        <div className="w-full md:w-[280px] shrink-0 bg-[var(--bg-layer-2)] relative group flex flex-col">
          <div className="aspect-[3/4] w-full relative overflow-hidden bg-black/50">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="Demo"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] gap-2">
                <ImageIcon size={48} className="opacity-20" />
                <span className="text-sm">暂无示例图片</span>
              </div>
            )}
            
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-white font-medium transition-all"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                更换图片
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>

          <div className="p-4 bg-[var(--bg-layer-2)] border-t border-[var(--glass-border)] flex-1">
            <div className="text-xs text-[var(--text-muted)] mb-1">标识符 (Tag)</div>
            <div className="font-mono text-sm text-[var(--accent-1)] break-all px-2 py-1 bg-[var(--bg-layer-1)] rounded border border-[var(--glass-border)]">
              {isArtist ? (item as FavoriteArtist).artistTag : (item as FavoriteCharacter).characterTag}
            </div>
            
            <div className="mt-3 text-xs text-[var(--text-muted)] mb-1">来源 (Source)</div>
            <div className="inline-flex items-center px-2 py-1 rounded bg-[var(--bg-layer-1)] border border-[var(--glass-border)] text-xs font-bold text-[var(--text-secondary)]">
              {item.source.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Right column - Editable Fields */}
        <div className="flex-1 flex flex-col min-w-0 max-h-[70vh] md:max-h-none overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between p-4 sm:p-6 pb-4 border-b border-[var(--glass-border)] sticky top-0 bg-[var(--bg-layer-1)] z-10">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">编辑收藏资料</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                显示名称 (Display Name)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="例如：初音未来"
                className="w-full bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
              />
            </div>

            {/* Trigger Words */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                触发词 (Trigger Words)
              </label>
              <textarea
                value={trigger}
                onChange={e => setTrigger(e.target.value)}
                placeholder="例如：hatsune miku, vocaloid..."
                rows={2}
                className="w-full bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)] transition-colors custom-scrollbar"
              />
            </div>

            {/* Tags (Characters only) */}
            {!isArtist && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1 flex items-center gap-1.5">
                  <Tag size={14} /> 自定义标签 (Custom Tags)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] text-xs border border-[var(--accent-1)]/30">
                      {tag}
                      <button onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        if (!tags.includes(newTag.trim())) setTags([...tags, newTag.trim()]);
                        setNewTag('');
                      }
                    }}
                    placeholder="输入标签后按回车..."
                    className="flex-1 bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
                  />
                  <button
                    onClick={() => {
                      if (newTag.trim() && !tags.includes(newTag.trim())) {
                        setTags([...tags, newTag.trim()]);
                        setNewTag('');
                      }
                    }}
                    className="p-1.5 bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--accent-1)] transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                私人备忘录 (Notes)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="记录一些生成该角色的心得、固定负面提示词等..."
                rows={3}
                className="w-full bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)] transition-colors custom-scrollbar"
              />
            </div>
          </div>

          <div className="mt-auto p-4 sm:p-6 border-t border-[var(--glass-border)] flex justify-end gap-3 bg-[var(--bg-layer-1)]">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white bg-[var(--accent-1)] hover:bg-[var(--accent-1-hover)] disabled:opacity-50 transition-all shadow-md shadow-[var(--accent-1)]/30"
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
