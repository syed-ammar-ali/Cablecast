"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Newspaper, Radio, Trophy, Tv } from "lucide-react";
import type { BroadcastScheduleItem } from "@/types/tvmaze";
import { classifyBroadcast } from "@/lib/broadcastCategory";
import {
  getBroadcastRuntimeMinutes,
  getBroadcastStartMinutes,
} from "@/lib/broadcastLive";
import { getNetworkLogo } from "@/config/networkLogos";
import type { useBroadcastResolver } from "@/lib/useBroadcastResolver";

import type { MediaSearchResult } from "@/types/media";
import type { PersonalScheduleItem } from "@/types/broadcast";
import { personalScheduleToMediaSearchResult } from "@/types/broadcast";

export type { BroadcastSelection } from "@/types/broadcastSelection";

/**
 * Real-world broadcast guide: networks are the fixed Y-axis (one row per
 * network appearing in the fetched day), minutes-since-midnight is the
 * X-axis, and a red "LIVE" line tracks the real current time.
 * Responsive horizontal scaling:
 * - Mobile (< md): 4px per minute = 120px per 30-minute block (compact view)
 * - Desktop (>= md): 6px per minute = 180px per 30-minute block (spacious view)
 */
const BLOCK_MINUTES = 30;
const DAY_MINUTES = 24 * 60;
const ROW_HEIGHT_PX = 60;
const HEADER_HEIGHT_PX = 44;

