"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play, X, Rewind, Sparkles } from "lucide-react";
import type { WatchHistoryItem } from "@/types/watchHistory";
import { triggerHaptic } from "@/lib/haptics";
import { playMechanicalClick } from "@/lib/soundEffects";
import { TiltCard } from "@/components/ui/TiltCard";
import { Tooltip } from "@/components/ui/Tooltip";

interface ContinueWatchingRowProps {
  items: WatchHistoryItem[];
  onPlay: (item: WatchHistoryItem) => void;
  onRemove: (item: WatchHistoryItem) => void;
}

function formatProgressTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}h ${remainingMins}m`;
  }
  return `${mins}m`;
}

function formatRemainingEstimate(progressSeconds: number, durationSeconds: number | null, mediaType: string): string {
  const estimatedDuration = durationSeconds || (mediaType === "tv" ? 45 * 60 : 110 * 60);
  const diffSeconds = Math.max(0, estimatedDuration - progressSeconds);
  const minsLeft = Math.ceil(diffSeconds / 60);
  if (minsLeft <= 2) return "Almost finished";
  if (minsLeft >= 60) {
    const hrs = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    return `${hrs}h ${m}m left`;
  }
  return `${minsLeft}m left`;
}

function getImageUrl(item: WatchHistoryItem): string {
  const path = item.backdropUrl || item.posterPath;
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://image.tmdb.org/t/p/w780${path.startsWith("/") ? "" : "/"}${path}`;
}

export function ContinueWatchingRow({ items, onPlay, onRemove }: ContinueWatchingRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  if (!items || items.length === 0) {
    return null;
  }

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    triggerHaptic(5);
    const scrollAmount = direction === "left" ? -360 : 360;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  return (
    <section className="relative w-full z-20 px-3 sm:px-4 pt-3 pb-1 select-none animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Rewind className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold font-mono tracking-wider uppercase text-neutral-100 flex items-center gap-1.5">
              <span>Continue Watching</span>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_#f59e0b]" />
            </h2>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
              {items.length}
            </span>
          </div>
        </div>

        {/* Scroll arrows for desktop */}
        <div className="hidden sm:flex items-center gap-1">
          <Tooltip content="Scroll left">
            <button
              type="button"
              onClick={() => {
                playMechanicalClick();
                handleScroll("left");
              }}
              disabled={!canScrollLeft}
              aria-label="Scroll left"
              className="h-7 w-7 rounded-lg border border-neutral-800 bg-neutral-950/80 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Scroll right">
            <button
              type="button"
              onClick={() => {
                playMechanicalClick();
                handleScroll("right");
              }}
              disabled={!canScrollRight}
              aria-label="Scroll right"
              className="h-7 w-7 rounded-lg border border-neutral-800 bg-neutral-950/80 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Horizontal Carousel Track */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex items-stretch gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 -mx-3 px-3 sm:-mx-4 sm:px-4"
      >
        {items.map((item) => {
          const imageUrl = getImageUrl(item);
          const estimatedDuration =
            item.durationSeconds || (item.mediaType === "tv" ? 45 * 60 : 110 * 60);
          const percent = Math.min(
            100,
            Math.max(5, Math.round((item.progressSeconds / estimatedDuration) * 100))
          );
          const timeLeftText = formatRemainingEstimate(
            item.progressSeconds,
            item.durationSeconds,
            item.mediaType
          );

          return (
            <TiltCard
              key={item.id}
              maxTilt={5}
              scale={1.015}
              className="flex-shrink-0 w-[240px] sm:w-[270px]"
            >
              <div
                onClick={() => {
                  playMechanicalClick();
                  triggerHaptic(10);
                  onPlay(item);
                }}
                className="group relative w-full rounded-xl border border-neutral-800/80 bg-neutral-950/80 hover:border-amber-500/50 hover:bg-neutral-900/90 transition-all duration-200 overflow-hidden cursor-pointer shadow-lg hover:shadow-amber-500/10 active:scale-[0.98]"
              >
              {/* Thumbnail Container (16:9) */}
              <div className="relative aspect-video w-full bg-neutral-900 overflow-hidden">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 240px, 270px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-neutral-600">
                    <Rewind className="h-8 w-8 mb-1 opacity-40" />
                    <span className="text-[10px] font-mono uppercase tracking-wider">Master Tape</span>
                  </div>
                )}

                {/* CRT Scanline effect on card hover */}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.4)_50%)] bg-[length:100%_4px] opacity-0 group-hover:opacity-40 transition-opacity" />

                {/* Ambient dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-80" />

                {/* Center Play Button on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-black/80 px-3 py-1.5 text-xs font-mono font-bold text-amber-300 shadow-xl backdrop-blur-md">
                    <Play className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>Resume</span>
                  </div>
                </div>

                {/* Season & Episode Chip / Movie Chip */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
                  {item.mediaType === "tv" ? (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-black/85 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 backdrop-blur-md shadow-sm">
                      <span>S{item.season}</span>
                      <span className="text-amber-500/60">·</span>
                      <span>E{item.episode}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded border border-neutral-700/60 bg-black/85 px-1.5 py-0.5 text-[9.5px] font-mono font-semibold text-neutral-300 backdrop-blur-md shadow-sm">
                      MOVIE
                    </span>
                  )}
                  {item.releaseYear && (
                    <span className="text-[9.5px] font-mono text-neutral-400 bg-black/70 px-1 rounded">
                      {item.releaseYear}
                    </span>
                  )}
                </div>

                {/* Dismiss button (top right) */}
                <Tooltip content="Remove from Continue Watching" position="left">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playMechanicalClick();
                      triggerHaptic(8);
                      onRemove(item);
                    }}
                    aria-label="Remove from Continue Watching"
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full border border-neutral-700/80 bg-black/80 hover:bg-red-950/80 text-neutral-400 hover:text-red-300 flex items-center justify-center transition-all opacity-80 sm:opacity-0 group-hover:opacity-100 backdrop-blur-sm z-20 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              </div>

              {/* Card Meta & Progress Bar */}
              <div className="p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-semibold text-neutral-100 truncate group-hover:text-amber-300 transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[9.5px] font-mono text-neutral-400 whitespace-nowrap shrink-0">
                    {timeLeftText}
                  </span>
                </div>

                {/* Episode title if available */}
                {item.episodeTitle && (
                  <p className="text-[10px] text-neutral-400 font-mono truncate">
                    {item.episodeTitle}
                  </p>
                )}

                {/* Retro Amber Progress Bar with Glowing Head */}
                <div className="relative w-full h-1.5 rounded-full bg-neutral-800/80">
                  <div
                    className="relative h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    style={{ width: `${percent}%` }}
                  >
                    {/* Glowing Head at the leading edge */}
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(245,158,11,1)] animate-pulse pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
            </TiltCard>
          );
        })}
      </div>
    </section>
  );
}
