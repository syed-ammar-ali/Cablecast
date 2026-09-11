"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
  Radio,
  Search,
  Check,
  Loader2,
  Tv,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Film,
  Sun,
  Moon,
  Layers,
  CalendarCheck2,
} from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import { DAYS_OF_WEEK, formatBlockTime } from "@/types/broadcast";
import { notifyBroadcastMutation } from "@/lib/syncEvents";
import { useToast } from "@/components/ui/ToastProvider";
import { triggerHaptic } from "@/lib/haptics";
import type { NostalgiaScheduleResult, ScheduledSeasonPreview } from "@/lib/nostalgiaScheduler";

interface NostalgiaSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialShow?: MediaSearchResult | null;
  onScheduled?: () => void;
}

// 12-hour slots matching ScheduleBroadcastModal (12:00, 12:30, 1:00 ... 11:30)
const HALF_DAY_SLOTS = [
  { hour12: 12, minute: 0, label: "12:00" },
  { hour12: 12, minute: 30, label: "12:30" },
  { hour12: 1, minute: 0, label: "1:00" },
  { hour12: 1, minute: 30, label: "1:30" },
  { hour12: 2, minute: 0, label: "2:00" },
  { hour12: 2, minute: 30, label: "2:30" },
  { hour12: 3, minute: 0, label: "3:00" },
  { hour12: 3, minute: 30, label: "3:30" },
  { hour12: 4, minute: 0, label: "4:00" },
  { hour12: 4, minute: 30, label: "4:30" },
  { hour12: 5, minute: 0, label: "5:00" },
  { hour12: 5, minute: 30, label: "5:30" },
  { hour12: 6, minute: 0, label: "6:00" },
  { hour12: 6, minute: 30, label: "6:30" },
  { hour12: 7, minute: 0, label: "7:00" },
  { hour12: 7, minute: 30, label: "7:30" },
  { hour12: 8, minute: 0, label: "8:00" },
  { hour12: 8, minute: 30, label: "8:30" },
  { hour12: 9, minute: 0, label: "9:00" },
  { hour12: 9, minute: 30, label: "9:30" },
  { hour12: 10, minute: 0, label: "10:00" },
  { hour12: 10, minute: 30, label: "10:30" },
  { hour12: 11, minute: 0, label: "11:00" },
  { hour12: 11, minute: 30, label: "11:30" },
];

function toMinutesFromMidnight(hour12: number, minute: number, meridiem: "AM" | "PM"): number {
  let hours24 = hour12 % 12;
  if (meridiem === "PM") hours24 += 12;
  return hours24 * 60 + minute;
}

const CLASSIC_SHOW_SUGGESTIONS = [
  {
    tmdbId: 1668,
    title: "Friends",
    years: "1994 - 2004",
    network: "NBC Must-See TV",
    seasons: "10 Seasons",
    poster: "https://image.tmdb.org/t/p/w185/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
  },
  {
    tmdbId: 1400,
    title: "Seinfeld",
    years: "1989 - 1998",
    network: "NBC Classic",
    seasons: "9 Seasons",
    poster: "https://image.tmdb.org/t/p/w185/aCw8ON0fZioNHK40gtOp3umUrq9.jpg",
  },
  {
    tmdbId: 4087,
    title: "The X-Files",
    years: "1993 - 2018",
    network: "FOX Sci-Fi",
    seasons: "11 Seasons",
    poster: "https://image.tmdb.org/t/p/w185/7diUbLR4n9A7sC3Z72s5f9eC8dJ.jpg",
  },
  {
    tmdbId: 95,
    title: "Buffy the Vampire Slayer",
    years: "1997 - 2003",
    network: "The WB",
    seasons: "7 Seasons",
    poster: "https://image.tmdb.org/t/p/w185/e5y64pG3c2z7gCqV7lU8iM2e2L6.jpg",
  },
  {
    tmdbId: 456,
    title: "The Simpsons",
    years: "1989 - Present",
    network: "FOX Animation",
    seasons: "Golden Era (S1-12)",
    poster: "https://image.tmdb.org/t/p/w185/zI3E29ipAfd4fe0n0Vkv6048o4v.jpg",
  },
  {
    tmdbId: 192,
    title: "Twin Peaks",
    years: "1990 - 1991",
    network: "ABC Mystery",
    seasons: "Original Run",
    poster: "https://image.tmdb.org/t/p/w185/7BzxUo39uW6kQe5sU9m6tQ1Z5u7.jpg",
  },
  {
    tmdbId: 4586,
    title: "Gilmore Girls",
    years: "2000 - 2007",
    network: "The WB Drama",
    seasons: "7 Seasons",
    poster: "https://image.tmdb.org/t/p/w185/3V1kL9i7pW0M5jB3nU7hC6kM3k5.jpg",
  },
  {
    tmdbId: 1667,
    title: "That '70s Show",
    years: "1998 - 2006",
    network: "FOX Sitcom",
    seasons: "8 Seasons",
    poster: "https://image.tmdb.org/t/p/w185/790Yt74P20V1w2E8u4qX4lQ8v0v.jpg",
  },
];

