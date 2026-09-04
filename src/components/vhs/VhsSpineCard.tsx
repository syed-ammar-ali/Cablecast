"use client";

import React, { useMemo } from "react";
import type { MediaSearchResult } from "@/types/media";
import { Film, Star, Tv } from "lucide-react";

interface VhsSpineCardProps {
  media: MediaSearchResult;
  onSelect: (media: MediaSearchResult) => void;
  index?: number;
}

export function VhsSpineCard({ media, onSelect }: VhsSpineCardProps) {
  const isTv = media.mediaType === "tv";
  const posterUrl =
    media.posterUrl ||
    (media.posterPath ? `https://image.tmdb.org/t/p/w342${media.posterPath}` : null);

  const titleLength = media.title?.length || 0;

  // Distinct variable heights matching authentic VHS retail cassettes and oversized tape boxes
  const heightClass = useMemo(() => {
    if (titleLength > 30) {
      return "h-[276px] sm:h-[316px]"; // Oversized Collector Box
    }
    if (titleLength > 18) {
      return "h-[254px] sm:h-[296px]"; // Extended Sleeve Tape
    }
    return "h-[238px] sm:h-72"; // Standard Baseline Cassette
  }, [titleLength]);

  // Generate deterministic vintage tape catalog code (e.g. "V-3841")
  const catalogCode = useMemo(() => {
    const num = Math.abs(Number(media.tmdbId) || 1000);
    const suffix = (num % 8999) + 1000;
    return `V-${suffix}`;
  }, [media.tmdbId]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(media)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(media);
        }
      }}
      title={`Pull "${media.title}" from shelf`}
      className={`group relative flex w-full max-w-[96px] min-[420px]:max-w-[88px] sm:w-16 sm:shrink-0 self-end cursor-pointer flex-col justify-between overflow-hidden rounded-[3px] border-t border-neutral-700/80 border-b border-black border-l border-white/30 border-r-2 border-black/95 bg-neutral-900 shadow-[inset_2px_0_4px_rgba(255,255,255,0.2),inset_-7px_0_14px_rgba(0,0,0,0.92),inset_0_3px_4px_rgba(255,255,255,0.1),inset_0_-4px_6px_rgba(0,0,0,0.8)] select-none will-change-transform [transform:translateZ(0)] transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-2.5 active:translate-y-0 active:duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${heightClass}`}
    >
      {/* ── SMOOTH HOVER DROP SHADOW OVERLAY ───────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 shadow-[0_14px_28px_rgba(0,0,0,0.95)] transition-opacity duration-300 ease-out group-hover:opacity-100" />

      {/* ── TOP Z-INDEX 3D BOX BORDERS & SPECULAR LIGHTING OVERLAY ─────────── */}
      <div className="pointer-events-none absolute inset-0 z-30 rounded-[3px] border-t border-neutral-700/80 border-b border-black border-l border-white/30 border-r-2 border-black/95 shadow-[inset_2px_0_4px_rgba(255,255,255,0.2),inset_-7px_0_14px_rgba(0,0,0,0.92),inset_0_3px_4px_rgba(255,255,255,0.1),inset_0_-4px_6px_rgba(0,0,0,0.8)]" />
      <div className="pointer-events-none absolute inset-y-0 left-[1px] w-[1px] bg-white/25 z-30" />
      <div className="pointer-events-none absolute inset-y-0 right-[2px] w-[1px] bg-black/90 z-30" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/[0.16] via-transparent to-black/85 z-30" />

      {/* ── SUBTLE MATTE PAPER GRAIN TEXTURE OVERLAY ───────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 z-30 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 1. Spine Full Poster Backdrop (Darkened & Atmospheric) */}
      {posterUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 grayscale-[10%]"
          style={{ backgroundImage: `url(${posterUrl})` }}
        />
      )}

      {/* 4. Top Section: Format Header & Framed Cover Art Window */}
      <div className="relative z-20 flex flex-col items-center w-full">
        {/* Top Format Banner */}
        <div className="flex w-full items-center justify-between px-1.5 pt-1.5 pb-1 font-mono text-[8px] text-neutral-400 border-b border-neutral-800/90 bg-neutral-950/90">
          <span className="font-black tracking-widest text-neutral-200">VHS</span>
          <span className="font-bold text-neutral-500 uppercase">{isTv ? "TV" : "NTSC"}</span>
        </div>

        {/* Framed Poster Thumbnail Window with Inset Bezel & Glass Glare */}
        <div className="relative h-20 sm:h-14 w-full overflow-hidden border-b border-neutral-800/90 bg-neutral-950 shadow-inner">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt=""
              className="h-full w-full object-cover object-top filter brightness-95 contrast-[1.08]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600">
              {isTv ? <Tv className="h-4 w-4" /> : <Film className="h-4 w-4" />}
            </div>
          )}

          {/* Top Glass Sheen */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent" />

          {/* Rating Badge */}
          {media.voteAverage > 0 && (
            <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-xs bg-black/90 px-1 py-0.5 font-mono text-[8px] font-bold text-amber-400 border border-neutral-800/90 shadow-md">
              <Star className="h-2 w-2 fill-amber-400 text-amber-400" />
              <span>{media.voteAverage.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. Middle Spine: High-Impact Vertical Title with Consistent Font Size, Wrapping Width-Wise */}
      <div className="relative z-20 flex flex-1 items-center justify-center py-2 overflow-hidden px-2 sm:px-1 w-full">
        <div className="flex flex-col flex-wrap max-h-48 justify-center items-center gap-1 [writing-mode:vertical-rl] rotate-180">
          <span className="font-sans font-black text-[11px] sm:text-[11px] leading-snug tracking-wider uppercase text-neutral-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] max-w-[170px] text-center">
            {media.title}
          </span>
        </div>
      </div>

      {/* 6. Bottom Section: Monospace Release Year & Archival Catalog Stamp */}
      <div className="relative z-20 flex flex-col items-center justify-center pb-2 pt-1.5 px-1.5 sm:px-1 border-t border-neutral-800/90 bg-neutral-950/90">
        <span className="font-mono text-xs sm:text-[10px] text-neutral-300 font-bold tracking-wider">
          {media.releaseYear ?? "—"}
        </span>
        <span className="font-mono text-[7px] sm:text-[6.5px] text-neutral-500 font-semibold tracking-widest uppercase mt-0.5">
          {catalogCode}
        </span>
      </div>
    </div>
  );
}
