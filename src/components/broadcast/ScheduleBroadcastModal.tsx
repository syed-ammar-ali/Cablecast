"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarCheck2,
  Clock,
  Key,
  Loader2,
  Moon,
  Radio,
  ShoppingBag,
  Sun,
  Tv,
} from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import type { PersonalScheduleItem } from "@/types/broadcast";
import { DAYS_OF_WEEK, formatBlockTime } from "@/types/broadcast";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { notifyLibraryMutation, notifyBroadcastMutation } from "@/lib/syncEvents";

interface ScheduleBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaSearchResult;
  initialSeason?: number;
  existingSchedule: PersonalScheduleItem[];
  onSchedule: (data: {
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    posterPath?: string | null;
    backdropUrl?: string | null;
    runtimeMinutes?: number | null;
    daysOfWeek: number[];
    blockStartMinutes: number;
    startSeason?: number;
    startEpisode?: number;
  }) => Promise<{ success: boolean; error?: string }>;
}

// 12-hour block slots (12:00, 12:30, 1:00, 1:30 ... 11:30)
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

interface UpcomingDay {
  dayOfWeek: number;
  name: string;
  short: string;
  relativeLabel: string;
  isToday: boolean;
  dateStr: string;
  date: Date;
  isBeyondRental: boolean;
}

function getUpcomingDays(
  now: Date,
  expiresAtDate: Date | null,
  isMovieRental: boolean,
): UpcomingDay[] {
  const days: UpcomingDay[] = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shortNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayOfWeek = d.getDay();
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

    let relativeLabel = "";
    if (i === 0) relativeLabel = "Today";
    else if (i === 1) relativeLabel = "Tomorrow";
    else relativeLabel = d.toLocaleDateString([], { month: "short", day: "numeric" });

    // For rented movies: check if the entire day is beyond the rental expiry
    const isBeyondRental = Boolean(
      isMovieRental && expiresAtDate && dayStart.getTime() >= expiresAtDate.getTime(),
    );

    days.push({
      dayOfWeek,
      name: dayNames[dayOfWeek],
      short: shortNames[dayOfWeek],
      relativeLabel,
      isToday: i === 0,
      dateStr: d.toLocaleDateString([], { month: "short", day: "numeric" }),
      date: d,
      isBeyondRental,
    });
  }
  return days;
}

function getSmartInitialSlot(now: Date = new Date()): {
  dayOfWeek: number;
  meridiem: "AM" | "PM";
  slotIndex: number;
} {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let nextSlotMinutes = Math.ceil((currentMinutes + 1) / 30) * 30;

  let dayOfWeek = now.getDay();
  if (nextSlotMinutes >= 24 * 60) {
    // Rolled over past 11:30 PM! Rollover to tomorrow 12:00 AM
    nextSlotMinutes = 0;
    dayOfWeek = (dayOfWeek + 1) % 7;
  }

  const isPM = nextSlotMinutes >= 12 * 60;
  const meridiem: "AM" | "PM" = isPM ? "PM" : "AM";
  const minutesInHalfDay = nextSlotMinutes % (12 * 60);

  const slotIndex = HALF_DAY_SLOTS.findIndex(
    (s) => toMinutesFromMidnight(s.hour12, s.minute, "AM") === minutesInHalfDay,
  );

  return {
    dayOfWeek,
    meridiem,
    slotIndex: slotIndex >= 0 ? slotIndex : 0,
  };
}