/**
 * Custom Vintage Dropdown for selecting Launch Years with retro tags
 */
function RetroYearDropdown({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (val: number) => void;
  options: { year: number; label: string; badge: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.year === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          triggerHaptic(8);
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 px-3.5 py-2 text-left text-xs font-mono font-bold text-neutral-200 transition-colors hover:border-neutral-700 focus:border-neutral-600 focus:outline-none cursor-pointer"
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
          <span className="text-white">{selected.year}</span>
          <span className="text-neutral-500 text-[11px] font-sans truncate">• {selected.label}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-950/95 p-1 backdrop-blur-xl shadow-2xl shadow-black animate-in fade-in zoom-in-95 duration-150">
          {options.map((opt) => {
            const isSelected = opt.year === value;
            return (
              <button
                key={opt.year}
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  onChange(opt.year);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-mono transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-neutral-800 text-white font-bold border border-neutral-700"
                    : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={isSelected ? "text-white font-bold" : "text-white"}>
                    {opt.year}
                  </span>
                  <span className="text-neutral-400 text-[11px] font-sans">{opt.label}</span>
                </div>
                <span
                  className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                    isSelected
                      ? "bg-neutral-900 text-amber-400 border border-neutral-700"
                      : "bg-neutral-900 text-neutral-500"
                  }`}
                >
                  {opt.badge}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NostalgiaSchedulerModal({
  isOpen,
  onClose,
  initialShow,
  onScheduled,
}: NostalgiaSchedulerModalProps) {
  const { toast } = useToast();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedShow, setSelectedShow] = useState<MediaSearchResult | null>(initialShow || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Appointment config
  const [targetDayOfWeek, setTargetDayOfWeek] = useState<number>(4); // Thursday default (Must-See TV)
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(17); // 8:30 PM default
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");
  const [startYear, setStartYear] = useState<number>(currentYear);

  // Preview state
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<NostalgiaScheduleResult | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(1);
  const [seasonOverrides, setSeasonOverrides] = useState<Record<number, { customStartDate?: string }>>({});
  const [isCommitting, setIsCommitting] = useState(false);

  // Reset when opened or closed
  useEffect(() => {
    if (isOpen) {
      if (initialShow) {
        setSelectedShow(initialShow);
      }
    } else {
      setPreviewResult(null);
      setSeasonOverrides({});
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [isOpen, initialShow]);

  // Search debounce
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          const tvOnly = Array.isArray(data)
            ? data.filter((item: MediaSearchResult) => item.mediaType === "tv")
            : [];
          setSearchResults(tvOnly);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const currentSlot = HALF_DAY_SLOTS[selectedSlotIndex] || HALF_DAY_SLOTS[17];
  const blockStartMinutes = toMinutesFromMidnight(currentSlot.hour12, currentSlot.minute, meridiem);

  const startYearOptions = useMemo(
    () => [
      {
        year: currentYear,
        label: "Autumn Premiere",
        badge: "Recommended",
      },
      {
        year: currentYear + 1,
        label: "Next Year Season 1 Launch",
        badge: "Next Year",
      },
      {
        year: currentYear + 2,
        label: "Archival Broadcast Run",
        badge: `+2 Years`,
      },
    ],
    [currentYear],
  );

  // Fetch or calculate preview
  const handleGeneratePreview = useCallback(async () => {
    if (!selectedShow) return;
    triggerHaptic(15);
    setIsPreviewLoading(true);

    try {
      const res = await fetch("/api/calendar/nostalgia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          tmdbId: selectedShow.tmdbId,
          targetDayOfWeek,
          blockStartMinutes,
          startYear,
          seasonOverrides,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate schedule preview.");

      setPreviewResult(data.preview);
      if (data.preview?.seasons?.length > 0) {
        setExpandedSeason(data.preview.seasons[0].seasonNumber);
      }
      toast.success(
        `Generated multi-year schedule across ${data.preview.totalSeasons} seasons (${data.preview.totalEpisodes} episodes)!`,
        "Timeline Calculated",
      );
    } catch (err) {
      toast.error((err as Error).message || "Preview failed", "Error");
    } finally {
      setIsPreviewLoading(false);
    }
  }, [selectedShow, targetDayOfWeek, blockStartMinutes, startYear, seasonOverrides, toast]);

  // Commit schedule to calendar
  const handleCommitSchedule = async () => {
    if (!selectedShow || !previewResult) return;
    triggerHaptic(20);
    setIsCommitting(true);

    try {
      const res = await fetch("/api/calendar/nostalgia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          tmdbId: selectedShow.tmdbId,
          targetDayOfWeek,
          blockStartMinutes,
          startYear,
          seasonOverrides,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to lock in schedule.");

      notifyBroadcastMutation();
      toast.success(
        `Scheduled ${data.count} episodes for "${selectedShow.title}" across ${previewResult.totalSeasons} years!`,
        "Nostalgia Run Activated",
      );

      onScheduled?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Scheduling error", "Booking Failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const dayObj = DAYS_OF_WEEK.find((d) => d.day === targetDayOfWeek);
  const formattedSelectedTime = `${currentSlot.label} ${meridiem}`;

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nostalgia-scheduler-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-0 sm:p-4 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-neutral-800 bg-neutral-950 text-white shadow-2xl shadow-black animate-in zoom-in-95 duration-200 overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Header - Unified Breadcrumb & Retro Channel Header */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-neutral-900 bg-neutral-950/95 px-4 sm:px-5 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  onClose();
                }}
                className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer min-h-[32px] py-1 active:scale-95"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Back to Studio</span>
              </button>
              <span className="text-neutral-700 leading-none select-none">/</span>
              <span
                id="nostalgia-scheduler-title"
                className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate"
              >
                Nostalgia Run
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-neutral-900/60 pt-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-amber-400 shadow">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate flex items-center gap-2">
                  <span>Retro TV Broadcast Scheduler</span>
                  <span className="rounded bg-neutral-900 border border-neutral-800 px-1.5 py-0.2 font-mono text-[9px] font-bold text-neutral-300 shrink-0">
                    Must-See Pacing
                  </span>
                </h1>
                <p className="text-[10px] sm:text-[11px] text-neutral-400 truncate">
                  Map authentic seasonal broadcast schedules across future years.
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Form Body */}
        <div className="no-scrollbar flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5 overscroll-contain touch-pan-y">
          {/* Step 1: Select Series */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
              <Tv className="h-3.5 w-3.5 text-neutral-400" />
              <span>1. Select TV Series</span>
            </label>

            {selectedShow ? (
              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 transition-colors">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow">
                    {selectedShow.posterUrl || selectedShow.posterPath ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={selectedShow.posterUrl || selectedShow.posterPath || ""}
                        alt={selectedShow.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-600">
                        <Film className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-neutral-200 border border-neutral-800">
                        TV SERIES
                      </span>
                      <h3 className="text-sm font-bold text-white truncate">{selectedShow.title}</h3>
                    </div>
                    <p className="text-xs text-neutral-400 font-mono">
                      {selectedShow.releaseYear ? `Original Premiere: ${selectedShow.releaseYear}` : "Television Run"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(8);
                    setSelectedShow(null);
                    setPreviewResult(null);
                  }}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/80 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-700 hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  Change Show
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any show (e.g. Friends, Seinfeld, Buffy)..."
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900/80 pl-9 pr-4 py-2.5 sm:py-2 text-base sm:text-xs font-mono text-white placeholder-neutral-500 focus:border-neutral-600 focus:bg-black focus:outline-none"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-neutral-400" />
                  )}
                </div>

                {/* Search Dropdown */}
                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 divide-y divide-neutral-850 shadow-2xl no-scrollbar">
                    {searchResults.map((item) => (
                      <button
                        key={item.tmdbId}
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setSelectedShow(item);
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                        className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-neutral-900 cursor-pointer"
                      >
                        <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-neutral-900 border border-neutral-800">
                          {item.posterPath && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={item.posterPath} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{item.title}</p>
                          <p className="text-[10px] text-neutral-400 font-mono">
                            {item.releaseYear ? `${item.releaseYear} • ` : ""}TV Series
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Classic Suggestions Carousel */}
                <div className="space-y-1.5 pt-0.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500">
                    Iconic Television Classics:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CLASSIC_SHOW_SUGGESTIONS.map((s) => (
                      <button
                        key={s.tmdbId}
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setSelectedShow({
                            tmdbId: s.tmdbId,
                            mediaType: "tv",
                            title: s.title,
                            releaseYear: s.years.slice(0, 4),
                            posterPath: s.poster,
                            posterUrl: s.poster,
                            backdropUrl: null,
                            overview: "",
                            voteAverage: 8.8,
                          });
                        }}
                        className="flex items-center gap-2 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-2 text-left hover:border-neutral-700 hover:bg-neutral-850/50 transition-all cursor-pointer group"
                      >
                        <div className="h-11 w-8 shrink-0 overflow-hidden rounded-md bg-neutral-900 border border-neutral-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.poster} alt={s.title} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-bold text-neutral-200 group-hover:text-white truncate">
                            {s.title}
                          </p>
                          <p className="text-[9px] font-mono text-neutral-400 truncate">{s.network}</p>
                          <p className="text-[9px] text-neutral-500 truncate">{s.seasons}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Appointment Configuration */}
          <div className="space-y-4 border-t border-neutral-900 pt-4">
            {/* Air Day Selection */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                  <CalendarDays className="h-3.5 w-3.5 text-neutral-400" />
                  <span>2. Weekly Airing Day ({dayObj?.name || "Thursday"})</span>
                </label>

                {/* Preset quick jumps */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 touch-pan-x">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setTargetDayOfWeek(4);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-[10px] sm:text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                      targetDayOfWeek === 4
                        ? "border-neutral-700 bg-neutral-800 text-white shadow-sm font-bold"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    Must-See Thu
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setTargetDayOfWeek(5);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-[10px] sm:text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                      targetDayOfWeek === 5
                        ? "border-neutral-700 bg-neutral-800 text-white shadow-sm font-bold"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    TGIF Fri
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setTargetDayOfWeek(0);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-[10px] sm:text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                      targetDayOfWeek === 0
                        ? "border-neutral-700 bg-neutral-800 text-white shadow-sm font-bold"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    Sunday Prime
                  </button>
                </div>
              </div>

              {/* Day Pills matching ScheduleBroadcastModal */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {DAYS_OF_WEEK.map((d) => {
                  const isSelected = targetDayOfWeek === d.day;
                  return (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => {
                        triggerHaptic(10);
                        setTargetDayOfWeek(d.day);
                      }}
                      title={d.name}
                      className={`flex flex-col items-center justify-center rounded-xl py-2.5 sm:py-2 px-0.5 sm:px-1 min-h-[44px] sm:min-h-[38px] text-center transition-all cursor-pointer active:scale-95 ${
                        isSelected
                          ? "border border-neutral-600 bg-neutral-800 text-white font-bold shadow-md ring-1 ring-neutral-700"
                          : "border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      <span className="font-mono text-xs">{d.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Air Time Selection with Segmented AM / PM Switch & Half-Hour Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                  <Clock className="h-3.5 w-3.5 text-neutral-400" />
                  <span>3. Air Time Slot ({formattedSelectedTime})</span>
                </label>

                {/* AM / PM Segmented Switch */}
                <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setMeridiem("AM");
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      meridiem === "AM"
                        ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    <Sun className="h-3 w-3" />
                    <span>AM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setMeridiem("PM");
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      meridiem === "PM"
                        ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    <Moon className="h-3 w-3" />
                    <span>PM</span>
                  </button>
                </div>
              </div>

              {/* Time Slot Matrix matching ScheduleBroadcastModal */}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[130px] overflow-y-auto no-scrollbar rounded-xl border border-neutral-800 bg-neutral-950 p-2">
                {HALF_DAY_SLOTS.map((slot, index) => {
                  const isSelected = selectedSlotIndex === index;
                  return (
                    <button
                      key={`${slot.label}-${meridiem}`}
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        setSelectedSlotIndex(index);
                      }}
                      className={`relative rounded-lg px-1.5 py-1 font-mono text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? "border border-neutral-600 bg-neutral-800 text-white font-bold ring-1 ring-neutral-700 shadow-md"
                          : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      <span>{slot.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Launch Year Selector with Custom Vintage Dropdown */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                <Layers className="h-3.5 w-3.5 text-neutral-400" />
                <span>4. Season 1 Launch Year</span>
              </label>

              <RetroYearDropdown
                value={startYear}
                onChange={setStartYear}
                options={startYearOptions}
              />
            </div>

            {/* Calculate Button */}
            {selectedShow && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleGeneratePreview}
                  disabled={isPreviewLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-white py-2.5 text-xs font-bold uppercase tracking-wider shadow transition-all cursor-pointer disabled:opacity-40 active:scale-95"
                >
                  {isPreviewLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
                      <span>Scanning Historical Broadcast Weeks...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      <span>Preview Multi-Year Broadcast Roadmap</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Interactive Multi-Year Timeline Preview */}
          {previewResult && (
            <div className="space-y-3.5 border-t border-neutral-900 pt-4 animate-in fade-in duration-200">
              {/* Timeline Header Badge */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200">
                      <CalendarCheck2 className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Affiliate Lineup Matrix
                    </h3>
                  </div>
                  <span className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-300">
                    {previewResult.totalSeasons} Seasons · {previewResult.totalEpisodes} Episodes
                  </span>
                </div>

                <p className="text-xs text-neutral-400 font-mono">
                  Broadcasting every{" "}
                  <span className="text-white font-bold">{dayObj?.name} at {formattedSelectedTime}</span>{" "}
                  from <span className="text-white font-semibold">{previewResult.firstAirDate}</span> through{" "}
                  <span className="text-white font-semibold">{previewResult.lastAirDate}</span>.
                </p>
              </div>

              {/* Seasons Accordion List */}
              <div className="space-y-2">
                {previewResult.seasons.map((season) => {
                  const isExpanded = expandedSeason === season.seasonNumber;
                  const override = seasonOverrides[season.seasonNumber];

                  return (
                    <div
                      key={season.seasonNumber}
                      className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 overflow-hidden transition-colors hover:border-neutral-700"
                    >
                      {/* Season Card Header */}
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(6);
                          setExpandedSeason(isExpanded ? null : season.seasonNumber);
                        }}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-850/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800 font-mono text-xs font-bold text-neutral-200 border border-neutral-700">
                            S{String(season.seasonNumber).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-white truncate">{season.seasonName}</h4>
                              <span className="rounded bg-neutral-800 px-1.5 py-0.2 font-mono text-[9px] text-neutral-400">
                                {season.episodeCount} eps
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 font-mono">
                              {season.projectedStartDate} ➔ {season.projectedEndDate}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Thematic Milestone Badges */}
                          <div className="flex items-center gap-1 max-w-[110px] sm:max-w-none overflow-x-auto no-scrollbar py-0.5">
                            {season.milestones.slice(0, 3).map((badge, bIdx) => {
                              const isThanksgiving = badge.includes("Thanksgiving");
                              const isHoliday = badge.includes("Holiday");
                              const isHalloween = badge.includes("Halloween");
                              const isValentine = badge.includes("Valentine");

                              const badgeColor = isThanksgiving
                                ? "border-amber-700/50 bg-amber-950/40 text-amber-300"
                                : isHoliday
                                  ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
                                  : isHalloween
                                    ? "border-orange-700/50 bg-orange-950/40 text-orange-300"
                                    : isValentine
                                      ? "border-pink-700/50 bg-pink-950/40 text-pink-300"
                                      : "border-neutral-800 bg-neutral-900 text-neutral-300";

                              return (
                                <span
                                  key={bIdx}
                                  className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-medium shrink-0 whitespace-nowrap ${badgeColor}`}
                                >
                                  {badge}
                                </span>
                              );
                            })}
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Episodes Preview */}
                      {isExpanded && (
                        <div className="border-t border-neutral-800/70 p-3 space-y-3 bg-neutral-950/80">
                          {/* Custom Launch Date Override */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800">
                            <span className="text-neutral-400 font-mono text-[11px]">
                              Custom Season Launch Date (optional):
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={override?.customStartDate || season.projectedStartDate}
                                onChange={(e) => {
                                  setSeasonOverrides((prev) => ({
                                    ...prev,
                                    [season.seasonNumber]: { customStartDate: e.target.value },
                                  }));
                                }}
                                className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 font-mono text-base sm:text-xs text-white focus:border-neutral-600 focus:outline-none cursor-pointer min-h-[36px]"
                              />
                              {override?.customStartDate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSeasonOverrides((prev) => {
                                      const next = { ...prev };
                                      delete next[season.seasonNumber];
                                      return next;
                                    });
                                  }}
                                  className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer p-1"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Episode Mini-List */}
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-neutral-900/60 no-scrollbar touch-pan-y">
                            {season.episodes.map((ep) => (
                              <div
                                key={ep.episodeNumber}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 pt-2 pb-1 text-xs text-neutral-300"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[10px] font-bold text-neutral-500 shrink-0">
                                    E{String(ep.episodeNumber).padStart(2, "0")}
                                  </span>
                                  <span className="truncate">{ep.episodeTitle}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] pl-6 sm:pl-0 flex-wrap">
                                  {ep.milestoneBadge && (
                                    <span className="text-[9px] font-sans text-neutral-300 bg-neutral-900 border border-neutral-800 px-1.5 py-0.2 rounded shrink-0">
                                      {ep.milestoneBadge}
                                    </span>
                                  )}
                                  <span className="text-neutral-400 shrink-0">{ep.scheduledDate}</span>
                                  <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                                    {formatBlockTime(ep.blockStartMinutes)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <footer className="sticky bottom-0 z-30 shrink-0 flex items-center justify-between gap-3 border-t border-neutral-900 bg-neutral-950/95 px-4 sm:px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              onClose();
            }}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 sm:py-2 text-xs font-semibold text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer min-h-[42px] sm:min-h-[36px] active:scale-95"
          >
            Cancel
          </button>

          {previewResult ? (
            <button
              type="button"
              onClick={handleCommitSchedule}
              disabled={isCommitting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-neutral-200 text-black px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-40 min-h-[42px] sm:min-h-[36px]"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                  <span>Locking In Lineup...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-black stroke-[2.5]" />
                  <span className="truncate">Lock In Multi-Year Broadcast</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={!selectedShow || isPreviewLoading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-neutral-200 text-black px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 disabled:opacity-40 cursor-pointer transition-all min-h-[42px] sm:min-h-[36px]"
            >
              {isPreviewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-black" />
              ) : (
                <Sparkles className="h-4 w-4 text-black" />
              )}
              <span>Calculate Timeline</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
