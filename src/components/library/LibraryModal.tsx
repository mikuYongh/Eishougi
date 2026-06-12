import { useEffect, useState } from "react";
import { useLibraryStore } from "../../stores/libraryStore";
import { Search, Flame, X, Check, Users, Image as ImageIcon, Star, Heart } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tags: string) => void;
  title?: string;
}

export function LibraryModal({ isOpen, onClose, onSelect, title = "召唤图库" }: LibraryModalProps) {
  const [activeTab, setActiveTab] = useState<'characters' | 'artists'>('characters');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const {
    characters,
    artists,
    characterSearch,
    artistSearch,
    setCharacterSearch,
    setArtistSearch,
    loadMoreCharacters,
    loadMoreArtists,
    characterShowFavorites,
    artistShowFavorites,
    toggleCharacterFavoriteFilter,
    toggleArtistFavoriteFilter,
    toggleCharacterFavorite,
    toggleArtistFavorite,
  } = useLibraryStore();

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'characters' && characters.length === 0) {
        loadMoreCharacters();
      }
      if (activeTab === 'artists' && artists.length === 0) {
        loadMoreArtists();
      }
    }
  }, [isOpen, activeTab, characters.length, artists.length, loadMoreCharacters, loadMoreArtists]);

  if (!isOpen) return null;

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleConfirm = () => {
    if (selectedTags.length > 0) {
      onSelect(selectedTags.join(", "));
    }
    setSelectedTags([]);
    onClose();
  };

  const data = activeTab === 'characters' ? characters : artists;
  const searchVal = activeTab === 'characters' ? characterSearch : artistSearch;
  const setSearchVal = activeTab === 'characters' ? setCharacterSearch : setArtistSearch;
  const loadMore = activeTab === 'characters' ? loadMoreCharacters : loadMoreArtists;
  const showFavorites = activeTab === 'characters' ? characterShowFavorites : artistShowFavorites;
  const toggleFavoriteFilter = activeTab === 'characters' ? toggleCharacterFavoriteFilter : toggleArtistFavoriteFilter;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-5xl h-[85vh] flex flex-col bg-[var(--bg-layer-1)] rounded-2xl border border-[var(--glass-border)] shadow-2xl overflow-hidden relative"
        style={{
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.1)"
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              {title}
            </h2>
            
            {/* Tabs */}
            <div className="flex p-1 bg-black/20 rounded-lg border border-[var(--glass-border)]">
              <button
                onClick={() => setActiveTab('characters')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'characters' ? 'bg-[var(--accent-1)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
                }`}
              >
                <Users size={16} /> 角色
              </button>
              <button
                onClick={() => setActiveTab('artists')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'artists' ? 'bg-[var(--accent-1)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
                }`}
              >
                <ImageIcon size={16} /> 画师
              </button>
            </div>

            {/* Model Type Selector */}
            <div className="flex p-1 bg-black/20 rounded-lg border border-[var(--glass-border)] hidden md:flex ml-4">
              <button className="px-3 py-1 rounded-md text-xs font-bold transition-all bg-[var(--accent-1)] text-white shadow-md">
                Anima
              </button>
              <button className="px-3 py-1 rounded-md text-xs font-medium transition-all text-[var(--text-secondary)] opacity-50 cursor-not-allowed" title="暂未开放">
                即将推出
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group w-48 sm:w-64 hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-1)] transition-colors" size={16} />
              <input
                type="text"
                placeholder="搜索..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl py-1.5 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-all"
              />
            </div>
            
            {/* Favorite Filter Toggle */}
            <button
              onClick={toggleFavoriteFilter}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border ${
                showFavorites
                  ? "bg-[var(--accent-1)]/20 text-[var(--accent-1)] border-[var(--accent-1)]"
                  : "bg-[var(--bg-layer-1)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--bg-layer-2)]"
              }`}
              title="只看收藏"
            >
              <Star size={14} className={showFavorites ? "fill-[var(--accent-1)]" : ""} />
              <span className="hidden sm:inline">收藏</span>
            </button>

            <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-[var(--bg-layer-2)] relative">
          <VirtuosoGrid
            style={{ height: "100%", width: "100%" }}
            data={data as any[]}
            endReached={loadMore}
            listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4"
            itemClassName="flex"
            itemContent={(index, item: any) => {
              const isSelected = selectedTags.includes(item.trigger);
              const imgUrl = activeTab === 'characters' 
                ? `https://blobs.animadex.net/Outputs/thumbs/${encodeURIComponent(item.imgUrl)}`
                : `https://blobs.animadex.net/ArtistOutputs/thumbs/${encodeURIComponent(item.imgUrl)}`;

              return (
                <div 
                  onClick={() => handleToggleTag(item.trigger)}
                  className={`w-full relative group cursor-pointer rounded-xl overflow-hidden border transition-all duration-200 ${
                    isSelected ? 'border-[var(--accent-1)] ring-2 ring-[var(--accent-1)]/50 scale-[0.98]' : 'border-[var(--glass-border)] bg-[var(--bg-layer-1)] hover:border-white/30'
                  }`}
                >
                  {/* Image */}
                  <div className={`aspect-[3/4] w-full bg-black/40 relative overflow-hidden ${activeTab === 'artists' ? 'aspect-square' : ''}`}>
                    {item.imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={item.nameEn}
                        loading="lazy"
                        className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-90" />

                    {/* Pop */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-white/90">
                      <Flame size={10} className="text-orange-400" />
                      {item.count}
                    </div>

                    {/* Favorite Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeTab === 'characters') toggleCharacterFavorite(item.id);
                        else toggleArtistFavorite(item.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors z-10"
                    >
                      <Heart size={14} className={item.isFavorite ? "fill-red-500 text-red-500" : "text-white/70"} />
                    </button>

                    {/* Selection Indicator */}
                    {isSelected && (
                      <div className="absolute top-10 right-2 bg-[var(--accent-1)] text-white p-1 rounded-full shadow-lg z-10">
                        <Check size={14} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="absolute bottom-0 inset-x-0 p-2.5 pt-6 flex flex-col justify-end pointer-events-none">
                    <div className="font-bold text-white truncate text-xs">
                      {item.nameZh || item.nameEn}
                    </div>
                    {item.nameZh && (
                      <div className="text-white/60 text-[10px] truncate">
                        {item.nameEn}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-between">
          <div className="text-sm text-[var(--text-secondary)]">
            已选择: <strong className="text-[var(--accent-1)]">{selectedTags.length}</strong> 项
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedTags.length === 0}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold shadow-lg transition-all ${
                selectedTags.length > 0 
                  ? 'bg-[var(--accent-1)] hover:bg-[var(--accent-1)]/90 text-white hover:scale-105'
                  : 'bg-[var(--glass-border)] text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              <Check size={16} /> 确认插入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
