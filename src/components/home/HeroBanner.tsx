"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Clock, Loader2, PlayCircle, ShoppingBag } from "lucide-react";
import { useTouchGestures } from "@/lib/useTouchGestures";
import type { MediaSearchResult } from "@/types/media";
import type { BroadcastScheduleItem } from "@/types/tvmaze";

const SLIDE_DURATION_MS = 8000;
const MAX_SLIDES = 8;

interface HeroBannerProps {
  liveNow: BroadcastScheduleItem | null;
  onSelectFeatured?: (media: MediaSearchResult) => void;
  onSelectLive: (item: BroadcastScheduleItem) => void;
  isLiveResolving?: boolean;
  isScheduled?: (tmdbId: number) => boolean;
  onOpenBroadcastStudio?: () => void;
  onRent?: (media: MediaSearchResult) => void;
  onBuy?: (media: MediaSearchResult) => Promise<void> | void;
  isOwned?: (tmdbId: number) => boolean;
  isRented?: (tmdbId: number) => boolean;
  enabled?: boolean;
}

export function HeroBanner({
  liveNow,
  onSelectFeatured,
  onSelectLive,
  isLiveResolving,
  isScheduled,
  onOpenBroadcastStudio,
  onRent,
  onBuy,
  isOwned,
  isRented,
  enabled = true,
}: HeroBannerProps) {
  const [slides, setSlides] = useState<MediaSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const [isBuying, setIsBuying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/tmdb/trending")
      .then((r) => r.json())
      .then((data: { results?: MediaSearchResult[] }) => {
        if (cancelled) return;
        const withBackdrop = (data.results ?? []).filter((i) => i.backdropUrl).slice(0, MAX_SLIDES);
        setSlides(withBackdrop);
      })
      .catch(() => { if (!cancelled) setSlides([]); });
    return () => { cancelled = true; };
  }, [enabled]);

  const goToSlide = useCallback((nextIndex: number) => {
    setActiveIndex(nextIndex);
    setTimerEpoch((e) => e + 1);
  }, []);

  const goNext = useCallback(() => {
    if (slides.length <= 1) return;
    goToSlide((activeIndex + 1) % slides.length);
  }, [activeIndex, slides.length, goToSlide]);

  const goPrev = useCallback(() => {
    if (slides.length <= 1) return;
    goToSlide((activeIndex - 1 + slides.length) % slides.length);
  }, [activeIndex, slides.length, goToSlide]);

  const { handleTouchStart, handleTouchEnd } = useTouchGestures({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  });

  useEffect(() => {
    if (slides.length <= 1 || isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(goNext, SLIDE_DURATION_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [slides.length, isPaused, goNext]);

  const featured = slides[activeIndex] ?? null;

  return (
    <div
      className="group relative h-[38vh] min-h-[270px] sm:h-[60vh] sm:min-h-[440px] lg:h-[64vh] lg:min-h-[480px] max-h-[640px] w-full overflow-hidden rounded-md border border-neutral-800 bg-black select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop crossfade & loading shimmer */}
      {slides.length > 0 ? (
        slides.map((slide, idx) => {
          const isActive = idx === activeIndex;
          const isPreloadNext = slides.length > 1 && idx === (activeIndex + 1) % slides.length;
          // Only mount active slide and the immediate next slide to prevent downloading 8 huge images in parallel
          if (!slide.backdropUrl || (!isActive && !isPreloadNext)) return null;
          return (
            <div
              key={slide.backdropUrl}
              className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-700 ease-in-out will-change-transform ${
                isActive ? "opacity-95 z-0" : "opacity-0 -z-10 pointer-events-none"
              }`}
            >
              <Image
                src={slide.backdropUrl}
                alt={slide.title}
                fill
                priority={idx === 0}
                fetchPriority={idx === 0 ? "high" : "auto"}
                sizes="100vw"
                draggable={false}
                className="object-cover object-[center_20%] sm:object-top"
              />
            </div>
          );
        })
      ) : (
        <div className="absolute inset-0 bg-neutral-950/90 animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-tr from-neutral-900/60 via-neutral-800/20 to-transparent" />
        </div>
      )}

      {/* Cinematic Gradients & Edge Containment */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/65 via-30% to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/50 via-40% to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-black/50" />

      {/* Left arrow */}
      {slides.length > 1 && (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous slide"
          className="absolute left-2 sm:left-3 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white opacity-80 sm:opacity-0 backdrop-blur-md transition-all sm:group-hover:opacity-100 hover:bg-black/80 hover:opacity-100 hover:scale-105 active:scale-90 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      )}

      {/* Right arrow */}
      {slides.length > 1 && (
        <button
          type="button"
          onClick={goNext}
          aria-label="Next slide"
          className="absolute right-2 sm:right-3 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white opacity-80 sm:opacity-0 backdrop-blur-md transition-all sm:group-hover:opacity-100 hover:bg-black/80 hover:opacity-100 hover:scale-105 active:scale-90 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      )}

      {/* Bottom content */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 px-4 pt-4 pb-8 sm:px-8 sm:pt-8 sm:pb-14 lg:px-10 lg:pb-16">
        {/* Title + Watch Now */}
        <div className="max-w-xl sm:max-w-2xl w-full">
          {featured ? (
            <div key={featured.tmdbId} className="animate-in fade-in duration-200">
              <p className="mb-0.5 sm:mb-1 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-amber-400">
                Trending Now
              </p>
              <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold uppercase tracking-wide text-white line-clamp-2 drop-shadow-md">
                {featured.title}
              </h2>
              {featured.releaseYear && (
                <p className="mt-1 sm:mt-1.5 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-wide text-neutral-300">
                  <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-200">
                    {featured.releaseYear}
                  </span>
                  <span>·</span>
                  <span className="font-semibold text-neutral-200">
                    {featured.mediaType === "tv" ? "TV Series" : "Feature Film"}
                  </span>
                </p>
              )}
              {featured && (
                <div className="mt-2.5 sm:mt-3 flex items-center gap-2 sm:gap-2.5">
                  {/* Rent Button */}
                  <button
                    type="button"
                    onClick={() => onRent?.(featured)}
                    disabled={isOwned?.(featured.tmdbId)}
                    className={`pointer-events-auto inline-flex h-8 sm:h-9 min-w-[100px] sm:min-w-[116px] items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 text-[11px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-md shadow-lg transition-all cursor-pointer active:scale-95 ${
                      isOwned?.(featured.tmdbId)
                        ? "border border-neutral-800 bg-neutral-900/50 text-neutral-500 cursor-not-allowed opacity-50"
                        : isRented?.(featured.tmdbId)
                          ? "border border-amber-400/60 bg-amber-900/80 hover:bg-amber-800/90 text-white shadow-amber-950/40"
                          : "border border-amber-500/50 bg-amber-950/70 hover:bg-amber-900/90 text-amber-300 hover:border-amber-400 hover:text-white"
                    }`}
                    title={
                      isOwned?.(featured.tmdbId)
                        ? "Already owned in collection"
                        : isRented?.(featured.tmdbId)
                          ? "Active rental — View tape"
                          : "Rent this tape"
                    }
                  >
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 shrink-0" />
                    <span className="truncate">{isRented?.(featured.tmdbId) ? "✓ Rented" : "Rent"}</span>
                  </button>

                  {/* Buy Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (isBuying) return;
                      setIsBuying(true);
                      try {
                        await onBuy?.(featured);
                      } finally {
                        setIsBuying(false);
                      }
                    }}
                    disabled={isOwned?.(featured.tmdbId) || isBuying}
                    className={`pointer-events-auto inline-flex h-8 sm:h-9 min-w-[100px] sm:min-w-[116px] items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 text-[11px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-md shadow-lg transition-all cursor-pointer active:scale-95 ${
                      isOwned?.(featured.tmdbId)
                        ? "border border-emerald-800/60 bg-emerald-950/70 text-emerald-300"
                        : "border border-white/20 bg-white hover:bg-neutral-200 text-black shadow-white/10 hover:scale-[1.02]"
                    } disabled:cursor-not-allowed`}
                    title={
                      isOwned?.(featured.tmdbId)
                        ? "Permanently owned in collection"
                        : "Purchase tape permanently"
                    }
                  >
                    {isBuying ? (
                      <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-black shrink-0" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    )}
                    <span className="truncate">{isOwned?.(featured.tmdbId) ? "✓ Owned" : "Buy"}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:gap-3 animate-pulse">
              <div className="h-3 sm:h-3.5 w-24 sm:w-28 rounded-full bg-neutral-800/80" />
              <div className="h-7 sm:h-10 lg:h-12 w-3/4 sm:w-2/3 rounded-lg bg-neutral-800/90" />
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-3.5 w-12 rounded bg-neutral-800/70" />
                <div className="h-3.5 w-20 rounded bg-neutral-800/70" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-7 sm:h-9 w-20 sm:w-24 rounded-lg bg-neutral-800/60" />
                <div className="h-7 sm:h-9 w-20 sm:w-24 rounded-lg bg-neutral-800/60" />
              </div>
            </div>
          )}
        </div>

        {/* Live pill */}
        {liveNow && (
          <div className="pointer-events-auto hidden max-w-xs shrink-0 flex-col items-end gap-1 text-right sm:flex">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Live Now
            </span>
            <span className="truncate text-lg font-medium text-neutral-100">{liveNow.showName}</span>
            <span className="text-xs text-neutral-400">by {liveNow.network}</span>
            {isLiveResolving ? (
              <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-neutral-400" />
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectLive(liveNow); }}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-sm transition-all hover:bg-white/20 cursor-pointer active:scale-95"
              >
                <PlayCircle className="h-3 w-3 text-red-400" />
                Tune In
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scan-line progress indicators */}
      {slides.length > 1 && (
        <div className="pointer-events-auto absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 sm:bottom-4">
          {slides.map((slide, idx) => {
            const isActive = idx === activeIndex;
            const isPast = idx < activeIndex;
            return (
              <button
                key={slide.tmdbId ?? idx}
                type="button"
                aria-label={`Slide ${idx + 1}: ${slide.title}`}
                onClick={() => goToSlide(idx)}
                className="relative h-[3px] overflow-hidden rounded-full bg-white/20 transition-all duration-300 hover:bg-white/40 focus:outline-none cursor-pointer"
                style={{ width: isActive ? 28 : 8 }}
              >
                {isPast && <span className="absolute inset-0 rounded-full bg-white/60" />}
                {isActive && (
                  <span
                    key={`${idx}-${timerEpoch}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-white"
                    style={{
                      animation: isPaused
                        ? "none"
                        : `scanline-fill ${SLIDE_DURATION_MS}ms linear forwards`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes scanline-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