export function ScheduleBroadcastModal({
  isOpen,
  onClose,
  media,
  initialSeason = 1,
  existingSchedule,
  onSchedule,
}: ScheduleBroadcastModalProps) {
  const isTv = media.mediaType === "tv";
  const now = useMemo(() => new Date(), [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // VHS Ownership state
  const [ownership, setOwnership] = useState<{
    status: string;
    isOwned: boolean;
    isRented: boolean;
    expiresAt: string | null;
  } | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);

  const isOwned = Boolean(ownership?.isOwned);
  const isRented = Boolean(ownership?.isRented);

  const expiresDate = useMemo(() => {
    return isRented && ownership?.expiresAt ? new Date(ownership.expiresAt) : null;
  }, [isRented, ownership?.expiresAt]);

  // Initial smart slot & day selection
  const [selectedDays, setSelectedDays] = useState<number[]>([now.getDay()]);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(18);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Set smart default slot on modal open
  useEffect(() => {
    if (!isOpen) return;
    const initial = getSmartInitialSlot(new Date());
    setSelectedDays([initial.dayOfWeek]);
    setMeridiem(initial.meridiem);
    setSelectedSlotIndex(initial.slotIndex);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [isOpen]);

  // Fetch ownership on mount / props change
  useEffect(() => {
    if (!isOpen) return;
    const seasonQuery = isTv ? `&season=${initialSeason}` : "";
    fetch(`/api/vhs/action?mediaId=${media.tmdbId}${seasonQuery}`)
      .then((res) => res.json())
      .then((data) => {
        setOwnership(data);
      })
      .catch(() => {});
  }, [isOpen, media.tmdbId, isTv, initialSeason]);

  // Rolling 7 days for rented mode
  const upcomingDays = useMemo(() => {
    return getUpcomingDays(now, expiresDate, !isTv && isRented);
  }, [now, expiresDate, isTv, isRented]);

  const currentSlot = HALF_DAY_SLOTS[selectedSlotIndex] ?? HALF_DAY_SLOTS[18];
  const blockStartMinutes = toMinutesFromMidnight(currentSlot.hour12, currentSlot.minute, meridiem);

  // Runtime calculation (default movie = 120m, TV episode = 30m)
  const defaultRuntime = isTv ? 30 : 120;
  const blockCount = Math.max(1, Math.ceil(defaultRuntime / BLOCK_MINUTES));
  const requestedEndMinutes = blockStartMinutes + blockCount * BLOCK_MINUTES;

  // Preset match calculations for TV series
  const isDailyActive = isTv && selectedDays.length === 7;
  const isWeekdaysActive =
    isTv &&
    selectedDays.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d));
  const isWeekendsActive =
    isTv &&
    selectedDays.length === 2 &&
    [0, 6].every((d) => selectedDays.includes(d));

  // Current real-world minutes from midnight
  const currentMinutesToday = now.getHours() * 60 + now.getMinutes();

  // Helper to compute target air date for a selected day
  const getAirDateForDay = (dayOfWeek: number, minutes: number) => {
    const currentDay = now.getDay();
    let daysUntil = (dayOfWeek - currentDay + 7) % 7;
    if (daysUntil === 0 && currentMinutesToday >= minutes) {
      daysUntil = 7;
    }
    const airDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil);
    airDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return airDate;
  };

  // Slot conflict & expiration matrix
  const { occupiedSlots, pastSlots, expiredSlots } = useMemo(() => {
    const occupiedMap = new Map<number, string>(); // index -> occupying title
    const pastSet = new Set<number>(); // indices that have passed today
    const expiredSet = new Set<number>(); // indices beyond rental expiration

    const isTodaySelected = selectedDays.includes(now.getDay());

    HALF_DAY_SLOTS.forEach((slot, index) => {
      const slotStart = toMinutesFromMidnight(slot.hour12, slot.minute, meridiem);
      const slotEnd = slotStart + blockCount * BLOCK_MINUTES;

      // Check if slot has passed for Today (only for rented content where pass doesn't cover next week)
      if (!isOwned && isTodaySelected && selectedDays.length === 1 && slotStart <= currentMinutesToday) {
        pastSet.add(index);
      }

      // Check rental expiration for each selected day (only for rented content)
      if (expiresDate && !isOwned) {
        for (const day of selectedDays) {
          const airDate = getAirDateForDay(day, slotStart);
          const broadcastEndTime = new Date(airDate.getTime() + defaultRuntime * 60 * 1000);
          if (broadcastEndTime.getTime() > expiresDate.getTime()) {
            expiredSet.add(index);
            break;
          }
        }
      }

      // Check schedule overlaps
      for (const day of selectedDays) {
        const dayItems = existingSchedule.filter(
          (item) => item.dayOfWeek === day && item.tmdbId !== media.tmdbId,
        );
        for (const item of dayItems) {
          const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
          const overlaps = slotStart < itemEnd && slotEnd > item.blockStartMinutes;
          if (overlaps) {
            occupiedMap.set(index, item.title);
            break;
          }
        }
      }
    });

    return { occupiedSlots: occupiedMap, pastSlots: pastSet, expiredSlots: expiredSet };
  }, [meridiem, blockCount, selectedDays, existingSchedule, media.tmdbId, currentMinutesToday, now, expiresDate, isOwned, defaultRuntime]);

  // Real-time conflict checking for current selection
  const conflict = useMemo(() => {
    for (const day of selectedDays) {
      const dayItems = existingSchedule.filter(
        (item) => item.dayOfWeek === day && item.tmdbId !== media.tmdbId,
      );

      for (const item of dayItems) {
        const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
        const overlaps =
          blockStartMinutes < itemEnd && requestedEndMinutes > item.blockStartMinutes;

        if (overlaps) {
          const dayName = isOwned
            ? (DAYS_OF_WEEK.find((d) => d.day === day)?.name ?? `Day ${day}`)
            : (upcomingDays.find((d) => d.dayOfWeek === day)?.name ?? `Day ${day}`);
          return {
            dayName,
            title: item.title,
            timeStr: `${formatBlockTime(item.blockStartMinutes)} – ${formatBlockTime(itemEnd)}`,
          };
        }
      }
    }
    return null;
  }, [selectedDays, blockStartMinutes, requestedEndMinutes, existingSchedule, media.tmdbId, isOwned, upcomingDays]);

  // Rental expiration conflict check (only for rented items)
  const rentalExpirationConflict = useMemo(() => {
    if (isOwned || !expiresDate) return null;

    for (const day of selectedDays) {
      const airDate = getAirDateForDay(day, blockStartMinutes);
      const airEnd = new Date(airDate.getTime() + defaultRuntime * 60 * 1000);

      if (airEnd.getTime() > expiresDate.getTime()) {
        const dayItem = upcomingDays.find((d) => d.dayOfWeek === day);
        const dayName = dayItem ? `${dayItem.name} (${dayItem.relativeLabel})` : `Day ${day}`;
        return {
          dayName,
          airDate: airDate.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          expiresDate: expiresDate.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }
    }
    return null;
  }, [isOwned, expiresDate, selectedDays, blockStartMinutes, defaultRuntime, upcomingDays]);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    if (!isTv) {
      // Movies are strictly single-day screening events
      setSelectedDays([day]);
      setErrorMessage(null);
      return;
    }

    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day].sort((a, b) => a - b),
    );
    setErrorMessage(null);
  };

  const selectPreset = (preset: "weekdays" | "weekends" | "daily") => {
    if (preset === "weekdays") setSelectedDays([1, 2, 3, 4, 5]);
    if (preset === "weekends") setSelectedDays([0, 6]);
    if (preset === "daily") setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setErrorMessage(null);
  };

  const handleExtendRental = async () => {
    setIsRenewing(true);
    try {
      const res = await fetch("/api/vhs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RENT",
          mediaId: media.tmdbId,
          mediaType: media.mediaType,
          seasonNumber: isTv ? initialSeason : 0,
          durationHours: 48,
          meta: {
            title: media.title,
            posterPath: media.posterPath || null,
            backdropUrl: media.backdropUrl || null,
            releaseYear: media.releaseYear || null,
            overview: media.overview || null,
            voteAverage: media.voteAverage || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extend rental.");
      setOwnership({
        status: "RENTED",
        isOwned: false,
        isRented: true,
        expiresAt: data.expiresAt,
      });
      setErrorMessage(null);
      notifyLibraryMutation();
      notifyBroadcastMutation();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to renew rental.");
    } finally {
      setIsRenewing(false);
    }
  };

  const handleBuyTape = async () => {
    setIsRenewing(true);
    try {
      const res = await fetch("/api/vhs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BUY",
          mediaId: media.tmdbId,
          mediaType: media.mediaType,
          seasonNumber: isTv ? initialSeason : 0,
          meta: {
            title: media.title,
            posterPath: media.posterPath || null,
            backdropUrl: media.backdropUrl || null,
            releaseYear: media.releaseYear || null,
            overview: media.overview || null,
            voteAverage: media.voteAverage || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to purchase tape.");
      setOwnership({
        status: "OWNED",
        isOwned: true,
        isRented: false,
        expiresAt: null,
      });
      setErrorMessage(null);
      notifyLibraryMutation();
      notifyBroadcastMutation();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to purchase tape.");
    } finally {
      setIsRenewing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.length === 0) {
      setErrorMessage("Please select at least one day of the week.");
      return;
    }

    if (conflict) {
      setErrorMessage(
        `Conflict on ${conflict.dayName}: Overlaps with "${conflict.title}" (${conflict.timeStr}).`,
      );
      return;
    }

    if (rentalExpirationConflict) {
      setErrorMessage(
        `Rental duration guardrail: Tape rental expires (${rentalExpirationConflict.expiresDate}) before the scheduled broadcast on ${rentalExpirationConflict.dayName}. Extend rental or purchase to proceed.`,
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await onSchedule({
      tmdbId: media.tmdbId,
      mediaType: media.mediaType,
      title: media.title,
      posterPath:
        media.posterPath ??
        (media.posterUrl ? media.posterUrl.replace("https://image.tmdb.org/t/p/w780", "") : null),
      backdropUrl: media.backdropUrl,
      runtimeMinutes: defaultRuntime,
      daysOfWeek: selectedDays,
      blockStartMinutes,
      startSeason: isTv ? initialSeason : undefined,
      startEpisode: 1,
    });

    setIsSubmitting(false);

    if (res.success) {
      notifyBroadcastMutation();
      setSuccessMessage("Scheduled to your broadcast lineup!");
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 600);
    } else {
      setErrorMessage(res.error || "Failed to schedule broadcast.");
    }
  };

  const posterUrl = media.posterPath
    ? `https://image.tmdb.org/t/p/w185${media.posterPath}`
    : media.posterUrl;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-md select-none animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-broadcast-title"
      onClick={handleClose}
    >
      <div
        className="relative flex w-full max-w-lg flex-col max-h-[88vh] overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Header - Unified Breadcrumb & Title */}
        <header className="sticky top-0 z-20 shrink-0 border-b border-neutral-900 bg-neutral-950/95 px-5 pt-5 pb-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={handleClose}
                className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Back to Cablecast</span>
              </button>
              <span className="text-neutral-700 leading-none select-none">/</span>
              <span
                id="schedule-broadcast-title"
                className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate"
              >
                Schedule
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-neutral-900/60 pt-2 sm:border-t-0 sm:pt-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-purple-400 shadow">
                <Radio className="h-3 w-3" />
              </div>
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
                Broadcast Scheduler
              </h1>
            </div>
          </div>
        </header>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar">
          {/* Selected Show / Movie Preview Card */}
          <div className="flex items-center gap-3.5 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow">
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={posterUrl}
                  alt=""
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-600">
                  <Tv className="h-4 w-4" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-neutral-200 border border-neutral-800">
                  {media.mediaType.toUpperCase()}
                </span>

                {isTv && initialSeason && initialSeason > 0 ? (
                  <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-400 border border-neutral-800">
                    SEASON {initialSeason}
                  </span>
                ) : null}

                {ownership?.isOwned && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-950/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                    <Key className="h-2.5 w-2.5" />
                    Owned Vault
                  </span>
                )}

                {ownership?.isRented && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-950/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300">
                    <Clock className="h-2.5 w-2.5 text-amber-400" />
                    Rented Pass
                  </span>
                )}

                <h4 className="truncate text-sm font-bold text-white">{media.title}</h4>
              </div>

              <p className="text-xs text-neutral-400">
                {isTv
                  ? `Starting at Season ${initialSeason}, Episode 1`
                  : `Feature Presentation · ${defaultRuntime} minutes (Single Screening)`}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Days Selection: Owned (Station Layout) vs Rented (Rolling Horizon) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-300 font-mono">
                  <Calendar className="h-3.5 w-3.5 text-purple-400" />
                  <span>1. {isTv ? "Broadcast Days" : "Screening Day"}</span>
                </label>

                {/* Quick Presets for TV Series Only */}
                {isTv && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => selectPreset("daily")}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        isDailyActive
                          ? "border-purple-500/60 bg-purple-950 text-purple-200 shadow-sm"
                          : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      onClick={() => selectPreset("weekdays")}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        isWeekdaysActive
                          ? "border-purple-500/60 bg-purple-950 text-purple-200 shadow-sm"
                          : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      Weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => selectPreset("weekends")}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        isWeekendsActive
                          ? "border-purple-500/60 bg-purple-950 text-purple-200 shadow-sm"
                          : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      Weekends
                    </button>
                  </div>
                )}
              </div>

              {/* Day Grid: Owned vs Rented */}
              {isOwned ? (
                // Owned Mode: Clean timeless Sun-Sat grid
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map((d) => {
                    const isSelected = selectedDays.includes(d.day);
                    return (
                      <button
                        key={d.day}
                        type="button"
                        onClick={() => toggleDay(d.day)}
                        title={d.name}
                        className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition-all cursor-pointer ${
                          isSelected
                            ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 ring-1 ring-purple-500/30 shadow-md"
                            : "border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        <span className="font-mono text-xs font-bold">{d.short}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Rented Mode: 7 Days Chronological Horizon starting from Today
                <div className="grid grid-cols-7 gap-1.5">
                  {upcomingDays.map((d) => {
                    const isSelected = selectedDays.includes(d.dayOfWeek);
                    const isLocked = d.isBeyondRental;

                    return (
                      <button
                        key={`${d.dayOfWeek}-${d.relativeLabel}`}
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                          if (isLocked) return;
                          toggleDay(d.dayOfWeek);
                        }}
                        title={
                          isLocked
                            ? `Rental pass expires before this day (${ownership?.expiresAt ? new Date(ownership.expiresAt).toLocaleDateString() : ""})`
                            : d.name
                        }
                        className={`flex flex-col items-center justify-center rounded-xl py-1.5 px-1 text-center transition-all ${
                          isLocked
                            ? "cursor-not-allowed border border-neutral-900 bg-neutral-950/60 text-neutral-600 opacity-40"
                            : isSelected
                              ? "cursor-pointer border border-purple-500/60 bg-purple-950/80 text-purple-200 ring-1 ring-purple-500/30 shadow-md"
                              : "cursor-pointer border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        <span className="font-mono text-[11px] font-bold">{d.short}</span>
                        <span className="text-[8.5px] text-neutral-500 font-sans truncate max-w-full">
                          {d.relativeLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Air Time Selection with Segmented AM / PM Switch */}
            <div className="border-t border-neutral-900 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-300 font-mono">
                  <Clock className="h-3.5 w-3.5 text-purple-400" />
                  <span>2. Air Time ({formatBlockTime(blockStartMinutes)})</span>
                </label>

                {/* AM / PM Segmented Switch */}
                <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setMeridiem("AM")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
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
                    onClick={() => setMeridiem("PM")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
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

              {/* Time Slot Matrix (24 half-hour options) */}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[140px] overflow-y-auto no-scrollbar rounded-xl border border-neutral-800 bg-neutral-950 p-2">
                {HALF_DAY_SLOTS.map((slot, index) => {
                  const isSelected = selectedSlotIndex === index;
                  const occupiedBy = occupiedSlots.get(index);
                  const isOccupied = Boolean(occupiedBy);
                  const isPast = pastSlots.has(index);
                  const isExpired = expiredSlots.has(index);
                  const isDisabled = isOccupied || isPast || isExpired;

                  return (
                    <button
                      key={`${slot.label}-${meridiem}`}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        setSelectedSlotIndex(index);
                        setErrorMessage(null);
                      }}
                      title={
                        isOccupied
                          ? `Occupied by "${occupiedBy}"`
                          : isPast
                            ? "Time passed for today"
                            : isExpired
                              ? "Rental pass expires before this time"
                              : slot.label
                      }
                      className={`relative rounded-lg px-1.5 py-1 font-mono text-xs font-semibold transition-all ${
                        isOccupied
                          ? "cursor-not-allowed border border-neutral-900 bg-neutral-950/70 text-neutral-600 line-through opacity-40"
                          : isPast
                            ? "cursor-not-allowed border border-neutral-900/60 bg-neutral-950/50 text-neutral-600 opacity-40"
                            : isExpired
                              ? "cursor-not-allowed border border-amber-950/60 bg-amber-950/30 text-amber-700 opacity-40"
                              : isSelected
                                ? "cursor-pointer border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                                : "cursor-pointer border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      <span>{slot.label}</span>
                      {isOccupied && (
                        <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-red-500/60" />
                      )}
                      {isExpired && !isOccupied && (
                        <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-amber-500/60" />
                      )}
                      {isPast && !isOccupied && !isExpired && (
                        <span className="absolute top-1 right-1 text-[7px] text-neutral-600 font-sans uppercase">
                          •
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Window explainer */}
              <div className="flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-900/40 px-3 py-1.5 text-[11px] text-neutral-400 font-mono">
                <span>
                  Window: {formatBlockTime(blockStartMinutes)} – {formatBlockTime(requestedEndMinutes)}
                </span>
                <span>
                  {blockCount * 30}m ({blockCount} {blockCount === 1 ? "slot" : "slots"})
                </span>
              </div>
            </div>

            {/* Rental Duration Guardrail Alert (Only for rented items) */}
            {!isOwned && rentalExpirationConflict && (
              <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3.5 space-y-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-amber-300 uppercase tracking-wide">
                      Rental Duration Guardrail
                    </p>
                    <p className="text-neutral-300 leading-relaxed">
                      This VHS rental pass expires on <strong className="text-white">{rentalExpirationConflict.expiresDate}</strong>, which is before the scheduled airing on <strong className="text-white">{rentalExpirationConflict.dayName} ({rentalExpirationConflict.airDate})</strong>.
                    </p>
                  </div>
                </div>

                {/* Instant Renewal Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isRenewing}
                    onClick={handleExtendRental}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/10 py-2 px-2.5 text-xs font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isRenewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                    <span>+48H Extend</span>
                  </button>

                  <button
                    type="button"
                    disabled={isRenewing}
                    onClick={handleBuyTape}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 px-2.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isRenewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingBag className="h-3 w-3" />}
                    <span>Buy Tape</span>
                  </button>
                </div>
              </div>
            )}

            {/* Conflict warning box */}
            {conflict && (
              <div className="flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <span>
                  <strong>Slot Conflict:</strong> Overlaps with &quot;{conflict.title}&quot; ({conflict.timeStr}) on {conflict.dayName}.
                </span>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-3 text-xs text-emerald-400">
                <CalendarCheck2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || Boolean(conflict) || (!isOwned && Boolean(rentalExpirationConflict))}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 px-4 py-3 text-xs font-bold uppercase tracking-wider text-purple-200 shadow-lg transition-all hover:border-purple-400 hover:text-white cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4 text-purple-400" />
                  Add to Broadcast
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
