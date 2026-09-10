"use client";

import React from "react";
import {
  Clapperboard,
  Tv,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
  Star,
  Calendar,
  Gift,
} from "lucide-react";

export type ExploreMediaType = "all" | "movie" | "tv" | "episodes";

export interface FilterState {
  type: ExploreMediaType;
  genreId: number | null;
  season: "fall" | "winter" | "spring" | "summer" | "monsoon" | null;
  era: "70s" | "80s" | "90s" | "00s" | "10s" | "20s" | null;
  minRating: number | null;
  sortBy: string;
  language: string | null;
}

export const GENRE_OPTIONS = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 878, name: "Sci-Fi" },
  { id: 27, name: "Horror" },
  { id: 80, name: "Crime" },
  { id: 53, name: "Thriller" },
  { id: 18, name: "Drama" },
  { id: 16, name: "Animation" },
  { id: 10751, name: "Family" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 14, name: "Fantasy" },
  { id: 99, name: "Documentary" },
];

export const SEASON_OPTIONS = [
  { id: "fall", label: "Fall", title: "Autumn / Halloween / Thanksgiving" },
  { id: "winter", label: "Winter", title: "Winter / Christmas / Holidays" },
  { id: "spring", label: "Spring", title: "Spring / Easter / St. Patrick's" },
  { id: "summer", label: "Summer", title: "Summer / Vacation / Road Trips" },
  { id: "monsoon", label: "Monsoon", title: "Monsoon / Rainy Season / Thunderstorms" },
] as const;

export const ERA_OPTIONS = [
  { id: "70s", label: "70s", years: "1970–1979" },
  { id: "80s", label: "80s", years: "1980–1989" },
  { id: "90s", label: "90s", years: "1990–1999" },
  { id: "00s", label: "00s", years: "2000–2009" },
  { id: "10s", label: "10s", years: "2010–2019" },
  { id: "20s", label: "20s", years: "2020–2029" },
] as const;

interface FilterBarProps {
  filters: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  onOpenMoreFilters: () => void;
  activeFilterCount: number;
}

export function FilterBar({
  filters,
  onChange,
  onOpenMoreFilters,
  activeFilterCount,
}: FilterBarProps) {
  const setType = (type: ExploreMediaType) => {
    onChange((prev) => ({ ...prev, type }));
  };

  const toggleGenre = (id: number) => {
    onChange((prev) => ({ ...prev, genreId: prev.genreId === id ? null : id }));
  };

  const toggleSeason = (season: FilterState["season"]) => {
    onChange((prev) => ({ ...prev, season: prev.season === season ? null : season }));
  };

  const toggleEra = (era: FilterState["era"]) => {
    onChange((prev) => ({ ...prev, era: prev.era === era ? null : era }));
  };

  const toggleRating = (rating: number) => {
    onChange((prev) => ({
      ...prev,
      minRating: prev.minRating === rating ? null : rating,
    }));
  };

  const resetFilters = () => {
    onChange(() => ({
      type: "all",
      genreId: null,
      season: null,
      era: null,
      minRating: null,
      sortBy: "popularity.desc",
      language: null,
    }));
  };

  return (
    <div className="w-full space-y-3">
      {/* ── Row 1: Primary Type Tabs & Action Tools ────────────────────────── */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-1">
        {/* Type selector segment */}
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-950/80 p-1 backdrop-blur-md shadow-inner">
          <button
            type="button"
            onClick={() => setType("all")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filters.type === "all"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            All
          </button>

          <button
            type="button"
            onClick={() => setType("movie")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filters.type === "movie"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            Movies
          </button>

          <button
            type="button"
            onClick={() => setType("tv")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filters.type === "tv"
                ? "bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Tv className="h-3.5 w-3.5" />
            TV Shows
          </button>

          <button
            type="button"
            onClick={() => setType("episodes")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filters.type === "episodes"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse"
                : "text-neutral-400 hover:text-amber-300"
            }`}
          >
            <Gift className="h-3.5 w-3.5 text-amber-400" />
            <span>Holiday Special</span>
          </button>
        </div>

        {/* Right action triggers */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenMoreFilters}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
              activeFilterCount > 0
                ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300"
                : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>More Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-black">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              title="Reset all filters"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-red-500/50 hover:text-red-400 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: Combined Seasonal, Era & Rating Quick Filters ─────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 text-xs">
        {/* Season Chips */}
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold shrink-0 pl-1">
          Season:
        </span>
        {SEASON_OPTIONS.map((item) => {
          const isSelected = filters.season === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleSeason(item.id)}
              title={item.title}
              className={`shrink-0 rounded-full px-3 py-1 font-medium transition-all ${
                isSelected
                  ? "bg-amber-400/20 text-amber-200 border border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  : "bg-neutral-900/80 text-neutral-400 border border-neutral-800 hover:border-neutral-700 hover:text-neutral-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}

        <div className="h-4 w-px bg-neutral-800 shrink-0 mx-1" />

        {/* Era Chips */}
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold shrink-0">
          Era:
        </span>
        {ERA_OPTIONS.map((item) => {
          const isSelected = filters.era === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleEra(item.id)}
              title={item.years}
              className={`shrink-0 rounded-full px-2.5 py-1 font-mono font-medium transition-all ${
                isSelected
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/60 shadow-[0_0_12px_rgba(217,70,239,0.25)]"
                  : "bg-neutral-900/80 text-neutral-400 border border-neutral-800 hover:border-neutral-700 hover:text-neutral-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}

        <div className="h-4 w-px bg-neutral-800 shrink-0 mx-1" />

        {/* Quick Rating Chips */}
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold shrink-0">
          Rating:
        </span>
        {[7.0, 8.0, 8.5].map((score) => {
          const isSelected = filters.minRating === score;
          return (
            <button
              key={score}
              type="button"
              onClick={() => toggleRating(score)}
              className={`flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 font-medium transition-all ${
                isSelected
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                  : "bg-neutral-900/80 text-neutral-400 border border-neutral-800 hover:border-neutral-700 hover:text-neutral-200"
              }`}
            >
              <Star className="h-3 w-3 fill-current text-amber-400" />
              {score}+
            </button>
          );
        })}
      </div>

      {/* ── Row 3: Genre Pills (when not in episodes mode) ──────────────────── */}
      {filters.type !== "episodes" && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {GENRE_OPTIONS.map((genre) => {
            const isSelected = filters.genreId === genre.id;
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => toggleGenre(genre.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm"
                    : "bg-neutral-950/60 text-neutral-400 border border-neutral-800/80 hover:border-neutral-700 hover:text-white"
                }`}
              >
                {genre.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
