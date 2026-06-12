import { useEffect } from "react";
import { useLibraryStore } from "../../stores/libraryStore";
import { Search, Star, Heart, Flame } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";

export function ArtistLibrary() {
  const {
    artists,
    artistSearch,
    artistShowFavorites,
    setArtistSearch,
    toggleArtistFavoriteFilter,
    loadMoreArtists,
    toggleArtistFavorite,
  } = useLibraryStore();

  useEffect(() => {
    // Initial load if empty
    if (artists.length === 0) {
      loadMoreArtists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">风格画师</h1>
          <p className="text-[var(--text-muted)] text-sm">探索并使用海量画师的独特风格</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Model Type Selector */}
          <div className="flex p-1 bg-black/20 rounded-lg border border-[var(--glass-border)] hidden sm:flex">
            <button className="px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-[var(--accent-1)] text-white shadow-md">
              Anima
            </button>
            <button className="px-3 py-1.5 rounded-md text-xs font-medium transition-all text-[var(--text-secondary)] opacity-50 cursor-not-allowed" title="暂未开放">
              即将推出
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-1)] transition-colors" size={16} />
            <input
              type="text"
              placeholder="搜索画师 (英文/拼音/中文)..."
              value={artistSearch}
              onChange={(e) => setArtistSearch(e.target.value)}
              className="w-full md:w-64 bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-xl py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-all"
            />
          </div>
          <button
            onClick={toggleArtistFavoriteFilter}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              artistShowFavorites
                ? "bg-[var(--accent-1)]/20 text-[var(--accent-1)] border-[var(--accent-1)]"
                : "bg-[var(--bg-layer-1)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--bg-layer-2)]"
            }`}
          >
            <Star size={16} className={artistShowFavorites ? "fill-[var(--accent-1)]" : ""} />
            收藏
          </button>
        </div>
      </div>

      {/* Grid View using Virtuoso */}
      <div className="flex-1 min-h-0 relative">
        <VirtuosoGrid
          style={{ height: "100%", width: "100%" }}
          data={artists}
          endReached={loadMoreArtists}
          listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-10"
          itemClassName="flex"
          itemContent={(index, artist) => (
            <div className="w-full relative group cursor-pointer rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-layer-1)] hover:border-[var(--accent-1)]/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)]">
              {/* Image Container */}
              <div className="aspect-square w-full bg-[var(--bg-layer-2)] relative overflow-hidden">
                {artist.imgUrl ? (
                  <img
                    src={`https://blobs.animadex.net/ArtistOutputs/thumbs/${encodeURIComponent(artist.imgUrl)}`}
                    alt={artist.nameEn}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
                      (e.target as HTMLImageElement).className = "w-full h-full object-contain p-8 opacity-20";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] opacity-50">
                    No Image
                  </div>
                )}
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

                {/* Popularity Badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-xs text-white/90">
                  <Flame size={12} className="text-orange-400" />
                  {artist.count}
                </div>

                {/* Favorite Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleArtistFavorite(artist.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors"
                >
                  <Heart size={16} className={artist.isFavorite ? "fill-red-500 text-red-500" : "text-white/70"} />
                </button>
              </div>

              {/* Info Area */}
              <div className="absolute bottom-0 inset-x-0 p-3 pt-6 flex flex-col justify-end">
                <div className="font-bold text-white truncate text-sm">
                  {artist.nameZh || artist.nameEn}
                </div>
                {artist.nameZh && (
                  <div className="text-white/60 text-xs truncate">
                    {artist.nameEn}
                  </div>
                )}
                <div className="text-[var(--accent-1)] text-[10px] mt-1 truncate max-w-full">
                  {artist.trigger}
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
