"use client";

import React from "react";
import Image from "next/image";
import { Tv, Calendar, Play, ShoppingBag, Star } from "lucide-react";
import type { SeasonalEpisodeItem } from "@/lib/seasonalEpisodes";

interface EpisodeCardProps {
  episode: SeasonalEpisodeItem;
  isSeasonOwned: boolean;
  isSeasonRented: boolean;
  onSchedule: (episode: SeasonalEpisodeItem) => void;
  onRentBuySeason: (episode: SeasonalEpisodeItem) => void;
  onPlay?: (episode: SeasonalEpisodeItem) => void;
}

export function EpisodeCard({
  episode,
  isSeasonOwned,
  isSeasonRented,
  onSchedule,
  onRentBuySeason,
  onPlay,
}: EpisodeCardProps) {
  const isAccessible = isSeasonOwned || isSeasonRented;

  const formatSeasonEp = (s: number, e: number) => {
    const sStr = s < 10 ? `S0${s}` : `S${s}`;
    const eStr = e < 10 ? `E0${e}` : `E${e}`;
    return `${sStr} · ${eStr}`;
  };

  const formatAirYear = (dateStr: string) => {
    if (!dateStr) return "";
    return dateStr.slice(0, 4);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-800/90 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-black text-left shadow-lg transition-all duration-300 hover:border-neutral-700 hover:shadow-cyan-950/20 hover:shadow-xl">
      {/* ── Episode Still / Banner ────────────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
        {episode.stillUrl ? (
          <Image
            src={episode.stillUrl}
            alt={episode.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-600">
            <Tv className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-[11px] uppercase tracking-wider">Broadcast Still</span>
          </div>
        )}

        {/* Ambient Gradient on Still */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 opacity-80" />

        {/* Top left theme badge */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/20 bg-black/80 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur-md shadow-md">
          <span>{episode.themeBadge}</span>
        </div>

        {/* Top right rating badge */}
        {episode.voteAverage > 0 && (
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-amber-400/30 bg-black/80 px-2 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-md">
            <Star className="h-3 w-3 fill-current" />
            <span>{episode.voteAverage.toFixed(1)}</span>
          </div>
        )}

        {/* Bottom Left Season/Episode Code */}
        <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-cyan-300 drop-shadow">
          <span className="rounded bg-black/80 px-1.5 py-0.5 border border-cyan-500/30">
            {formatSeasonEp(episode.seasonNumber, episode.episodeNumber)}
          </span>
          <span className="text-neutral-400 font-normal">
            ({formatAirYear(episode.airDate)})
          </span>
        </div>
      </div>

      {/* ── Content & Actions ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col justify-between p-3.5 sm:p-4 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {episode.showTitle}
            </span>
            {isAccessible && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.2 text-[9px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/40">
                {isSeasonOwned ? "Owned Season" : "Rented Season"}
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold tracking-tight text-white group-hover:text-cyan-200 transition-colors line-clamp-1">
            {episode.name}
          </h4>
          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
            {episode.overview}
          </p>
        </div>

        {/* Action Button Row */}
        <div className="pt-2 border-t border-neutral-900 flex items-center gap-2">
          {isAccessible ? (
            <>
              <button
                type="button"
                onClick={() => onSchedule(episode)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 px-3 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-900/60 hover:border-purple-400 transition-all active:scale-95 shadow-sm"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Schedule Episode</span>
              </button>

              {onPlay && (
                <button
                  type="button"
                  onClick={() => onPlay(episode)}
                  title="Tune in now"
                  className="flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/80 p-2 text-neutral-200 hover:border-purple-500/50 hover:bg-purple-950/40 hover:text-purple-300 transition-all active:scale-95 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onRentBuySeason(episode)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/50 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 px-3 py-2 text-xs font-bold text-amber-200 hover:border-amber-400 hover:from-amber-500/30 hover:to-orange-500/30 transition-all active:scale-95 shadow-md shadow-amber-950/30"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-amber-400" />
              <span>Get Season {episode.seasonNumber} VHS</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
