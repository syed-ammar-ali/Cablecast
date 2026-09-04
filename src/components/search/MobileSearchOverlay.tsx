"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Clapperboard, Loader2, Search, X } from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import { VhsShelf } from "@/components/vhs/VhsShelf";

interface MobileSearchOverlayProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (val: string) => void;
  debouncedQuery: string;
  results: MediaSearchResult[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onSelectMedia: (media: MediaSearchResult) => void;
  isFavorite: (id: string | number, mediaType: "movie" | "tv") => boolean;
  onToggleFavorite: (media: MediaSearchResult) => void;
}

export function MobileSearchOverlay({
  isOpen,
  query,
  onQueryChange,
  debouncedQuery,
  results,
  isLoading,
  error,
  onClose,
  onSelectMedia,
  isFavorite,
  onToggleFavorite,
}: MobileSearchOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 md:hidden animate-in fade-in slide-in-from-bottom">
      {/* Top Header: Unified single-row search bar replacing the entire top header */}
      <header className="border-b border-neutral-900 bg-neutral-950/95 backdrop-blur-md px-3 py-2.5 sm:px-4 sm:py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Back / Dismiss Arrow on the left */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Cablecast"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Auto-focused search input stretching across the center with in-field clear button */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search movies & TV shows..."
              autoFocus
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/90 py-2.5 pl-10 pr-9 text-xs text-neutral-100 placeholder:text-neutral-500 transition-colors hover:border-neutral-700 focus:border-cyan-500/60 focus:bg-black focus:outline-none shadow-inner"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:text-white"
                aria-label="Clear search query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : isLoading ? (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-neutral-500" />
            ) : null}
          </div>
        </div>
      </header>

      {/* Results / Empty View: Consumes 100% viewport height with minimal safe padding at bottom */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] space-y-4 h-[calc(100vh-65px)]">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-center text-xs text-red-300">
            {error}
          </div>
        )}

        {isLoading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-500 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              Searching TMDB directory...
            </p>
          </div>
        )}

        {!isLoading && !error && debouncedQuery && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-500 space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-500 mb-2">
              <Search className="h-5 w-5 text-neutral-400" />
            </div>
            <p className="text-sm font-bold text-neutral-300">
              No results found
            </p>
            <p className="text-xs text-neutral-500 max-w-xs">
              No matches for &ldquo;{debouncedQuery}&rdquo;. Check spelling or try searching for another title.
            </p>
          </div>
        )}

        {!debouncedQuery && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-600 space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-500 mb-2">
              <Clapperboard className="h-5 w-5 text-neutral-400" />
            </div>
            <p className="text-sm font-bold text-neutral-300">
              Search TMDB Catalog
            </p>
            <p className="text-xs text-neutral-500 max-w-xs">
              Type the title of any movie or TV series to search and tune in immediately.
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="pt-2">
            <VhsShelf
              results={results}
              onSelect={onSelectMedia}
              query={debouncedQuery}
            />
          </div>
        )}
      </div>
    </div>
  );
}
