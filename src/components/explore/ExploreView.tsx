"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Search,
  X,
  Loader2,
  LayoutGrid,
  CassetteTape,
  AlertCircle,
  Film,
  Compass,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import type { SeasonalEpisodeItem } from "@/lib/seasonalEpisodes";
import { type FilterState, GENRE_OPTIONS, SEASON_OPTIONS, ERA_OPTIONS } from "./FilterBar";
import { MoodPresets } from "./MoodPresets";
import { MoreFiltersPanel } from "./MoreFiltersPanel";
import { EpisodeCard } from "./EpisodeCard";
import { VhsShelf } from "@/components/vhs/VhsShelf";
import { MediaCard } from "@/components/search/MediaCard";
import { useLibrary } from "@/lib/useLibrary";
import { usePersonalBroadcast } from "@/lib/usePersonalBroadcast";

const VhsModal = dynamic(
  () => import("@/components/vhs/VhsModal").then((mod) => mod.VhsModal),
  { ssr: false },
);

const ScheduleBroadcastModal = dynamic(
  () =>
    import("@/components/broadcast/ScheduleBroadcastModal").then(
      (mod) => mod.ScheduleBroadcastModal,
    ),
  { ssr: false },
);

const PlayerModal = dynamic(
  () => import("@/components/player/PlayerModal").then((mod) => mod.PlayerModal),
  { ssr: false },
);

const CalendarSchedulerModal = dynamic(
  () =>
    import("@/components/calendar/CalendarSchedulerModal").then(
      (mod) => mod.CalendarSchedulerModal,
    ),
  { ssr: false },
);

const INITIAL_FILTERS: FilterState = {
  type: "all",
  genreIds: [],
  seasons: [],
  eras: [],
  minRating: null,
  sortBy: "popularity.desc",
  languages: [],
};

export interface ExploreViewProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialQuery?: string;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  isEmbedded?: boolean;
}

