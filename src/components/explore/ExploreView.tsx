"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Search,
  X,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  LayoutGrid,
  CassetteTape,
  AlertCircle,
  Film,
} from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import type { SeasonalEpisodeItem } from "@/lib/seasonalEpisodes";
import { FilterBar, type FilterState, GENRE_OPTIONS, SEASON_OPTIONS, ERA_OPTIONS } from "./FilterBar";
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
  genreId: null,
  season: null,
  era: null,
  minRating: null,
  sortBy: "popularity.desc",
  language: null,
};

export function ExploreView() {
  const router = useRouter();
  const library = useLibrary();
  const personalBroadcast = usePersonalBroadcast();

  // Search & Filter state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"shelf" | "grid">("shelf");

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
    if (filters.genreId !== null) count++;
    if (filters.season !== null) count++;
    if (filters.era !== null) count++;
    if (filters.minRating !== null) count++;
    if (filters.sortBy !== "popularity.desc") count++;
    if (filters.language !== null) count++;
    return count;
  }, [filters]);

  // Data fetching effect
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchExploreData() {
      setIsLoading(true);
      setError(null);

      try {
        if (filters.type === "episodes") {
          // Fetch seasonal episodes
          const params = new URLURLSearchParamsSafe({
            season: filters.season || "",
            era: filters.era || "",
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
            genres: filters.genreId ? String(filters.genreId) : "",
            season: filters.season || "",
            era: filters.era || "",
            sortBy: filters.sortBy,
            voteAverageGte: filters.minRating ? String(filters.minRating) : "",
            language: filters.language || "",
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
  }, [filters, debouncedQuery]);

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
          genres: filters.genreId ? String(filters.genreId) : "",
          season: filters.season || "",
          era: filters.era || "",
          sortBy: filters.sortBy,
          voteAverageGte: filters.minRating ? String(filters.minRating) : "",
          language: filters.language || "",
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
    });
  };

  // Active filter label resolution
  const activeSeasonLabel = SEASON_OPTIONS.find((s) => s.id === filters.season)?.label;
  const activeEraLabel = ERA_OPTIONS.find((e) => e.id === filters.era)?.label;
  const activeGenreLabel = GENRE_OPTIONS.find((g) => g.id === filters.genreId)?.name;

  return (
    <main className="min-h-screen bg-black text-neutral-100 pb-20 sm:pb-12">
      {/* ── Top Fixed Navigation & Search Bar ──────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-xl px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          {/* Back to Home */}
          <Link
            href="/home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:border-neutral-700 hover:text-white transition-all active:scale-95"
            title="Back to Broadcast TV"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search catalog by title, theme, episode name..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/90 py-2.5 pl-10 pr-9 text-sm text-neutral-100 placeholder:text-neutral-500 transition-all hover:border-neutral-700 focus:border-cyan-500/60 focus:bg-black focus:outline-none shadow-inner"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:text-white"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : isLoading ? (
              <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-500" />
            ) : null}
          </div>

          {/* Shelf vs Grid layout toggle (only for movies/shows) */}
          {filters.type !== "episodes" && (
            <div className="hidden sm:flex items-center rounded-xl border border-neutral-800 bg-neutral-950 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode("shelf")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  layoutMode === "shelf"
                    ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
                title="3D VHS Shelf View"
              >
                <CassetteTape className="h-3.5 w-3.5" />
                <span>VHS Shelf</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("grid")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  layoutMode === "grid"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
                title="Poster Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
            </div>
          )}
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

        {/* Filter controls row */}
        <section className="rounded-2xl border border-neutral-900 bg-neutral-950/60 p-3.5 sm:p-4 backdrop-blur-md shadow-xl">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            onOpenMoreFilters={() => setIsMoreFiltersOpen(true)}
            activeFilterCount={activeFilterCount}
          />

          {/* Active Filter Badges Ribbon */}
          {(activeFilterCount > 0 || debouncedQuery) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-900/90 pt-3 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Active:
              </span>

              {debouncedQuery && (
                <span className="flex items-center gap-1 rounded-full bg-neutral-900 border border-neutral-700 px-2.5 py-0.5 text-neutral-300">
                  Search: &ldquo;{debouncedQuery}&rdquo;
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {activeSeasonLabel && (
                <span className="flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 text-amber-200">
                  {activeSeasonLabel}
                  <button
                    type="button"
                    onClick={() => setFilters((p) => ({ ...p, season: null }))}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {activeEraLabel && (
                <span className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 px-2.5 py-0.5 text-fuchsia-300">
                  {activeEraLabel} Era
                  <button
                    type="button"
                    onClick={() => setFilters((p) => ({ ...p, era: null }))}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {activeGenreLabel && (
                <span className="flex items-center gap-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-0.5 text-cyan-300">
                  {activeGenreLabel}
                  <button
                    type="button"
                    onClick={() => setFilters((p) => ({ ...p, genreId: null }))}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {filters.minRating && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-emerald-300">
                  ★ {filters.minRating.toFixed(1)}+
                  <button
                    type="button"
                    onClick={() => setFilters((p) => ({ ...p, minRating: null }))}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {filters.language && (
                <span className="flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/40 px-2.5 py-0.5 text-purple-300">
                  Lang: {filters.language.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => setFilters((p) => ({ ...p, language: null }))}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              <span className="ml-auto font-mono text-[11px] text-neutral-500">
                {totalResults > 0 ? `${totalResults} titles found` : ""}
              </span>
            </div>
          )}
        </section>

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
