"use client";

import React, { useEffect } from "react";
import { X, SlidersHorizontal, Star, Globe, ArrowUpDown } from "lucide-react";
import type { FilterState } from "./FilterBar";

interface MoreFiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  onReset: () => void;
}

const SORT_OPTIONS = [
  { id: "popularity.desc", label: "Most Popular" },
  { id: "vote_average.desc", label: "Highest Rated (IMDb / TMDB)" },
  { id: "primary_release_date.desc", label: "Newest First" },
  { id: "primary_release_date.asc", label: "Oldest First (Retro Vault)" },
];

const LANGUAGE_OPTIONS = [
  { code: "", label: "Any Language" },
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop tap to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer content card */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:p-6 shadow-2xl shadow-black overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">Refined Catalog Filters</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters Body */}
        <div className="space-y-6 py-4">
          {/* 1. Sort By */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <ArrowUpDown className="h-3.5 w-3.5 text-purple-400" />
              Sort Lineup
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SORT_OPTIONS.map((item) => {
                const isSelected = filters.sortBy === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, sortBy: item.id }))}
                    className={`rounded-xl border p-2.5 text-left text-xs font-medium transition-all ${
                      isSelected
                        ? "border-purple-500/60 bg-purple-950/40 text-purple-200 shadow-sm"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Minimum Rating Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-current" />
                Minimum Score
              </label>
              <span className="font-mono text-sm font-bold text-amber-300">
                {filters.minRating ? `${filters.minRating.toFixed(1)}+` : "Any Score"}
              </span>
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
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
              <span>All</span>
              <span>6.0</span>
              <span>7.0</span>
              <span>8.0</span>
              <span>9.0+</span>
            </div>
          </div>

          {/* 3. Original Language */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <Globe className="h-3.5 w-3.5 text-cyan-400" />
              Original Language
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGE_OPTIONS.map((lang) => {
                const isSelected = (filters.language || "") === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        language: lang.code || null,
                      }))
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? "border border-cyan-500/60 bg-cyan-950/40 text-cyan-200 shadow-sm"
                        : "border border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700"
                    }`}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-neutral-900 pt-4">
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-neutral-400 hover:text-red-400 transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-black hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
