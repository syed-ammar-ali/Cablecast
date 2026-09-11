"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Calendar as CalendarIcon,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Film,
} from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import { BLOCK_MINUTES, normalizeRuntime } from "@/lib/runtime";
import { formatBlockTime } from "@/types/broadcast";
import { notifyBroadcastMutation } from "@/lib/syncEvents";
import { useToast } from "@/components/ui/ToastProvider";

interface CalendarSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaSearchResult;
  initialDate?: string; // "YYYY-MM-DD"
  initialSeason?: number;
  initialEpisode?: number;
  onScheduled?: () => void;
}

const HALF_HOUR_SLOTS = [
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

function getSafePosterUrl(posterPath?: string | null, posterUrl?: string | null): string | null {
  if (posterUrl && (posterUrl.startsWith("http://") || posterUrl.startsWith("https://"))) {
    return posterUrl;
  }
  const path = posterPath || posterUrl;
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `https://image.tmdb.org/t/p/w185${clean}`;
}

export function CalendarSchedulerModal({
  isOpen,
  onClose,
  media,
  initialDate,
  initialSeason = 1,
  initialEpisode = 1,
  onScheduled,
}: CalendarSchedulerModalProps) {
  const { toast } = useToast();
  const isTv = media.mediaType === "tv";

  // Today's date in YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const [scheduledDate, setScheduledDate] = useState<string>(initialDate || todayStr);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(18); // Default 9:00 PM
  const [startSeason, setStartSeason] = useState<number>(initialSeason || 1);
  const [startEpisode, setStartEpisode] = useState<number>(initialEpisode || 1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Time math
  const slot = HALF_HOUR_SLOTS[selectedSlotIndex] || HALF_HOUR_SLOTS[0];
  const blockStartMinutes = toMinutesFromMidnight(slot.hour12, slot.minute, meridiem);
  const defaultRuntime = isTv ? 30 : 120;
  const normRuntime = normalizeRuntime(defaultRuntime);
  const blockCount = normRuntime.blockCount;
  const requestedEndMinutes = blockStartMinutes + blockCount * BLOCK_MINUTES;

  // Next 14 days quick jump pills
  const horizonDays = useMemo(() => {
    const days: { dateStr: string; label: string; dayName: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      let label = "";
      if (i === 0) label = "Today";
      else if (i === 1) label = "Tomorrow";
      else label = d.toLocaleDateString([], { month: "short", day: "numeric" });

      const dayName = d.toLocaleDateString([], { weekday: "short" });
      days.push({ dateStr, label, dayName });
    }
    return days;
  }, []);

  // Check for conflicts whenever date or time changes
  useEffect(() => {
    let cancelled = false;

    async function checkConflict() {
      try {
        const res = await fetch("/api/broadcast/personal");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.schedule) return;

        const [year, month, day] = scheduledDate.split("-").map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();

        const conflict = data.schedule.find((app: any) => {
          if (app.dayOfWeek !== dayOfWeek) return false;
          const appEnd = app.blockStartMinutes + app.blockCount * BLOCK_MINUTES;
          return blockStartMinutes < appEnd && requestedEndMinutes > app.blockStartMinutes;
        });

        if (conflict) {
          setConflictWarning(
            `Soft Warning: Overrides regular weekly broadcast "${conflict.title}" at ${formatBlockTime(
              conflict.blockStartMinutes,
            )}. Overridden airing will be placed into your Missed & Reruns tab automatically.`,
          );
        } else {
          setConflictWarning(null);
        }
      } catch {
        // ignore
      }
    }

    if (isOpen) {
      checkConflict();
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, scheduledDate, blockStartMinutes, requestedEndMinutes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: media.tmdbId,
          mediaType: media.mediaType,
          title: media.title,
          posterPath: media.posterPath || null,
          backdropUrl: media.backdropUrl || null,
          runtimeMinutes: defaultRuntime,
          scheduledDate,
          blockStartMinutes,
          startSeason: isTv ? startSeason : undefined,
          startEpisode: isTv ? startEpisode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule calendar entry.");

      notifyBroadcastMutation();
      toast.success(
        `Scheduled for ${scheduledDate} at ${formatBlockTime(blockStartMinutes)}!`,
        "Calendar Appointment Booked",
      );

      onScheduled?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Scheduling error", "Booking Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl border-0 sm:border border-neutral-800 bg-neutral-950 px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black overflow-y-auto no-scrollbar overscroll-contain flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3 sm:pb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-purple-400" />
            <h3 className="text-base font-bold text-white">Schedule to Date</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Media Preview Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3 my-3 sm:my-4">
          <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-800 border border-neutral-700/60">
            {(() => {
              const poster = getSafePosterUrl(media.posterPath, media.posterUrl);
              return poster ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={poster} alt={media.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Film className="h-4 w-4 text-neutral-600" />
                </div>
              );
            })()}
          </div>
          <div className="space-y-0.5 min-w-0">
            <h4 className="text-sm font-bold text-white truncate">{media.title}</h4>
            <p className="text-xs text-neutral-400">
              {isTv
                ? `TV Series · Starting S${startSeason} · E${startEpisode}`
                : `Feature Presentation · ${defaultRuntime} minutes`}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          {/* 1. Date Selection Horizon */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                1. Select Calendar Date
              </label>
              <input
                type="date"
                min={todayStr}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-base sm:text-xs font-mono font-bold text-white focus:outline-none focus:border-purple-500/60 min-h-[36px]"
              />
            </div>

            {/* Quick date jump pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 touch-pan-x">
              {horizonDays.map((d) => {
                const isSelected = scheduledDate === d.dateStr;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => setScheduledDate(d.dateStr)}
                    className={`flex flex-col items-center justify-center shrink-0 rounded-xl px-3 py-1.5 text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                        : "border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    <span className="font-mono text-[10px] uppercase">{d.dayName}</span>
                    <span className="text-xs">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Time Slot Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                2. Air Time Slot
              </label>
              {/* AM / PM switcher */}
              <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
                <button
                  type="button"
                  onClick={() => setMeridiem("AM")}
                  className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded-md transition-all cursor-pointer ${
                    meridiem === "AM"
                      ? "bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setMeridiem("PM")}
                  className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded-md transition-all cursor-pointer ${
                    meridiem === "PM"
                      ? "bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  PM
                </button>
              </div>
            </div>

            {/* Half-hour slot grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {HALF_HOUR_SLOTS.map((s, idx) => {
                const isSelected = selectedSlotIndex === idx;
                return (
                  <button
                    key={`${s.label}-${meridiem}`}
                    type="button"
                    onClick={() => setSelectedSlotIndex(idx)}
                    className={`rounded-xl py-1.5 text-center font-mono text-xs transition-all cursor-pointer ${
                      isSelected
                        ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                        : "border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-[11px] font-mono text-neutral-400">
              <span>Airing Window: {formatBlockTime(blockStartMinutes)} – {formatBlockTime(requestedEndMinutes)}</span>
              <span>{blockCount * 30}m ({blockCount} slots)</span>
            </div>
          </div>

          {/* 3. Start From for TV Shows */}
          {isTv && (
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                  3. Start From
                </label>
                <span className="font-mono text-xs font-bold text-purple-300">
                  Season {startSeason} · Episode {startEpisode}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <span className="text-xs text-neutral-400 font-medium">Season</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={startSeason}
                    onChange={(e) => setStartSeason(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-transparent text-right font-mono text-base sm:text-sm font-bold text-white focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <span className="text-xs text-neutral-400 font-medium">Episode</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={startEpisode}
                    onChange={(e) => setStartEpisode(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-transparent text-right font-mono text-base sm:text-sm font-bold text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Soft Conflict Warning Notification */}
          {conflictWarning && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <p className="leading-relaxed">{conflictWarning}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white hover:border-purple-400 py-3 text-xs font-bold uppercase tracking-wider shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                  <span>Locking Slot...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-purple-400 stroke-[2.5]" />
                  <span>Confirm Calendar Airing</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
