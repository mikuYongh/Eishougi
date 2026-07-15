import { useEffect, useState, useRef } from "react";
import { useLibraryStore } from "../../stores/libraryStore";
import { useFavoriteLibraryStore } from "../../stores/favoriteLibraryStore";
import { Search, Star, Heart, Flame, Loader2, AlertCircle, Filter, PanelLeftClose, PanelLeftOpen, Tag } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";
import { convertFileSrc } from "@tauri-apps/api/core";

import { ItemDetailModal } from "../../components/library/ItemDetailModal";
import { FavoriteItemEditModal } from "../../components/library/FavoriteItemEditModal";
import { SearchableDropdown } from "../../components/ui/SearchableDropdown";
import type { Character, SeriesOption } from "../../stores/libraryStore";
import type { FavoriteCharacter } from "../../stores/favoriteLibraryStore";
import { useDevice } from "../../hooks/useDevice";

export function CharacterLibrary() {
  const { isMobile } = useDevice();
  const [selectedItem, setSelectedItem] = useState<Character | null>(null);
  const [selectedFavorite, setSelectedFavorite] = useState<FavoriteCharacter | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const {
    characters,
    seriesList,
    selectedSeries,
    characterSearch,
    characterShowFavorites,
    isCharactersLoading,
    setCharacterSearch,
    setSeriesFilter,
    fetchSeriesList,
    toggleCharacterFavoriteFilter,
    loadMoreCharacters,
    toggleCharacterFavorite,
  } = useLibraryStore();

  const favStore = useFavoriteLibraryStore();

  useEffect(() => {
    fetchSeriesList();
    if (characters.length === 0) {
      loadMoreCharacters();
    }
    // Fetch favorites data when entering favorite mode
    if (characterShowFavorites) {
      favStore.fetchTags();
      favStore.fetchCharacters(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterShowFavorites]);

  const handleSeriesSelect = (series: string | null) => {
    if (selectedSeries === series) {
      setSeriesFilter(null);
    } else {
      setSeriesFilter(series);
    }
  };

  const getImgSrc = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    // if it doesn't have slashes and not http, maybe it's the gallery imgUrl which is just filename?
    // Wait, gallery imgUrl is handled as https://blobs.animadex.net/Outputs/thumbs/...
    // but resolvedImage could be absolute path.
    if (url.includes('/') || url.includes('\\')) return convertFileSrc(url);
    return `https://blobs.animadex.net/Outputs/thumbs/${encodeURIComponent(url)}`;
  };

  const renderSidebar = () => {
    if (characterShowFavorites) {
      return (
        <div className={`hidden md:flex flex-col h-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl overflow-hidden shadow-sm transition-all duration-300 relative ${isSidebarOpen ? 'w-64' : 'w-0 border-0 opacity-0'}`}>
          <div className="p-4 border-b border-[var(--glass-border)] bg-[var(--bg-layer-2)]/50 flex items-center justify-between min-w-[16rem]">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Tag size={16} className="text-[var(--accent-1)]" />
              收藏标签
            </h2>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-[var(--glass-bg-hover)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-w-[16rem]">
            {favStore.tags.map((t) => (
              <button
                key={t.tag}
                onClick={() => favStore.toggleTagFilter(t.tag)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1 flex items-center justify-between group ${
                  favStore.selectedTags.includes(t.tag)
                    ? "bg-[var(--accent-1)] text-white shadow-md shadow-[var(--accent-1)]/20" 
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-layer-2)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="truncate pr-2">{t.tag}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  favStore.selectedTags.includes(t.tag)
                    ? "bg-white/20 text-white" 
                    : "bg-[var(--bg-layer-3)] text-[var(--text-muted)] group-hover:bg-[var(--accent-1)]/10 group-hover:text-[var(--accent-1)]"
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className={`hidden md:flex flex-col h-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl overflow-hidden shadow-sm transition-all duration-300 relative ${isSidebarOpen ? 'w-64' : 'w-0 border-0 opacity-0'}`}>
        <div className="p-4 border-b border-[var(--glass-border)] bg-[var(--bg-layer-2)]/50 flex items-center justify-between min-w-[16rem]">
          <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Filter size={16} className="text-[var(--accent-1)]" />
            作品分类
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-[var(--glass-bg-hover)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-w-[16rem]">
          <button
            onClick={() => handleSeriesSelect(null)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1 flex items-center justify-between ${
              selectedSeries === null 
                ? "bg-[var(--accent-1)]/10 text-[var(--accent-1)] shadow-sm" 
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-layer-2)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span>全部角色</span>
          </button>
          
          {seriesList.map((s) => (
            <button
              key={s.series}
              onClick={() => handleSeriesSelect(s.series)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1 flex items-center justify-between group ${
                selectedSeries === s.series 
                  ? "bg-[var(--accent-1)] text-white shadow-md shadow-[var(--accent-1)]/20" 
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-layer-2)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="truncate pr-2">{s.seriesZh || s.series}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                selectedSeries === s.series 
                  ? "bg-white/20 text-white" 
                  : "bg-[var(--bg-layer-3)] text-[var(--text-muted)] group-hover:bg-[var(--accent-1)]/10 group-hover:text-[var(--accent-1)]"
              }`}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMobileTabs = () => {
    if (characterShowFavorites) {
      const options = [
        { label: "所有标签", value: "" },
        ...favStore.tags.map(t => ({ label: `${t.tag} (${t.count})`, value: t.tag }))
      ];
      return (
        <div className="md:hidden w-full py-2 border-b border-[var(--glass-border)] relative z-[80]">
          <SearchableDropdown
            value={favStore.selectedTags.length > 0 ? favStore.selectedTags[0] : ""}
            onChange={(val) => {
               if (favStore.selectedTags.length > 0) favStore.toggleTagFilter(favStore.selectedTags[0]);
               if (val) favStore.toggleTagFilter(val);
            }}
            options={options}
            placeholder="所有收藏标签"
            searchPlaceholder="搜索标签..."
            containerClassName="w-full"
          />
        </div>
      );
    }

    const options = [
      { label: "全部作品分类", value: "" },
      ...seriesList.map(s => ({ label: `${s.seriesZh || s.series} (${s.count})`, value: s.series }))
    ];

    return (
      <div className="md:hidden w-full py-2 border-b border-[var(--glass-border)] relative z-[80]">
        <SearchableDropdown
          value={selectedSeries || ""}
          onChange={(val) => handleSeriesSelect(val || null)}
          options={options}
          placeholder="全部作品分类"
          searchPlaceholder="搜索作品名称..."
          containerClassName="w-full"
        />
      </div>
    );
  };

  const currentData = characterShowFavorites ? favStore.characters : characters;
  const isLoading = characterShowFavorites ? favStore.isCharactersLoading : isCharactersLoading;
  const loadMore = characterShowFavorites ? favStore.fetchCharacters : loadMoreCharacters;

  return (
    <div className="flex h-full gap-4 relative">
      {!isMobile && renderSidebar()}

      {!isMobile && !isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="hidden md:flex absolute top-[18px] left-0 z-[100] p-1.5 bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-r-xl shadow-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      <div className="flex flex-col flex-1 h-full min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="hidden md:block">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">角色图鉴</h1>
            <p className="text-[var(--text-secondary)] text-sm">海量角色库，支持一键加入创作</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="flex p-1 bg-[var(--glass-bg)] rounded-lg border border-[var(--glass-border)] hidden sm:flex">
              <button className="px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-[var(--accent-1)] text-white shadow-md">
                Anima
              </button>
              <button className="px-3 py-1.5 rounded-md text-xs font-medium transition-all text-[var(--text-secondary)] opacity-50 cursor-not-allowed" title="暂未开放">
                即将推出
              </button>
            </div>

            <div className="relative group flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-[var(--accent-1)] transition-colors" size={16} />
              <input
                type="text"
                placeholder="搜索角色、作品名..."
                value={characterSearch}
                onChange={(e) => setCharacterSearch(e.target.value)}
                disabled={characterShowFavorites}
                className={`w-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-all ${characterShowFavorites ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>
            <button
              onClick={toggleCharacterFavoriteFilter}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                characterShowFavorites
                  ? "bg-[var(--accent-1)]/20 text-[var(--accent-1)] border-[var(--accent-1)]"
                  : "bg-[var(--bg-layer-1)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--bg-layer-2)]"
              }`}
            >
              <Star size={16} className={characterShowFavorites ? "fill-[var(--accent-1)]" : ""} />
              收藏
            </button>
          </div>
        </div>

        {isMobile && renderMobileTabs()}

        <div className="flex-1 min-h-0 relative mt-2 md:mt-0">
          {isLoading && currentData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
              <Loader2 size={32} className="animate-spin text-[var(--accent-1)]" />
              <span className="text-sm">正在加载角色数据...</span>
            </div>
          ) : currentData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
              <AlertCircle size={32} className="text-yellow-500" />
              <span className="text-sm">没有匹配的数据</span>
              <button onClick={() => loadMore()} className="px-4 py-1.5 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] text-sm hover:bg-[var(--accent-1)]/30 transition-colors">重新加载</button>
            </div>
          ) : (
          <VirtuosoGrid
            style={{ height: "100%", width: "100%" }}
            data={currentData as any[]}
            endReached={() => loadMore()}
            listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-10 pr-2"
            itemClassName="flex"
            itemContent={(index, item) => {
              if (characterShowFavorites) {
                const fav = item as FavoriteCharacter;
                const imgSrc = getImgSrc(fav.resolvedImage);
                return (
                  <div 
                    className="w-full relative group cursor-pointer rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-layer-1)] hover:border-[var(--accent-1)]/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] flex flex-col"
                    onClick={() => setSelectedFavorite(fav)}
                  >
                    <div className="aspect-[3/4] w-full bg-[var(--bg-layer-2)] relative overflow-hidden">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={fav.displayName || fav.characterTag}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] opacity-50">无图片</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />
                      
                      {fav.source && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-[10px] text-white/90">
                          {fav.source}
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          favStore.removeCharacter(fav.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors"
                      >
                        <Heart size={16} className="fill-red-500 text-red-500" />
                      </button>
                    </div>

                    <div className="absolute bottom-0 inset-x-0 p-3 pt-8 flex flex-col justify-end pointer-events-none">
                      {fav.tags && fav.tags.length > 0 && (
                        <div className="mb-0.5 flex gap-1 flex-wrap">
                          {fav.tags.slice(0, 2).map(tag => (
                            <span key={tag} className="inline-flex items-center px-1.5 py-[2px] text-[9px] font-bold tracking-wider bg-black/50 text-white/90 border-l-[2px] border-[var(--accent-1)] backdrop-blur-md shadow-sm truncate max-w-[95%]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="font-bold text-white truncate text-sm shadow-sm">
                        {fav.displayName || fav.characterTag}
                      </div>
                    </div>
                  </div>
                );
              }

              const character = item as Character;
              const imgSrc = getImgSrc(character.imgUrl);
              return (
                <div 
                  className="w-full relative group cursor-pointer rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-layer-1)] hover:border-[var(--accent-1)]/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] flex flex-col"
                  onClick={() => setSelectedItem(character)}
                >
                  <div className="aspect-[3/4] w-full bg-[var(--bg-layer-2)] relative overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={character.nameEn}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] opacity-50">无图片</div>
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-xs text-white/90">
                      <Flame size={12} className="text-orange-400" />
                      {character.count}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCharacterFavorite(character.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors"
                    >
                      <Heart size={16} className={character.isFavorite ? "fill-red-500 text-red-500" : "text-white/70"} />
                    </button>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 p-3 pt-8 flex flex-col justify-end pointer-events-none">
                    {(character.seriesZh || character.series) && (
                      <div className="mb-0.5 flex">
                        <span className="inline-flex items-center px-1.5 py-[2px] text-[9px] font-bold tracking-wider bg-black/50 text-white/90 border-l-[2px] border-[var(--accent-1)] backdrop-blur-md shadow-sm truncate max-w-[95%]">
                          {character.seriesZh || character.series}
                        </span>
                      </div>
                    )}
                    
                    <div className="font-bold text-white truncate text-sm shadow-sm">
                      {character.nameZh || character.nameEn}
                    </div>
                    
                    {character.nameZh && (
                      <div className="text-white/70 text-xs truncate mt-0.5">
                        {character.nameEn}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
          )}
        </div>
      </div>

      {selectedItem && !characterShowFavorites && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onToggleFavorite={toggleCharacterFavorite}
          isArtist={false}
        />
      )}

      {selectedFavorite && characterShowFavorites && (
        <FavoriteItemEditModal
          item={selectedFavorite}
          onClose={() => setSelectedFavorite(null)}
          isArtist={false}
        />
      )}
    </div>
  );
}
