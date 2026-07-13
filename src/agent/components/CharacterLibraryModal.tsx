/**
 * CharacterLibraryModal — 全屏角色/画师选择器
 * 直连本地角色图鉴（36,492 角色 + 15,000 画师），支持搜索/作品筛选/多选
 * 复用 invoke('search_characters') / invoke('search_artists') 分页接口
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, X, User, Palette, Check, Flame, Heart, AlertCircle, Loader2, SlidersHorizontal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { VirtuosoGrid } from "react-virtuoso";
import type { CharacterCard } from "../types";
import type { Character, Artist, SeriesOption } from "../../stores/libraryStore";

const PAGE_SIZE = 60;
const CHAR_BASE = "https://blobs.animadex.net/Outputs/thumbs";
const ARTIST_BASE = "https://blobs.animadex.net/ArtistOutputs/thumbs";

interface CharacterLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialKind?: "character" | "artist";
  initialSeries?: string | null;
  onConfirm: (selected: CharacterCard[]) => void;
}

export function CharacterLibraryModal({
  isOpen,
  onClose,
  initialKind = "character",
  initialSeries = null,
  onConfirm,
}: CharacterLibraryModalProps) {
  const [kind, setKind] = useState<"character" | "artist">(initialKind);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<string | null>(initialSeries ?? null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false);

  // 结果列表（自管分页，不污染图鉴页面）
  const [results, setResults] = useState<(Character | Artist)[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  // 多选
  const [selected, setSelected] = useState<Map<string, CharacterCard>>(new Map());

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isArtist = kind === "artist";

  // ── 防抖搜索 ──
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // ── 拉取作品列表（仅角色有作品分类）──
  useEffect(() => {
    if (!isArtist) {
      invoke<SeriesOption[]>("get_character_series")
        .then(setSeriesList)
        .catch(() => {});
    }
  }, [isArtist]);

  // ── 首次打开 / kind / 过滤条件变化时重置并加载首页 ──
  const loadPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      setIsLoading(true);
      setIsError(false);
      try {
        if (isArtist) {
          const rows = await invoke<Artist[]>("search_artists", {
            search: debouncedQuery || null,
            limit: PAGE_SIZE,
            offset: pageNum * PAGE_SIZE,
            favorite: showFavorites ? true : null,
          });
          setResults((prev) => (replace ? rows : [...prev, ...rows]));
          setHasMore(rows.length === PAGE_SIZE);
        } else {
          const rows = await invoke<Character[]>("search_characters", {
            search: debouncedQuery || null,
            series: selectedSeries,
            limit: PAGE_SIZE,
            offset: pageNum * PAGE_SIZE,
            favorite: showFavorites ? true : null,
          });
          setResults((prev) => (replace ? rows : [...prev, ...rows]));
          setHasMore(rows.length === PAGE_SIZE);
        }
      } catch (e) {
        console.error("CharacterLibraryModal load failed:", e);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [isArtist, debouncedQuery, selectedSeries, showFavorites]
  );

  // 条件变化 → 重置到首页
  useEffect(() => {
    if (!isOpen) return;
    setPage(0);
    setHasMore(true);
    setResults([]);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, kind, debouncedQuery, selectedSeries, showFavorites]);

  // kind 变化时清空作品筛选（画师没有作品分类）
  useEffect(() => {
    if (isArtist) setSelectedSeries(null);
  }, [isArtist]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    loadPage(next, false);
  }, [isLoading, hasMore, page, loadPage]);

  // ── 转换为 CharacterCard ──
  const toCard = useCallback(
    (item: Character | Artist): CharacterCard => {
      if (isArtist) {
        const a = item as Artist;
        return {
          id: a.id,
          name: a.nameZh || a.nameEn || a.artistTag,
          nameEn: a.nameEn,
          trigger: a.trigger || a.artistTag,
          imageUrl: a.imgUrl ? `${ARTIST_BASE}/${encodeURIComponent(a.imgUrl)}` : undefined,
          source: undefined,
          tags: [],
        };
      }
      const c = item as Character;
      return {
        id: c.id,
        name: c.nameZh || c.nameEn || c.characterTag,
        nameEn: c.nameEn,
        trigger: c.trigger || c.characterTag,
        imageUrl: c.imgUrl ? `${CHAR_BASE}/${encodeURIComponent(c.imgUrl)}` : undefined,
        source: c.seriesZh || c.series || undefined,
        tags: [],
      };
    },
    [isArtist]
  );

  const toggleSelect = useCallback(
    (item: Character | Artist) => {
      const card = toCard(item);
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(card.id)) {
          next.delete(card.id);
        } else {
          next.set(card.id, card);
        }
        return next;
      });
    },
    [toCard]
  );

  const removeSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selected.size === 0) return;
    onConfirm([...selected.values()]);
    setSelected(new Map());
    setSearchQuery("");
    setSelectedSeries(null);
    setShowFavorites(false);
  }, [selected, onConfirm]);

  const handleClose = useCallback(() => {
    setSelected(new Map());
    setSearchQuery("");
    setSelectedSeries(null);
    setShowFavorites(false);
    onClose();
  }, [onClose]);

  const selectedList = useMemo(() => [...selected.values()], [selected]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="absolute inset-0 z-[200] flex items-center justify-center bg-[var(--bg-layer-0)]/70 backdrop-blur-md animate-in fade-in duration-300"
      onClick={handleClose}
    >
      <div
        className="w-[97%] max-w-3xl relative bg-[var(--bg-layer-2)]/85 backdrop-blur-3xl border border-[var(--glass-border)] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_var(--glass-border)] flex flex-col h-[88vh] animate-in zoom-in-95 duration-300 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部光效 */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-2)]/50 to-transparent pointer-events-none" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-32 bg-[var(--accent-2)]/20 blur-[50px] rounded-full pointer-events-none" />

        {/* ── 标题栏 + 角色/画师 Tab ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0 relative z-10 bg-[var(--glass-bg)]">
          <h3 className="font-bold text-base text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] flex items-center gap-2">
            {isArtist ? <Palette size={16} className="text-[var(--accent-2)]" /> : <User size={16} className="text-[var(--accent-1)]" />}
            选择{isArtist ? "画师" : "角色"}
          </h3>

          {/* kind Tab */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            <button
              onClick={() => setKind("character")}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                !isArtist ? "bg-[var(--accent-1)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <User size={11} /> 角色
            </button>
            <button
              onClick={() => setKind("artist")}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                isArtist ? "bg-[var(--accent-2)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Palette size={11} /> 画师
            </button>
          </div>

          <button
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] rounded-full transition-colors p-1.5 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── 搜索 + 过滤栏 ── */}
        <div className="p-3 border-b border-[var(--glass-border)] shrink-0 relative z-10 bg-[var(--bg-layer-1)] flex items-center gap-2 flex-wrap">
          <div className="relative group flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-[var(--accent-1)] transition-colors" size={15} />
            <input
              type="text"
              placeholder={isArtist ? "搜索画师名/标签..." : "搜索角色名/标签/作品..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-base)] border border-[var(--glass-border)] rounded-xl py-2 pl-9 pr-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 作品筛选（仅角色） */}
          {!isArtist && (
            <div className="relative">
              <button
                onClick={() => setShowSeriesDropdown((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium border transition-all cursor-pointer ${
                  selectedSeries
                    ? "bg-[var(--accent-1)]/15 text-[var(--accent-1)] border-[var(--accent-1)]/40"
                    : "bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:text-[var(--text-primary)]"
                }`}
              >
                <SlidersHorizontal size={12} />
                {selectedSeries
                  ? seriesList.find((s) => s.series === selectedSeries)?.seriesZh || seriesList.find((s) => s.series === selectedSeries)?.series || "作品"
                  : "全部作品"}
              </button>
              {showSeriesDropdown && (
                <>
                  <div className="fixed inset-0 z-[210]" onClick={() => setShowSeriesDropdown(false)} />
                  <div className="absolute top-full right-0 mt-1 w-56 max-h-72 overflow-y-auto custom-scrollbar bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl shadow-2xl z-[211] py-1">
                    <button
                      onClick={() => {
                        setSelectedSeries(null);
                        setShowSeriesDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--glass-bg-hover)] ${
                        selectedSeries === null ? "text-[var(--accent-1)] font-bold" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      全部作品
                    </button>
                    {seriesList.map((s) => (
                      <button
                        key={s.series}
                        onClick={() => {
                          setSelectedSeries(s.series);
                          setShowSeriesDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[12px] flex items-center justify-between hover:bg-[var(--glass-bg-hover)] ${
                          selectedSeries === s.series ? "text-[var(--accent-1)] font-bold" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <span className="truncate pr-2">{s.seriesZh || s.series}</span>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">{s.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 收藏过滤 */}
          <button
            onClick={() => setShowFavorites((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium border transition-all cursor-pointer ${
              showFavorites
                ? "bg-pink-500/15 text-pink-400 border-pink-500/40"
                : "bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:text-[var(--text-primary)]"
            }`}
            title="仅看收藏"
          >
            <Heart size={12} fill={showFavorites ? "currentColor" : "none"} />
          </button>
        </div>

        {/* ── 内容区：虚拟滚动卡片网格 ── */}
        <div className="flex-1 relative z-10 overflow-hidden">
          {isError ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <AlertCircle size={26} className="text-red-500" />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-bold text-red-400 mb-0.5">加载失败</p>
                <p className="text-[11px] text-[var(--text-muted)]">无法读取本地角色库</p>
              </div>
              <button
                onClick={() => loadPage(0, true)}
                className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl text-[12px] font-bold transition-colors cursor-pointer"
              >
                重试
              </button>
            </div>
          ) : results.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] gap-3">
              <div className="w-14 h-14 rounded-full bg-[var(--glass-bg)] flex items-center justify-center">
                {isArtist ? <Palette size={24} className="opacity-50" /> : <User size={24} className="opacity-50" />}
              </div>
              <span className="text-[13px] font-bold tracking-wide">没有找到匹配的{isArtist ? "画师" : "角色"}</span>
            </div>
          ) : (
            <VirtuosoGrid
              className="custom-scrollbar"
              data={results}
              listClassName="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 p-3"
              itemContent={(index) => {
                const item = results[index];
                const card = toCard(item);
                const isSelected = selected.has(card.id);
                const displayName = isArtist ? (item as Artist).artistTag : (item as Character).characterTag;
                const count = isArtist ? (item as Artist).count : (item as Character).count;
                const Icon = isArtist ? Palette : User;
                return (
                  <button
                    onClick={() => toggleSelect(item)}
                    className={`group relative p-1.5 rounded-xl border flex flex-col items-center min-w-0 w-full overflow-hidden transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "bg-gradient-to-br from-[var(--accent-1)]/15 to-[var(--accent-2)]/10 border-[var(--accent-1)]/50 shadow-[0_0_15px_rgba(var(--accent-1-rgb),0.15)]"
                        : "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:border-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/5"
                    }`}
                  >
                    {/* 选中角标 */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-[var(--accent-1)] flex items-center justify-center shadow-[0_0_8px_rgba(var(--accent-1-rgb),0.5)]">
                        <Check size={9} className="text-white" />
                      </div>
                    )}

                    {/* 头像 */}
                    <div className="w-full aspect-square rounded-lg bg-[var(--bg-layer-0)] border border-[var(--glass-border)] mb-1 overflow-hidden flex items-center justify-center">
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = "none";
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector(".fallback-icon")) {
                              const span = document.createElement("span");
                              span.className = "fallback-icon";
                              span.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); opacity:0.4"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`;
                              parent.appendChild(span);
                            }
                          }}
                        />
                      ) : (
                        <Icon size={18} className="text-[var(--text-muted)] opacity-40" />
                      )}
                    </div>

                    {/* 名称 */}
                    <div className="w-full min-w-0 text-[10px] font-bold text-[var(--text-primary)] line-clamp-1 text-center break-all">{card.name}</div>
                    {card.nameEn && card.nameEn !== card.name && (
                      <div className="w-full min-w-0 text-[8px] text-[var(--text-muted)] line-clamp-1 text-center break-all font-mono">{card.nameEn}</div>
                    )}

                    {/* count + source */}
                    <div className="w-full flex items-center justify-center gap-1 mt-0.5">
                      {count > 0 && (
                        <span className="flex items-center gap-0.5 text-[8px] text-[var(--accent-1)]/70">
                          <Flame size={7} />
                          {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                        </span>
                      )}
                      {card.source && <span className="text-[8px] text-[var(--text-secondary)] truncate">{card.source}</span>}
                    </div>
                  </button>
                );
              }}
              endReached={loadMore}
              components={{
                Footer: () =>
                  isLoading ? (
                    <div className="col-span-full flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin text-[var(--accent-1)]" />
                    </div>
                  ) : null,
              }}
            />
          )}
        </div>

        {/* ── 底部已选栏 + 确认按钮 ── */}
        <div className="shrink-0 border-t border-[var(--glass-border)] bg-gradient-to-t from-[var(--bg-layer-2)] via-[var(--bg-layer-2)]/95 to-transparent p-3 relative z-20">
          {selectedList.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5 flex-wrap max-h-16 overflow-y-auto custom-scrollbar">
              {selectedList.map((card) => (
                <span
                  key={card.id}
                  className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-md bg-[var(--accent-1)]/15 text-[var(--accent-1)] text-[10px] font-medium border border-[var(--accent-1)]/30"
                >
                  <span className="truncate max-w-[80px]">{card.name}</span>
                  <button onClick={() => removeSelected(card.id)} className="hover:text-red-400 p-0.5">
                    <X size={9} />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setSelected(new Map())}
                className="text-[10px] text-[var(--text-muted)] hover:text-red-400 px-1"
              >
                清空
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-secondary)]">
              {selectedList.length > 0 ? `已选 ${selectedList.length} 个` : "点击卡片多选"}
            </span>
            <button
              onClick={handleConfirm}
              disabled={selectedList.length === 0}
              className="ml-auto px-5 py-2 bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] text-white rounded-xl text-[12px] font-bold shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.5)] hover:opacity-90 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-1"
            >
              <Check size={13} />
              确认选择{selectedList.length > 0 ? `(${selectedList.length})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.getElementById("main-content-area") || document.body
  );
}
