"use client";

import { Clock, Play, Radio, RotateCcw, Trash2, Tv } from "lucide-react";
import type { PersonalScheduleItem } from "@/types/broadcast";
import type { MediaSearchResult } from "@/types/media";
import { formatBlockTimeRange, personalScheduleToMediaSearchResult } from "@/types/broadcast";

interface BroadcastSlotCardProps {
  item: PersonalScheduleItem;
  onPlay: (target: {
    media: MediaSearchResult;
    season?: number;
    episode?: number;
    startOffsetSeconds?: number;
  }) => void;
  onRemove: (id: string) => void;
  onCloseModal?: () => void;
}

function getSafePosterUrl(posterPath?: string | null, backdropUrl?: string | null): string | null {
  if (posterPath) {
    if (posterPath.startsWith("http://") || posterPath.startsWith("https://")) {
      return posterPath;
    }
    const clean = posterPath.startsWith("/") ? posterPath : `/${posterPath}`;
    return `https://image.tmdb.org/t/p/w185${clean}`;
  }
  if (backdropUrl) {
    return backdropUrl;
  }
  return null;
}

export function BroadcastSlotCard({
  item,
  onPlay,
  onRemove,
  onCloseModal,
}: BroadcastSlotCardProps) {
  const posterUrl = getSafePosterUrl(item.posterPath, item.backdropUrl);
  const isLive = Boolean(item.isLiveNow);

  const handleTuneIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const calculatedOffset = (nowMinutes - item.blockStartMinutes) * 60 + now.getSeconds();
    const offset = item.liveOffsetSeconds ?? Math.max(0, calculatedOffset);

    onPlay({
      media: personalScheduleToMediaSearchResult(item),
      season: item.mediaType === "tv" ? item.currentSeason : undefined,
      episode: item.mediaType === "tv" ? item.currentEpisode : undefined,
      startOffsetSeconds: offset,
    });
    onCloseModal?.();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.id);
  };

  const timeRangeLabel = formatBlockTimeRange(item.blockStartMinutes, item.blockCount);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-3.5 sm:p-4 transition-all ${
        isLive
          ? "border-red-900/60 bg-red-950/20 shadow-lg shadow-red-950/20"
          : item.isRerun
            ? "border-amber-800/60 bg-amber-950/10 hover:border-amber-700/80"
            : "border-neutral-800/90 bg-neutral-950/90 hover:border-neutral-700/90 hover:bg-neutral-900/40"
      }`}
    >
      <div className="flex items-center gap-3.5 sm:gap-4">
        {/* Poster Thumbnail */}
        <div className="relative h-16 w-11 sm:h-18 sm:w-12 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt={item.title}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600">
              <Tv className="h-5 w-5" />
            </div>
          )}

          {isLive && (
            <div className="absolute top-1 left-1 flex h-2 w-2 items-center justify-center">
              <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
            </div>
          )}
        </div>

        {/* Broadcast Slot Details */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Header Row: Title & Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-[300px]">
              {item.title}
            </h4>

            {isLive ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-700/50 bg-red-950/60 px-2 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-red-400 animate-pulse shrink-0">
                <Radio className="h-2.5 w-2.5" />
                <span>On Air</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-400 border border-neutral-800 shrink-0">
                {item.mediaType === "tv" ? "TV Series" : "Movie"}
              </span>
            )}

            {item.isRerun && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-600/50 bg-amber-950/60 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase text-amber-300 shrink-0">
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Rerun Encore</span>
              </span>
            )}
          </div>

          {/* Time Slot Label with Full Duration & Blocks */}
          <p className="flex items-center gap-1.5 font-mono text-xs font-semibold text-neutral-300">
            <Clock className="h-3 w-3 text-neutral-500 shrink-0" />
            <span>
              {timeRangeLabel} · {item.blockCount} {item.blockCount === 1 ? "Block" : "Blocks"} ({item.blockCount * 30}m)
            </span>
          </p>

          {/* Episode / Runtime Line */}
          <div className="flex items-center gap-2 text-xs text-neutral-400 flex-wrap pt-0.5">
            {item.mediaType === "tv" ? (
              <span className="inline-flex items-center rounded bg-neutral-900/90 px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold tracking-wider text-neutral-300 border border-neutral-800/80">
                Episode: S{item.currentSeason}E{item.currentEpisode}
                {item.totalEpisodes ? ` of ${item.totalEpisodes}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-neutral-900/90 px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-neutral-400 border border-neutral-800/80">
                Feature Film ({item.blockCount * 30}m)
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {isLive ? (
            <button
              type="button"
              onClick={handleTuneIn}
              className="flex items-center gap-1.5 rounded-md border border-red-700/60 bg-red-900/60 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-red-800 active:scale-95 cursor-pointer"
              title="Tune in live to this broadcast"
            >
              <Play className="h-3 w-3 fill-white" />
              <span>Live</span>
            </button>
          ) : (
            <span className="flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[10px] sm:text-[11px] font-mono text-neutral-400">
              <Clock className="h-3 w-3 text-neutral-500" />
              <span>Scheduled</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleRemove}
            className="flex items-center gap-1 rounded-md border border-neutral-800/80 bg-neutral-950/60 px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-400 cursor-pointer"
            title="Remove appointment from lineup"
          >
            <Trash2 className="h-3 w-3" />
            <span>Remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}
