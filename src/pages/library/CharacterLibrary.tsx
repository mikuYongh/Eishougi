import { useEffect, useState, useRef } from "react";
import { useLibraryStore } from "../../stores/libraryStore";
import { Search, Star, Heart, Flame, Loader2, AlertCircle, Filter } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";

import { ItemDetailModal } from "../../components/library/ItemDetailModal";
import type { Character, SeriesOption } from "../../stores/libraryStore";
import { useDevice } from "../../hooks/useDevice";

export function CharacterLibrary() {
  const { isMobile } = useDevice();
  const [selectedItem, setSelectedItem] = useState<Character | null>(null);

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

  useEffect(() => {
    fetchSeriesList();
    if (characters.length === 0) {
      loadMoreCharacters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSeriesSelect = (series: string | null) => {
    if (selectedSeries === series) {
      setSeriesFilter(null);
    } else {
      setSeriesFilter(series);
    }
  };

  const renderSeriesSidebar = () => {
    return (
      <div className="hidden md:flex flex-col w-64 h-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--glass-border)] bg-[var(--bg-layer-2)]/50">
          <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Filter size={16} className="text-[var(--accent-1)]" />
            作品分类
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
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

  const renderMobileSeriesTabs = () => {
    return (
      <div className="md:hidden w-full overflow-x-auto no-scrollbar py-2 border-b border-[var(--glass-border)]">
        <div className="flex gap-2 px-1 w-max">
          <button
            onClick={() => handleSeriesSelect(null)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedSeries === null
                ? "bg-[var(--accent-1)] text-white shadow-md shadow-[var(--accent-1)]/30"
                : "bg-[var(--bg-layer-1)] text-[var(--text-secondary)] border border-[var(--glass-border)]"
            }`}
          >
            全部
          </button>
          {seriesList.map((s) => (
            <button
              key={s.series}
              onClick={() => handleSeriesSelect(s.series)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedSeries === s.series
                  ? "bg-[var(--accent-1)] text-white shadow-md shadow-[var(--accent-1)]/30"
                  : "bg-[var(--bg-layer-1)] text-[var(--text-secondary)] border border-[var(--glass-border)]"
              }`}
            >
              {s.seriesZh || s.series}
              <span className={`text-[10px] opacity-70`}>{s.count}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full gap-4 relative">
      {/* Sidebar for Desktop */}
      {!isMobile && renderSeriesSidebar()}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full min-w-0">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="hidden md:block">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">角色图鉴</h1>
            <p className="text-[var(--text-secondary)] text-sm">海量角色库，支持一键加入提示词</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* Model Type Selector */}
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
                className="w-full bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-all"
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

        {/* Mobile Series Tabs */}
        {isMobile && renderMobileSeriesTabs()}

        {/* Grid View using Virtuoso */}
        <div className="flex-1 min-h-0 relative mt-2 md:mt-0">
          {isCharactersLoading && characters.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
              <Loader2 size={32} className="animate-spin text-[var(--accent-1)]" />
              <span className="text-sm">正在加载角色数据...</span>
            </div>
          ) : characters.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
              <AlertCircle size={32} className="text-yellow-500" />
              <span className="text-sm">没有匹配的角色数据</span>
              <button onClick={() => loadMoreCharacters()} className="px-4 py-1.5 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] text-sm hover:bg-[var(--accent-1)]/30 transition-colors">重新加载</button>
            </div>
          ) : (
          <VirtuosoGrid
            style={{ height: "100%", width: "100%" }}
            data={characters}
            endReached={loadMoreCharacters}
            listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-10 pr-2"
            itemClassName="flex"
            itemContent={(index, character) => (
              <div 
                className="w-full relative group cursor-pointer rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-layer-1)] hover:border-[var(--accent-1)]/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] flex flex-col"
                onClick={() => setSelectedItem(character)}
              >
                {/* Image Container */}
                <div className="aspect-[3/4] w-full bg-[var(--bg-layer-2)] relative overflow-hidden">
                  {character.imgUrl ? (
                    <img
                      src={`https://blobs.animadex.net/Outputs/thumbs/${encodeURIComponent(character.imgUrl)}`}
                      alt={character.nameEn}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
                        (e.target as HTMLImageElement).className = "w-full h-full object-contain p-8 opacity-20";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] opacity-50">
                      No Image
                    </div>
                  )}
                  
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

                  {/* Popularity Badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-xs text-white/90">
                    <Flame size={12} className="text-orange-400" />
                    {character.count}
                  </div>

                  {/* Favorite Button */}
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

                {/* Info Area */}
                <div className="absolute bottom-0 inset-x-0 p-3 pt-8 flex flex-col justify-end pointer-events-none">
                  {/* Series Badge */}
                  {(character.seriesZh || character.series) && (
                    <div className="mb-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--accent-1)]/20 text-[var(--accent-1)] border border-[var(--accent-1)]/30 backdrop-blur-sm truncate max-w-full">
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
            )}
          />
          )}
        </div>
      </div>

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onToggleFavorite={toggleCharacterFavorite}
          isArtist={false}
        />
      )}
    </div>
  );
}
