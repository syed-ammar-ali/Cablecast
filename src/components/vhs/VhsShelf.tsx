"use client";

import React from "react";
import type { MediaSearchResult } from "@/types/media";
import { VhsSpineCard } from "./VhsSpineCard";

interface VhsShelfProps {
  results: MediaSearchResult[];
  onSelect: (media: MediaSearchResult) => void;
  query?: string;
}

export function VhsShelf({ results, onSelect }: VhsShelfProps) {
  if (!results || results.length === 0) return null;

  return (
    <div className="w-full">
      {/* 3D Physical Wooden/Metallic Shelf Rack */}
      <div className="relative rounded-2xl border border-neutral-800/90 bg-gradient-to-b from-neutral-950 via-black to-neutral-950 p-3.5 sm:p-6 shadow-2xl overflow-visible">
        {/* Overhead Spotlight Ambient Lighting */}
        <div className="pointer-events-none absolute -top-16 inset-x-0 h-36 bg-radial from-amber-500/10 via-transparent to-transparent opacity-70" />

        {/* Shelf Backboard Texture */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#111_1px,transparent_1px),linear-gradient(to_bottom,#111_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />

        {/* Spines Grid on Mobile (3–4 cols) / Shelf Row on Desktop (wrapped with bookends) */}
        <div className="grid grid-cols-3 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap items-end justify-items-center sm:justify-start gap-2 sm:gap-3.5 pt-4 pb-2 z-10 relative">
          {/* Left Shelf Bookend (Desktop only) */}
          <div
            className="hidden sm:flex h-60 w-3.5 shrink-0 flex-col justify-between rounded-l-xs border border-neutral-700/60 bg-gradient-to-r from-neutral-800 via-neutral-900 to-stone-900 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.2),-4px_4px_12px_rgba(0,0,0,0.8)] self-end"
            title="Shelf Bookend"
          >
            <div className="h-2 w-full border-b border-neutral-700/50 bg-white/10" />
            <div className="h-2 w-full border-t border-neutral-700/50 bg-black/40" />
          </div>

          {/* Spine Cards */}
          {results.map((media, index) => (
            <VhsSpineCard
              key={`${media.mediaType}-${media.tmdbId}`}
              media={media}
              onSelect={onSelect}
              index={index}
            />
          ))}

          {/* Right Shelf Bookend (Desktop only) */}
          <div
            className="hidden sm:flex h-60 w-3.5 shrink-0 flex-col justify-between rounded-r-xs border border-neutral-700/60 bg-gradient-to-l from-neutral-800 via-neutral-900 to-stone-900 shadow-[inset_-1px_1px_2px_rgba(255,255,255,0.2),4px_4px_12px_rgba(0,0,0,0.8)] self-end"
            title="Shelf Bookend"
          >
            <div className="h-2 w-full border-b border-neutral-700/50 bg-white/10" />
            <div className="h-2 w-full border-t border-neutral-700/50 bg-black/40" />
          </div>
        </div>

        {/* 3D Realistic Shelf Ledge & Depth Bevel */}
        <div className="relative mt-2 w-full z-20">
          {/* Top shelf surface edge highlight */}
          <div className="h-3.5 w-full rounded-xs bg-gradient-to-r from-neutral-800 via-stone-800 to-neutral-800 border-t border-stone-600/60 shadow-md flex items-center px-4 justify-between">
            <div className="h-[1px] w-full bg-white/15" />
          </div>

          {/* Front shelf wood/metal fascia thickness */}
          <div className="h-4 w-full bg-gradient-to-b from-stone-900 via-neutral-950 to-black border-t border-stone-950/90 shadow-2xl flex items-center justify-end px-3">
            <div className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-500/80 shadow-[0_0_4px_rgba(245,158,11,0.6)]" />
              <span className="h-1 w-1 rounded-full bg-neutral-700" />
            </div>
          </div>

          {/* Shelf drop shadow cast downward */}
          <div className="h-3 w-full bg-gradient-to-b from-black/90 to-transparent" />
        </div>
      </div>
    </div>
  );
}