function formatClock(minutesFromMidnight: number): string {
  const wrapped = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const hours24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatBlockRangeLabel(blockStartMinutes: number): string {
  return `${formatClock(blockStartMinutes)}-${formatClock(blockStartMinutes + BLOCK_MINUTES)}`;
}

type BroadcastResolver = ReturnType<typeof useBroadcastResolver>;

interface TvGridProps {
  schedule: BroadcastScheduleItem[];
  isLoading: boolean;
  error: string | null;
  selectedDate: string;
  now: Date;
  /** Shared with the hero's "Live Now" panel, via `useBroadcastResolver` — see that module. */
  resolver: BroadcastResolver;
  personalSchedule?: PersonalScheduleItem[];
  channelName?: string;
  onPlayPersonalBroadcast?: (target: {
    media: MediaSearchResult;
    season?: number;
    episode?: number;
    startOffsetSeconds?: number;
  }) => void;
}

export function TvGrid({
  schedule,
  isLoading,
  error,
  selectedDate,
  now,
  resolver,
  personalSchedule = [],
  channelName = "My Lineup",
  onPlayPersonalBroadcast,
}: TvGridProps) {
  const { resolvingId, resolveMessage, unavailableIds, resolveBroadcast, clearUnavailable } = resolver;
  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  // Current time in minutes from the provided `now` prop (ticks every 20s from root)
  const minutesNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const currentBlockStart = Math.floor(minutesNow / BLOCK_MINUTES) * BLOCK_MINUTES;

  // Clear unavailable cache whenever the date changes — a show unavailable on
  // one date may have a TMDB entry on another, and live slots need a clean slate.
  useEffect(() => {
    clearUnavailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const lastSnappedDateRef = useRef<string | null>(null);

  // Snap the unified timeline to "now" ONLY on initial mount or when date changes manually
  useEffect(() => {
    if (!schedule.length) return;
    if (lastSnappedDateRef.current === selectedDate) return;

    const snapToLive = () => {
      if (!gridScrollRef.current) return;
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const pxPerMin = isMobile ? 4 : 6;
      const d = new Date();
      const currentMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      const liveLineLeftPx = currentMin * pxPerMin;
      const containerWidth = gridScrollRef.current.clientWidth || 800;
      const targetScroll = Math.max(0, liveLineLeftPx - containerWidth * 0.3);
      gridScrollRef.current.scrollLeft = targetScroll;
      lastSnappedDateRef.current = selectedDate;
    };

    // Ensure DOM paint/layout cycle has resolved after loading state unmount
    const rafId = requestAnimationFrame(() => {
      snapToLive();
      requestAnimationFrame(snapToLive);
    });

    return () => cancelAnimationFrame(rafId);
  }, [schedule.length, selectedDate]);

  const handleSlotClick = useCallback(
    (item: BroadcastScheduleItem) => {
      resolveBroadcast(item, now);
    },
    [resolveBroadcast, now],
  );

  const selectedDayOfWeek = useMemo(() => {
    const parts = selectedDate.split("-").map(Number);
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    }
    return now.getDay();
  }, [selectedDate, now]);

  const dayPersonalSchedule = useMemo(() => {
    return personalSchedule.filter((item) => item.dayOfWeek === selectedDayOfWeek);
  }, [personalSchedule, selectedDayOfWeek]);

  const groupedByNetwork = useMemo(() => {
    const map = new Map<string, BroadcastScheduleItem[]>();
    for (const item of schedule) {
      const list = map.get(item.network) ?? [];
      list.push(item);
      map.set(item.network, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [schedule]);

  const blockLabels = useMemo(
    () => Array.from({ length: DAY_MINUTES / BLOCK_MINUTES }, (_, i) => i * BLOCK_MINUTES),
    [],
  );

  if (error) {
    return (
      <p className="mx-auto max-w-md rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-center font-mono text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (isLoading && schedule.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isLoading && schedule.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-neutral-800 py-10 text-xs uppercase tracking-widest text-neutral-600">
        <Tv className="h-6 w-6" />
        No broadcast schedule found for this date and region.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-auto [--px-per-min:4px] md:[--px-per-min:6px]">
      {resolveMessage && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span>{resolveMessage}</span>
          </div>
          <button
            type="button"
            onClick={clearUnavailable}
            className="text-[11px] font-medium text-neutral-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Single Unified Horizontal Scroll Container (100% Native, Identical Touch Momentum & Physics Across Whole Grid) ── */}
      <div
        ref={gridScrollRef}
        className="no-scrollbar relative h-auto overflow-x-auto border-b border-neutral-900 bg-neutral-950/40 pb-20 md:pb-0 overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="relative min-w-max">
          {/* ── 1. Top Time Slot Header Row (Direct child of the single scroll container) ── */}
          <div className="flex border-b border-neutral-800 bg-black shadow-md shadow-black/80">
            {/* Sticky Left Header Corner: Channel Header */}
            <div
              className="sticky left-0 z-30 flex shrink-0 items-center justify-between border-r border-neutral-800 bg-black px-2 md:px-3 text-[11px] md:text-xs font-bold uppercase tracking-wider text-neutral-400 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.8)] w-24 md:w-52"
              style={{ height: HEADER_HEIGHT_PX }}
            >
              <span className="truncate">
                <span className="md:hidden">Channels</span>
                <span className="hidden md:inline">All Channels</span>
              </span>
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-red-500 shrink-0" />}
            </div>

            {/* Time Slots Header Blocks */}
            <div
              className="flex shrink-0"
              style={{ width: "calc(1440 * var(--px-per-min))", height: HEADER_HEIGHT_PX }}
            >
              {blockLabels.map((blockStart) => {
                const isCurrent = blockStart === currentBlockStart;
                return (
                  <div
                    key={blockStart}
                    className={`flex shrink-0 items-center justify-center border-r border-neutral-900 bg-black text-[9px] md:text-[11px] uppercase tracking-wide transition-colors px-0.5 truncate ${isCurrent
                        ? "bg-neutral-800 text-white font-bold"
                        : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    style={{ width: "calc(30 * var(--px-per-min))", height: HEADER_HEIGHT_PX }}
                  >
                    <span className="truncate">{formatBlockRangeLabel(blockStart)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 2. Channel Rows (Left network column sticky on X with z-30 solid background) ── */}
          <div className="flex flex-col">
            {/* Top-pinned Custom Personal Broadcast Channel - Always visible at position #1 */}
            <PersonalChannelRow
              items={dayPersonalSchedule}
              channelName={channelName}
              now={now}
              onPlay={(target) => onPlayPersonalBroadcast?.(target)}
            />

            {groupedByNetwork.map(([network, items]) => (
              <NetworkRow
                key={network}
                network={network}
                items={items}
                now={now}
                resolvingId={resolvingId}
                unavailableIds={unavailableIds}
                onSlotClick={handleSlotClick}
              />
            ))}
          </div>

          {/* Red Live Line (Isolated sub-component: second-by-second updates do not cause whole-grid re-renders) */}
          <LiveSweepLine />
        </div>
      </div>
    </div>
  );
}

function LiveSweepLine() {
  const [minutesNow, setMinutesNow] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setMinutesNow(d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="pointer-events-none absolute top-[44px] bottom-0 z-10 w-px bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.7)] left-24 md:left-52"
      style={{
        transform: `translateX(calc(${minutesNow} * var(--px-per-min)))`,
      }}
    />
  );
}

function PersonalChannelRow({
  items,
  channelName,
  now,
  onPlay,
}: {
  items: PersonalScheduleItem[];
  channelName: string;
  now: Date;
  onPlay: (target: {
    media: MediaSearchResult;
    season?: number;
    episode?: number;
    startOffsetSeconds?: number;
  }) => void;
}) {
  return (
    <div className="flex border-b border-neutral-900 bg-neutral-950/40">
      <div
        className="sticky left-0 z-30 flex shrink-0 items-center gap-2 border-r border-neutral-800 bg-black px-2 md:px-3 text-base font-semibold text-neutral-100 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.8)] w-24 md:w-52"
        style={{ height: ROW_HEIGHT_PX }}
      >
        <Radio className="hidden md:block h-4 w-4 shrink-0 text-purple-400 animate-pulse" />
        <span
          className="truncate text-[11px] md:text-xs font-bold uppercase text-neutral-200 md:text-neutral-100 tracking-wider"
          title={channelName}
        >
          {channelName}
        </span>
      </div>

      <div
        className="relative shrink-0"
        style={{ width: "calc(1440 * var(--px-per-min))", height: ROW_HEIGHT_PX }}
      >
        {items.length === 0 ? (
          <div
            className="absolute inset-y-1 left-2 right-2 flex items-center justify-center rounded border border-dashed border-neutral-800/80 bg-neutral-950/40 text-center"
          >
            <span className="text-[10px] md:text-[11px] font-mono uppercase tracking-wider text-neutral-400 truncate px-2">
              No scheduled broadcasts today · Program in Broadcast Studio
            </span>
          </div>
        ) : (
          (() => {
            const sorted = [...items].sort((a, b) => a.blockStartMinutes - b.blockStartMinutes);
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            return sorted.map((item, i) => {
              const startMinutes = item.blockStartMinutes;
              let totalMinutes = item.blockCount * BLOCK_MINUTES;

              const nextItem = sorted[i + 1];
              if (nextItem) {
                if (nextItem.blockStartMinutes > startMinutes && startMinutes + totalMinutes > nextItem.blockStartMinutes) {
                  totalMinutes = nextItem.blockStartMinutes - startMinutes;
                }
              }

              const endMinutes = startMinutes + totalMinutes;
              const isLive = startMinutes <= nowMinutes && endMinutes > nowMinutes;
              const isFuture = !isLive && startMinutes > nowMinutes;

              if (isLive) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onPlay({
                        media: personalScheduleToMediaSearchResult(item),
                        season: item.mediaType === "tv" ? item.currentSeason : undefined,
                        episode: item.mediaType === "tv" ? item.currentEpisode : undefined,
                        startOffsetSeconds: (nowMinutes - item.blockStartMinutes) * 60 + now.getSeconds(),
                      })
                    }
                    title={`Airing Live — Click to tune in (${item.title})`}
                    style={{
                      left: `calc(${startMinutes} * var(--px-per-min))`,
                      width: `calc(${totalMinutes} * var(--px-per-min))`,
                      height: ROW_HEIGHT_PX,
                    }}
                    className="absolute top-0 flex flex-col justify-center gap-0.5 border-r border-l-2 border-black/60 px-1.5 md:px-2 text-left transition-all border-l-red-500 bg-red-950/20 hover:bg-red-900/30 shadow-[inset_0_0_12px_rgba(239,68,68,0.2)] cursor-pointer overflow-hidden"
                  >
                    <div className="flex min-w-0 w-full flex-col">
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                        <p className="truncate text-[10px] md:text-xs font-semibold leading-tight text-white">
                          {item.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 w-full items-center justify-between gap-1 text-[9px] md:text-[10px] uppercase tracking-wide leading-tight">
                      <span className="text-red-400 font-mono font-medium truncate">
                        {item.isRerun ? "RERUN ON AIR" : "ON AIR NOW"}
                      </span>
                      {item.mediaType === "tv" ? (
                        <span className="text-neutral-400 font-mono text-[8px] md:text-[9px] shrink-0 truncate">
                          S{item.currentSeason}E{item.currentEpisode}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-[8px] md:text-[9px] shrink-0 truncate">
                          {item.blockCount * 30}m
                        </span>
                      )}
                    </div>
                  </button>
                );
              }

              return (
                <div
                  key={item.id}
                  title={
                    isFuture
                      ? `Upcoming — Airs at ${item.timeLabel} (${item.title})${item.isRerun ? " [Rerun Encore]" : ""}`
                      : `Broadcast Ended (${item.title})`
                  }
                  style={{
                    left: `calc(${startMinutes} * var(--px-per-min))`,
                    width: `calc(${totalMinutes} * var(--px-per-min))`,
                    height: ROW_HEIGHT_PX,
                  }}
                  className={`absolute top-0 flex flex-col justify-center gap-0.5 border-r border-l-2 border-black/60 px-1.5 md:px-2 text-left transition-all cursor-default select-none overflow-hidden ${
                    item.isRerun && isFuture
                      ? "border-l-amber-500/80 bg-amber-950/20 opacity-85"
                      : isFuture
                        ? "border-l-neutral-700/60 opacity-70"
                        : "border-l-neutral-800/40 opacity-40 grayscale"
                  }`}
                >
                  <div className="flex min-w-0 w-full flex-col">
                    <div className="flex min-w-0 items-center gap-1">
                      <p className="truncate text-[10px] md:text-xs font-semibold leading-tight text-neutral-300">
                        {item.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 w-full items-center justify-between gap-1 text-[9px] md:text-[10px] uppercase tracking-wide leading-tight">
                    <span className={`font-mono truncate ${item.isRerun ? "text-amber-400/90 font-medium" : "text-neutral-500"}`}>
                      {item.isRerun
                        ? (isFuture ? `RERUN ${item.timeLabel}` : "RERUN ENDED")
                        : (isFuture ? `AIRS ${item.timeLabel}` : "ENDED")}
                    </span>
                    {item.mediaType === "tv" ? (
                      <span className="text-neutral-400 font-mono text-[8px] md:text-[9px] shrink-0 truncate">
                        S{item.currentSeason}E{item.currentEpisode}
                      </span>
                    ) : (
                      <span className="text-neutral-400 text-[8px] md:text-[9px] shrink-0 truncate">
                        {item.blockCount * 30}m
                      </span>
                    )}
                  </div>
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );
}

function NetworkRow({
  network,
  items,
  now,
  resolvingId,
  unavailableIds,
  onSlotClick,
}: {
  network: string;
  items: BroadcastScheduleItem[];
  now: Date;
  resolvingId: number | null;
  unavailableIds: Set<number>;
  onSlotClick: (item: BroadcastScheduleItem) => void;
}) {
  const logo = getNetworkLogo(network);

  // Position items on the timeline by their true airtimes:
  // - Deduplicates identical entries
  // - Handles simultaneous same-airtime broadcasts by placing them sequentially
  // - Clamps oversized runtimes so no show spills over or covers the next scheduled broadcast
  const positionedItems = useMemo(() => {
    const seen = new Set<string>();
    const unique: BroadcastScheduleItem[] = [];
    for (const item of items) {
      const key = `${item.showName.toLowerCase()}|${item.season ?? 0}|${item.episodeNumber ?? 0}|${item.airtime}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    const sorted = unique.sort((a, b) => {
      const diff = getBroadcastStartMinutes(a) - getBroadcastStartMinutes(b);
      if (diff !== 0) return diff;
      return a.showName.localeCompare(b.showName);
    });

    const result: Array<{ item: BroadcastScheduleItem; startMinutes: number; runtimeMinutes: number }> = [];
    let currentTimelineHead = 0;

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      let startMinutes = getBroadcastStartMinutes(item);
      let runtimeMinutes = getBroadcastRuntimeMinutes(item);

      if (startMinutes < currentTimelineHead) {
        startMinutes = currentTimelineHead;
      }

      const nextItem = sorted[i + 1];
      if (nextItem) {
        const nextStart = getBroadcastStartMinutes(nextItem);
        if (nextStart > startMinutes && startMinutes + runtimeMinutes > nextStart) {
          runtimeMinutes = Math.max(15, nextStart - startMinutes);
        }
      }

      runtimeMinutes = Math.max(15, runtimeMinutes);
      currentTimelineHead = startMinutes + runtimeMinutes;

      result.push({
        item,
        startMinutes,
        runtimeMinutes,
      });
    }

    return result;
  }, [items]);

  return (
    <div className="flex border-b border-neutral-900">
      <div
        className="sticky left-0 z-30 flex shrink-0 items-center gap-2 border-r border-neutral-800 bg-black px-2 md:px-3 text-base font-semibold text-neutral-100 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.8)] w-24 md:w-52"
        style={{ height: ROW_HEIGHT_PX }}
      >
        <div className="hidden md:flex items-center shrink-0">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" loading="lazy" decoding="async" className="h-6 w-6 shrink-0 rounded-sm object-contain" />
          ) : (
            <Tv className="h-5 w-5 shrink-0 text-neutral-500" />
          )}
        </div>
        <span
          className="truncate text-[11px] md:text-sm font-bold md:font-semibold uppercase md:normal-case text-neutral-200 md:text-neutral-100"
          title={network}
        >
          {network}
        </span>
      </div>

      <div
        className="relative shrink-0"
        style={{ width: "calc(1440 * var(--px-per-min))", height: ROW_HEIGHT_PX }}
      >
        {positionedItems.map(({ item, startMinutes, runtimeMinutes }) => (
          <ProgramCard
            key={item.id}
            item={item}
            startMinutes={startMinutes}
            runtimeMinutes={runtimeMinutes}
            now={now}
            isResolving={resolvingId === item.id}
            isUnavailable={unavailableIds.has(item.id)}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}

function ProgramCard({
  item,
  startMinutes,
  runtimeMinutes,
  now,
  isResolving,
  isUnavailable,
  onSlotClick,
}: {
  item: BroadcastScheduleItem;
  startMinutes: number;
  runtimeMinutes: number;
  now: Date;
  isResolving: boolean;
  isUnavailable: boolean;
  onSlotClick: (item: BroadcastScheduleItem) => void;
}) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = startMinutes + runtimeMinutes;

  // Live = wall clock falls inside this show's airtime, on ANY date.
  // If your clock says 8 PM, airtime "20:00" shows are live — always.
  const isLive = startMinutes <= nowMinutes && endMinutes > nowMinutes;
  const isFuture = !isLive && startMinutes > nowMinutes;
  const category = classifyBroadcast(item.showType);

  const canTuneIn = isLive && !isUnavailable && !isResolving;

  // TVmaze often sets season to the calendar year (e.g. 2026) for daily news, talk shows,
  // or annual specials. We only display "S{season}" if it is a real TV season number (< 100).
  const isRealSeason = item.season != null && item.season > 0 && item.season < 100;
  const episodeTag = item.episodeNumber != null
    ? (isRealSeason ? `S${item.season}E${item.episodeNumber}` : `EP ${item.episodeNumber}`)
    : (isRealSeason ? `S${item.season}` : null);

  const isRedundantSubtitle =
    !item.episodeName ||
    item.episodeName === item.showName ||
    (episodeTag && item.episodeName.toLowerCase().replace(/[^a-z0-9]/g, "") === episodeTag.toLowerCase().replace(/[^a-z0-9]/g, "")) ||
    /^ep(?:isode|\.)?\s*#?\s*\d+$/i.test(item.episodeName);

  const cleanSubtitle = !isRedundantSubtitle ? item.episodeName : null;
  const epDetail = [episodeTag, cleanSubtitle].filter(Boolean).join(" · ");
  const fullTitle = epDetail ? `${item.showName} (${epDetail})` : item.showName;

  const tooltipText = isUnavailable
    ? `No match found for "${item.showName}"`
    : isLive
      ? `Airing Live — Click to tune in (${fullTitle})`
      : isFuture
        ? `Upcoming — Airs at ${item.airtime} (${fullTitle})`
        : `Broadcast Ended (${fullTitle})`;

  const accentClass = isLive
    ? "border-l-red-500 bg-red-950/20 hover:bg-red-900/30 shadow-[inset_0_0_12px_rgba(239,68,68,0.2)]"
    : isFuture
      ? "border-l-neutral-700/60 opacity-70"
      : "border-l-neutral-800/40 opacity-35 grayscale";

  return (
    <button
      type="button"
      onClick={() => {
        if (canTuneIn) onSlotClick(item);
      }}
      disabled={!canTuneIn}
      title={tooltipText}
      style={{
        left: `calc(${startMinutes} * var(--px-per-min))`,
        width: `calc(${runtimeMinutes} * var(--px-per-min))`,
        height: ROW_HEIGHT_PX,
      }}
      className={`absolute top-0 flex flex-col justify-center gap-0.5 border-r border-l-2 border-black/60 px-1.5 md:px-2 text-left transition-all overflow-hidden ${accentClass} ${
        canTuneIn
          ? "cursor-pointer hover:bg-white/10"
          : isResolving
            ? "cursor-wait opacity-80"
            : "cursor-default"
      }`}
    >
      <div className="flex min-w-0 w-full flex-col">
        <div className="flex min-w-0 items-center gap-1">
          {isLive && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />}
          {!isLive && category === "news" && <Newspaper className="h-2.5 w-2.5 shrink-0 text-sky-400/70" />}
          {!isLive && category === "sports" && <Trophy className="h-2.5 w-2.5 shrink-0 text-orange-400/70" />}
          <p className={`truncate text-[10px] md:text-xs font-semibold leading-tight ${isLive ? "text-white" : "text-neutral-300"}`}>
            {item.showName}
          </p>
        </div>
        {cleanSubtitle && (
          <p className="truncate text-[9px] md:text-[10px] text-neutral-400 font-normal leading-tight">
            {cleanSubtitle}
          </p>
        )}
      </div>

      <div className="flex min-w-0 w-full items-center justify-between gap-1 text-[9px] md:text-[10px] uppercase tracking-wide leading-tight">
        <span className={`truncate ${isLive ? "text-red-400 font-mono font-medium" : "text-neutral-500 font-mono"}`}>
          {isLive
            ? "ON AIR NOW"
            : isFuture
              ? `AIRS ${item.airtime}`
              : "ENDED"}
        </span>
        {episodeTag && (
          <span className="text-neutral-500 font-mono text-[8px] md:text-[9px] shrink-0 truncate">
            {episodeTag}
          </span>
        )}
      </div>

      {isResolving ? (
        <Loader2 className="absolute right-1 top-1/2 h-3 w-3 md:h-3.5 md:w-3.5 -translate-y-1/2 animate-spin text-white" />
      ) : isUnavailable ? (
        <AlertCircle className="absolute right-1 top-1/2 h-3 w-3 md:h-3.5 md:w-3.5 -translate-y-1/2 text-neutral-500" />
      ) : null}
    </button>
  );
}