export function ExploreView({
  isOpen = true,
  onClose,
  initialQuery = "",
  searchQuery,
  onSearchQueryChange,
  onLoadingChange,
  isEmbedded = false,
}: ExploreViewProps = {}) {
  const router = useRouter();
  const library = useLibrary();
  const personalBroadcast = usePersonalBroadcast();

  // Search & Filter state
  const [query, setQuery] = useState(searchQuery !== undefined ? searchQuery : initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery !== undefined ? searchQuery : initialQuery);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"shelf" | "grid">("shelf");

  // Keep internal query state synced when parent searchQuery changes
  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== query) {
      setQuery(searchQuery);
    }
  }, [searchQuery, query]);

  const updateQuery = (val: string) => {
    setQuery(val);
    onSearchQueryChange?.(val);
  };

  // Results state
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [episodes, setEpisodes] = useState<SeasonalEpisodeItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal interaction state
  const [selectedMedia, setSelectedMedia] = useState<{
    id: number | string;
    type: "MOVIE" | "TV" | "movie" | "tv";
    title?: string;
    initialSeason?: number;
    initialAction?: "RENT" | "BUY";
    posterUrl?: string | null;
  } | null>(null);

  const [schedulingTarget, setSchedulingTarget] = useState<{
    media: MediaSearchResult;
    season?: number;
  } | null>(null);

  const [playerTarget, setPlayerTarget] = useState<{
    media: MediaSearchResult;
    season?: number;
    episode?: number;
  } | null>(null);

  const [calendarTarget, setCalendarTarget] = useState<{
    media: MediaSearchResult;
    season?: number;
    episode?: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onClose) {
          onClose();
        } else {
          router.push("/home");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, router]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Compute active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.type !== "all") count++;
    count += filters.genreIds.length;
    count += filters.seasons.length;
    count += filters.eras.length;
    count += filters.languages.length;
    if (filters.minRating !== null) count++;
    if (filters.sortBy !== "popularity.desc") count++;
    return count;
  }, [filters]);

  // Data fetching effect
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchExploreData() {
      if (!isOpen) return;
      setIsLoading(true);
      setError(null);

      try {
        if (filters.type === "episodes") {
          // Fetch seasonal episodes
          const params = new URLURLSearchParamsSafe({
            season: filters.seasons.join(","),
            era: filters.eras.join(","),
            query: debouncedQuery,
          });
          const res = await fetch(`/api/tmdb/episodes/seasonal?${params.toString()}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Failed to load seasonal episodes.");
          const data = await res.json();
          if (!cancelled) {
            setEpisodes(data.results || []);
            setTotalResults(data.totalResults || 0);
            setTotalPages(1);
            setResults([]);
          }
        } else if (debouncedQuery) {
          // Direct search mode
          const res = await fetch(
            `/api/tmdb/search?query=${encodeURIComponent(debouncedQuery)}&page=1`,
            { signal: controller.signal },
          );
          if (!res.ok) throw new Error("Search failed.");
          const data = await res.json();
          if (!cancelled) {
            let filteredResults: MediaSearchResult[] = data.results || [];
            if (filters.type === "movie") {
              filteredResults = filteredResults.filter((item) => item.mediaType === "movie");
            } else if (filters.type === "tv") {
              filteredResults = filteredResults.filter((item) => item.mediaType === "tv");
            }
            setResults(filteredResults);
            setTotalPages(data.totalPages || 1);
            setTotalResults(filteredResults.length);
            setEpisodes([]);
          }
        } else {
          // Discover mode with filters
          const params = new URLURLSearchParamsSafe({
            type: filters.type,
            genres: filters.genreIds.join("|"),
            season: filters.seasons.join(","),
            era: filters.eras.join(","),
            sortBy: filters.sortBy,
            voteAverageGte: filters.minRating ? String(filters.minRating) : "",
            language: filters.languages.join("|"),
            page: "1",
          });

          const res = await fetch(`/api/tmdb/discover?${params.toString()}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Failed to load discover lineup.");
          const data = await res.json();
          if (!cancelled) {
            setResults(data.results || []);
            setTotalPages(data.totalPages || 1);
            setTotalResults(data.totalResults || 0);
            setEpisodes([]);
          }
        }
      } catch (err) {
        if (!cancelled && (err as Error).name !== "AbortError") {
          setError((err as Error).message || "An unexpected error occurred.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchExploreData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, filters, debouncedQuery]);

  // Load more pages for infinite exploration
  const handleLoadMore = async () => {
    if (isLoadingMore || page >= totalPages || filters.type === "episodes") return;
    const nextPage = page + 1;
    setIsLoadingMore(true);

    try {
      let url = "";
      if (debouncedQuery) {
        url = `/api/tmdb/search?query=${encodeURIComponent(debouncedQuery)}&page=${nextPage}`;
      } else {
        const params = new URLURLSearchParamsSafe({
          type: filters.type,
          genres: filters.genreIds.join("|"),
          season: filters.seasons.join(","),
          era: filters.eras.join(","),
          sortBy: filters.sortBy,
          voteAverageGte: filters.minRating ? String(filters.minRating) : "",
          language: filters.languages.join("|"),
          page: String(nextPage),
        });
        url = `/api/tmdb/discover?${params.toString()}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch more titles.");
      const data = await res.json();
      setResults((prev) => [...prev, ...(data.results || [])]);
      setPage(nextPage);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Check season ownership for an episode
  const isSeasonOwned = useCallback(
    (showId: number, seasonNumber: number) => {
      return library.owned.some(
        (item) => item.tmdbId === showId && (item.seasonNumber === seasonNumber || item.seasonNumber === 0),
      );
    },
    [library.owned],
  );

  const isSeasonRented = useCallback(
    (showId: number, seasonNumber: number) => {
      return library.rented.some(
        (item) => item.tmdbId === showId && (item.seasonNumber === seasonNumber || item.seasonNumber === 0),
      );
    },
    [library.rented],
  );

  // Episode card action handlers
  const handleEpisodeSchedule = (episode: SeasonalEpisodeItem) => {
    setCalendarTarget({
      media: {
        tmdbId: episode.showId,
        mediaType: "tv",
        title: episode.showTitle,
        releaseYear: episode.airDate.slice(0, 4),
        posterPath: null,
        posterUrl: episode.posterUrl,
        backdropUrl: episode.stillUrl,
        overview: episode.overview,
        voteAverage: episode.voteAverage,
      },
      season: episode.seasonNumber,
      episode: episode.episodeNumber,
    });
  };

  const handleEpisodeRentBuy = (episode: SeasonalEpisodeItem) => {
    setSelectedMedia({
      id: episode.showId,
      type: "TV",
      title: episode.showTitle,
      initialSeason: episode.seasonNumber,
      initialAction: "RENT",
      posterUrl: episode.posterUrl,
    });
  };

  const handleEpisodePlay = (episode: SeasonalEpisodeItem) => {
    setPlayerTarget({
      media: {
        tmdbId: episode.showId,
        mediaType: "tv",
        title: episode.showTitle,
        releaseYear: episode.airDate.slice(0, 4),
        posterPath: null,
        posterUrl: episode.posterUrl,
        backdropUrl: episode.stillUrl,
        overview: episode.overview,
        voteAverage: episode.voteAverage,
      },
      season: episode.seasonNumber,
      episode: episode.episodeNumber,
    });
  };

  const handleSelectMedia = (media: MediaSearchResult) => {
    setSelectedMedia({
      id: media.tmdbId,
      type: media.mediaType.toUpperCase() as "MOVIE" | "TV",
      title: media.title,
      posterUrl:
        media.posterUrl ||
        (media.posterPath ? `https://image.tmdb.org/t/p/w780${media.posterPath}` : null),
    });
  };

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  if (!isOpen) return null;

  return (
    <main
      className={
        isEmbedded
          ? "w-full min-h-[calc(100vh-5rem)] bg-black text-neutral-100 pb-[max(6rem,env(safe-area-inset-bottom)+5rem)] sm:pb-12 animate-in fade-in duration-150"
          : onClose
          ? "fixed inset-0 z-50 overflow-y-auto bg-black text-neutral-100 pb-[max(6rem,env(safe-area-inset-bottom)+5rem)] sm:pb-12 animate-in fade-in"
          : "min-h-screen bg-black text-neutral-100 pb-[max(6rem,env(safe-area-inset-bottom)+5rem)] sm:pb-12"
      }
    >
      {/* ── Top Header - Unified Breadcrumb & Subtitle matching Cablecast Admin & Broadcast Studio ── */}
      <header
        className={`border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-xl px-4 sm:px-6 shrink-0 ${
          isEmbedded
            ? "py-3 sm:py-4"
            : "sticky top-0 z-40 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:py-4"
        }`}
      >
        <div className="mx-auto max-w-7xl">
          {/* Header Title Row matching Cablecast Design */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-cyan-400 shadow">
                <Compass className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
                Explore &amp; Discover
              </h1>
            </div>
          </div>

          {/* Search Input with Auto-Dismiss Keyboard on Enter (Desktop: search is driven from AppHeader when embedded; on mobile or standalone page, show search input) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              (document.activeElement as HTMLElement)?.blur();
            }}
            className={`relative mt-2.5 ${isEmbedded ? "md:hidden" : ""}`}
          >
            {query ? (
              <button
                type="button"
                onClick={() => updateQuery("")}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer z-10"
                title="Clear search"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            )}

            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search catalog by title, theme, era, or genre..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/90 py-2.5 pl-10 pr-9 text-xs sm:text-sm text-neutral-100 placeholder:text-neutral-500 transition-all hover:border-neutral-700 focus:border-cyan-500/60 focus:bg-black focus:outline-none shadow-inner [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => updateQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:text-white cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : isLoading ? (
              <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-500" />
            ) : null}
          </form>
        </div>
      </header>

      {/* ── Main Content Container ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 space-y-6">
        {/* Mood presets row (shown when not searching) */}
        {!debouncedQuery && (
          <section>
            <MoodPresets
              filters={filters}
              onSelectMood={(updater) => setFilters(updater)}
            />
          </section>
        )}

        {/* ── Lower Section Controls Toolbar (Filters Button & VHS / Grid Switcher) ── */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-900/80 pb-3">
            {/* Left: Filters Modal Trigger + Active Counter */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMoreFiltersOpen(true)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilterCount > 0
                    ? "border-cyan-500/60 bg-cyan-950/40 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                    : "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700 hover:text-white"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-bold text-black">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(INITIAL_FILTERS)}
                  title="Reset all filters"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-red-500/50 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Right: VHS Shelf vs Poster Grid Toggle */}
            {filters.type !== "episodes" && (
              <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/80 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setLayoutMode("shelf")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    layoutMode === "shelf"
                      ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                  title="3D VHS Shelf View"
                >
                  <CassetteTape className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">VHS Shelf</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("grid")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    layoutMode === "grid"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                  title="Poster Grid View"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Grid</span>
                </button>
              </div>
            )}
          </div>

          {/* Active Filter Badges Ribbon */}
          {(activeFilterCount > 0 || debouncedQuery) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Active:
              </span>

              {debouncedQuery && (
                <span className="flex items-center gap-1 rounded-full bg-neutral-900 border border-neutral-700 px-2.5 py-0.5 text-neutral-300">
                  Search: &ldquo;{debouncedQuery}&rdquo;
                  <button
                    type="button"
                    onClick={() => updateQuery("")}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {filters.seasons.map((sId) => {
                const label = SEASON_OPTIONS.find((s) => s.id === sId)?.label || sId;
                return (
                  <span
                    key={sId}
                    className="flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 text-amber-200"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          seasons: p.seasons.filter((s) => s !== sId),
                        }))
                      }
                      className="hover:text-white cursor-pointer"
                      title={`Remove ${label} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}

              {filters.eras.map((eId) => {
                const label = ERA_OPTIONS.find((e) => e.id === eId)?.label || eId;
                return (
                  <span
                    key={eId}
                    className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 px-2.5 py-0.5 text-fuchsia-300"
                  >
                    {label} Era
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          eras: p.eras.filter((e) => e !== eId),
                        }))
                      }
                      className="hover:text-white cursor-pointer"
                      title={`Remove ${label} Era filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}

              {filters.genreIds.map((gId) => {
                const label = GENRE_OPTIONS.find((g) => g.id === gId)?.name || String(gId);
                return (
                  <span
                    key={gId}
                    className="flex items-center gap-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-0.5 text-cyan-300"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          genreIds: p.genreIds.filter((g) => g !== gId),
                        }))
                      }
                      className="hover:text-white cursor-pointer"
                      title={`Remove ${label} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}

              {filters.languages.map((code) => (
                <span
                  key={code}
                  className="flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/40 px-2.5 py-0.5 text-purple-300"
                >
                  Lang: {code.toUpperCase()}
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        languages: p.languages.filter((l) => l !== code),
                      }))
                    }
                    className="hover:text-white cursor-pointer"
                    title={`Remove language ${code}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {filters.minRating && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-emerald-300">
                  ★ {filters.minRating.toFixed(1)}+
                  <button
                    type="button"
                    onClick={() => setFilters((p) => ({ ...p, minRating: null }))}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Results View ──────────────────────────────────────────────────── */}
        <section className="min-h-[50vh] space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-xs uppercase tracking-widest text-neutral-400">
                Tuning Broadcast Catalog...
              </p>
            </div>
          )}

          {/* Empty Results */}
          {!isLoading && results.length === 0 && episodes.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
              <Film className="h-12 w-12 text-neutral-700" strokeWidth={1.5} />
              <h3 className="text-base font-semibold text-neutral-300">
                No Broadcasts Matched Your Filters
              </h3>
              <p className="max-w-md text-xs text-neutral-500">
                Try widening your era, relaxing your minimum rating, or switching genres to tune
                into more available signals.
              </p>
              <button
                type="button"
                onClick={() => setFilters(INITIAL_FILTERS)}
                className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 hover:border-neutral-700 hover:text-white transition-colors"
              >
                Reset All Filters
              </button>
            </div>
          )}

          {/* 1. Episode Results Mode */}
          {filters.type === "episodes" && episodes.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <EpisodeCard
                  key={`${ep.showId}-s${ep.seasonNumber}-e${ep.episodeNumber}`}
                  episode={ep}
                  isSeasonOwned={isSeasonOwned(ep.showId, ep.seasonNumber)}
                  isSeasonRented={isSeasonRented(ep.showId, ep.seasonNumber)}
                  onSchedule={handleEpisodeSchedule}
                  onRentBuySeason={handleEpisodeRentBuy}
                  onPlay={handleEpisodePlay}
                />
              ))}
            </div>
          )}

          {/* 2. Standard Movie/TV Results: Shelf View */}
          {filters.type !== "episodes" && results.length > 0 && layoutMode === "shelf" && (
            <div className="space-y-6">
              <VhsShelf results={results} onSelect={handleSelectMedia} />
            </div>
          )}

          {/* 3. Standard Movie/TV Results: Grid View */}
          {filters.type !== "episodes" && results.length > 0 && layoutMode === "grid" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {results.map((item) => (
                <MediaCard
                  key={`${item.mediaType}-${item.tmdbId}`}
                  media={item}
                  onSelect={handleSelectMedia}
                  isFavorite={library.isFavorite(item.tmdbId, item.mediaType)}
                  onToggleFavorite={library.toggleFavorite}
                />
              ))}
            </div>
          )}

          {/* Load More Button */}
          {filters.type !== "episodes" && page < totalPages && results.length > 0 && (
            <div className="flex justify-center pt-8 pb-4">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 px-6 py-2.5 text-xs font-bold text-neutral-200 hover:border-cyan-500/50 hover:text-white transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                    <span>Loading Titles...</span>
                  </>
                ) : (
                  <span>Load More Titles ({page} of {totalPages})</span>
                )}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ── Slide-up Drawer for Advanced Filters ────────────────────────────── */}
      <MoreFiltersPanel
        isOpen={isMoreFiltersOpen}
        onClose={() => setIsMoreFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(INITIAL_FILTERS)}
      />

      {/* ── Modals: 3D VHS Tape Inspection & Purchase ──────────────────────── */}
      {selectedMedia && (
        <VhsModal
          isOpen={Boolean(selectedMedia)}
          onClose={() => setSelectedMedia(null)}
          mediaId={selectedMedia.id}
          mediaType={selectedMedia.type}
          title={selectedMedia.title}
          initialSeason={selectedMedia.initialSeason}
          initialAction={selectedMedia.initialAction}
          initialPosterUrl={selectedMedia.posterUrl}
        />
      )}

      {/* ── Modals: Broadcast Scheduling ──────────────────────────────────── */}
      {schedulingTarget && (
        <ScheduleBroadcastModal
          isOpen={Boolean(schedulingTarget)}
          onClose={() => setSchedulingTarget(null)}
          media={schedulingTarget.media}
          initialSeason={schedulingTarget.season}
          existingSchedule={personalBroadcast.schedule}
          onSchedule={personalBroadcast.addSchedule}
        />
      )}

      {/* ── Modals: Retro Player ─────────────────────────────────────────── */}
      {playerTarget && (
        <PlayerModal
          media={playerTarget.media}
          initialSeason={playerTarget.season}
          initialEpisode={playerTarget.episode}
          onClose={() => setPlayerTarget(null)}
        />
      )}

      {/* ── Modals: Calendar Specific Date Scheduler ────────────────────── */}
      {calendarTarget && (
        <CalendarSchedulerModal
          isOpen={Boolean(calendarTarget)}
          onClose={() => setCalendarTarget(null)}
          media={calendarTarget.media}
          initialSeason={calendarTarget.season}
          initialEpisode={calendarTarget.episode}
        />
      )}
    </main>
  );
}

/** Helper URLSearchParams wrapper that omits empty keys */
class URLURLSearchParamsSafe {
  private params = new URLSearchParams();
  constructor(entries: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(entries)) {
      if (v !== undefined && v !== "") {
        this.params.set(k, v);
      }
    }
  }
  toString() {
    return this.params.toString();
  }
}
