"use client";

import React, { useEffect, useMemo } from "react";
import {
  X,
  SlidersHorizontal,
  Star,
  Globe,
  ArrowUpDown,
  RotateCcw,
  ArrowLeft,
  Film,
  Sparkles,
  Calendar,
  Check,
} from "lucide-react";
import {
  type FilterState,
  GENRE_OPTIONS,
  SEASON_OPTIONS,
  ERA_OPTIONS,
} from "./FilterBar";

interface MoreFiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  onReset: () => void;
}

const SORT_OPTIONS = [
  { id: "popularity.desc", label: "Most Popular", desc: "Current trending blockbusters" },
  { id: "vote_average.desc", label: "Highest Rated", desc: "Top critical & audience acclaim" },
  { id: "primary_release_date.desc", label: "Newest First", desc: "Latest modern arrivals" },
  { id: "primary_release_date.asc", label: "Oldest First", desc: "Classic retro vault gems" },
];

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "hi", label: "Hindi" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
];

export function MoreFiltersPanel({
  isOpen,
  onClose,
  filters,
  onChange,
  onReset,
}: MoreFiltersPanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const activeCount = useMemo(() => {
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

  if (!isOpen) return null;

  // Toggle helpers
  const toggleGenre = (id: number) => {
    onChange((prev) => ({
      ...prev,
      genreIds: prev.genreIds.includes(id)
        ? prev.genreIds.filter((g) => g !== id)
        : [...prev.genreIds, id],
    }));
  };

  const toggleSeason = (season: FilterState["seasons"][number]) => {
    onChange((prev) => ({
      ...prev,
      seasons: prev.seasons.includes(season)
        ? prev.seasons.filter((s) => s !== season)
        : [...prev.seasons, season],
    }));
  };

  const toggleEra = (era: FilterState["eras"][number]) => {
    onChange((prev) => ({
      ...prev,
      eras: prev.eras.includes(era)
        ? prev.eras.filter((e) => e !== era)
        : [...prev.eras, era],
    }));
  };

  const toggleLanguage = (code: string) => {
    onChange((prev) => ({
      ...prev,
      languages: prev.languages.includes(code)
        ? prev.languages.filter((l) => l !== code)
        : [...prev.languages, code],
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="more-filters-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-0 sm:p-6 backdrop-blur-md animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full sm:max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-neutral-800 bg-neutral-950 shadow-2xl animate-in zoom-in-95"
      >
        {/* Sticky Top Header - Unified Breadcrumb & Title */}
        <header className="sticky top-0 z-20 shrink-0 border-b border-neutral-900 bg-neutral-950/95 px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Back to Explore</span>
              </button>
              <span className="text-neutral-700 leading-none select-none">/</span>
              <span className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate">
                Filter Control Room
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-neutral-900/60 pt-2.5 sm:border-t-0 sm:pt-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-cyan-400 shadow">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </div>
              <h1
                id="more-filters-title"
                className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate"
              >
                Refined Catalog Filters
              </h1>
              {activeCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/60 px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-cyan-300 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  {activeCount} Active
                </span>
              )}
            </div>

            {activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset All</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Filters Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-7 no-scrollbar">
          {/* 1. Sort Lineup */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                <ArrowUpDown className="h-3.5 w-3.5 text-purple-400" />
                Sort Catalog Lineup
              </label>
              <span className="text-[11px] text-neutral-500">Pick sorting priority</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SORT_OPTIONS.map((item) => {
                const isSelected = filters.sortBy === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, sortBy: item.id }))}
                    className={`flex items-start justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-purple-500/70 bg-purple-950/40 text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                        : "border-neutral-800/90 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900/80"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">{item.desc}</div>
                    </div>
                    {isSelected && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-black">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Genres (Multi-Select) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                <Film className="h-3.5 w-3.5 text-cyan-400" />
                Genres (Select Multiple)
              </label>
              <div className="flex items-center gap-2">
                {filters.genreIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, genreIds: [] }))}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
                  >
                    Clear ({filters.genreIds.length})
                  </button>
                )}
                <span className="text-[11px] text-neutral-500">Combine genres</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((genre) => {
                const isSelected = filters.genreIds.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    type="button"
                    onClick={() => toggleGenre(genre.id)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "border-cyan-500/70 bg-cyan-950/40 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/50"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-cyan-400 stroke-[2.5]" />}
                    <span>{genre.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Eras & Decades (Multi-Select) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                <Calendar className="h-3.5 w-3.5 text-fuchsia-400" />
                Decades &amp; Eras (Select Multiple)
              </label>
              <div className="flex items-center gap-2">
                {filters.eras.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, eras: [] }))}
                    className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2"
                  >
                    Clear ({filters.eras.length})
                  </button>
                )}
                <span className="text-[11px] text-neutral-500">Combine eras</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {ERA_OPTIONS.map((era) => {
                const isSelected = filters.eras.includes(era.id);
                return (
                  <button
                    key={era.id}
                    type="button"
                    onClick={() => toggleEra(era.id)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? "border-fuchsia-500/70 bg-fuchsia-950/40 text-fuchsia-200 shadow-[0_0_14px_rgba(217,70,239,0.25)] ring-1 ring-fuchsia-500/50"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    <div className="font-mono text-sm font-bold flex items-center gap-1">
                      {isSelected && <Check className="h-3 w-3 text-fuchsia-400" />}
                      {era.label}
                    </div>
                    <div className="font-mono text-[9px] text-neutral-500 mt-0.5">
                      {era.years}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Seasonal & Holiday Themes (Multi-Select) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Seasonal &amp; Holiday Themes (Select Multiple)
              </label>
              <div className="flex items-center gap-2">
                {filters.seasons.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, seasons: [] }))}
                    className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    Clear ({filters.seasons.length})
                  </button>
                )}
                <span className="text-[11px] text-neutral-500">Pick vibes</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {SEASON_OPTIONS.map((season) => {
                const isSelected = filters.seasons.includes(season.id);
                return (
                  <button
                    key={season.id}
                    type="button"
                    onClick={() => toggleSeason(season.id)}
                    className={`flex items-start justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-amber-400/70 bg-amber-950/40 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.25)] ring-1 ring-amber-400/50"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        {isSelected && <Check className="h-3 w-3 text-amber-400" />}
                        {season.label}
                      </div>
                      <div className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">
                        {season.title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Original Languages (Multi-Select) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                Original Language (Select Multiple)
              </label>
              <div className="flex items-center gap-2">
                {filters.languages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, languages: [] }))}
                    className="text-[10px] text-blue-400 hover:text-blue-300 underline underline-offset-2"
                  >
                    Clear ({filters.languages.length})
                  </button>
                )}
                <span className="text-[11px] text-neutral-500">Audio / Origin</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => {
                const isSelected = filters.languages.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => toggleLanguage(lang.code)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-500/70 bg-blue-950/40 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.25)] ring-1 ring-blue-500/50"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-blue-400" />}
                    <span>{lang.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Minimum Rating Slider & Chips */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                <Star className="h-3.5 w-3.5 text-emerald-400 fill-current" />
                Minimum Audience Rating
              </label>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {filters.minRating ? `★ ${filters.minRating.toFixed(1)}+` : "Any Rating"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { score: null, label: "Any" },
                { score: 6.0, label: "6.0+" },
                { score: 7.0, label: "7.0+" },
                { score: 7.5, label: "7.5+" },
                { score: 8.0, label: "8.0+" },
                { score: 8.5, label: "8.5+" },
                { score: 9.0, label: "9.0+ Masterpieces" },
              ].map((item) => {
                const isSelected = filters.minRating === item.score;
                return (
                  <button
                    key={String(item.score)}
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, minRating: item.score }))}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <input
              type="range"
              min="0"
              max="9"
              step="0.5"
              value={filters.minRating ?? 0}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onChange((prev) => ({ ...prev, minRating: val > 0 ? val : null }));
              }}
              className="w-full accent-emerald-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Sticky Bottom Actions Bar */}
        <footer className="sticky bottom-0 z-20 flex items-center justify-between border-t border-neutral-900 bg-neutral-950/95 px-4 sm:px-6 py-3.5 backdrop-blur-md">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Defaults</span>
          </button>

          <div className="flex items-center gap-3">
            {activeCount > 0 && (
              <span className="hidden sm:inline-block font-mono text-[11px] text-neutral-400">
                {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-cyan-500 hover:bg-cyan-400 px-6 py-2 text-xs font-bold text-black transition-all shadow-lg shadow-cyan-500/25 cursor-pointer"
            >
              Apply &amp; View Catalog
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
