"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Film,
  Layers,
  Loader2,
  Moon,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tv,
  X,
  Zap,
  Check,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  ShoppingBag,
  Bell,
} from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import type { PersonalScheduleItem } from "@/types/broadcast";
import { DAYS_OF_WEEK, formatBlockTime } from "@/types/broadcast";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { notifyBroadcastMutation, notifyLibraryMutation } from "@/lib/syncEvents";
import { useToast } from "@/components/ui/ToastProvider";
import { triggerHaptic } from "@/lib/haptics";
import { usePushNotifications } from "@/lib/usePushNotifications";
import type { NostalgiaScheduleResult, ScheduledSeasonPreview } from "@/lib/nostalgiaScheduler";

export type SchedulerMode = "weekly" | "screening" | "nostalgia";

export interface BroadcastSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  media?: MediaSearchResult | null;
  initialMode?: SchedulerMode;
  initialDate?: string;
  initialSeason?: number;
  initialEpisode?: number;
  existingSchedule?: PersonalScheduleItem[];
  onScheduled?: () => void;
  onSchedule?: (data: {
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    posterPath?: string | null;
    backdropUrl?: string | null;
    runtimeMinutes?: number | null;
    daysOfWeek: number[];
    blockStartMinutes: number;
    dailySlots?: number[];
    episodesPerDay?: number;
    timezoneOffset?: number;
    startSeason?: number;
    startEpisode?: number;
    totalEpisodes?: number;
    autoShiftOnConflict?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
}

// 12-hour block slots (12:00, 12:30, 1:00 ... 11:30)
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

function fromMinutesToSlot(minutes: number): { slotIndex: number; meridiem: "AM" | "PM" } {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const isPM = norm >= 720;
  const meridiem: "AM" | "PM" = isPM ? "PM" : "AM";
  const hour24 = Math.floor(norm / 60);
  const min = norm % 60;
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const slotIndex = HALF_DAY_SLOTS.findIndex(
    (s) => s.hour12 === hour12 && s.minute === (min >= 30 ? 30 : 0),
  );
  return { slotIndex: slotIndex !== -1 ? slotIndex : 0, meridiem };
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
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 px-3.5 py-2 text-left text-xs font-mono font-bold text-neutral-200 transition-colors hover:border-neutral-700 focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[40px]"
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="text-white">{selected.year}</span>
          <span className="text-neutral-500 text-[11px] font-sans truncate">• {selected.label}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-purple-300" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 p-1 backdrop-blur-xl shadow-2xl shadow-black animate-in fade-in zoom-in-95 duration-150">
          {options.map((opt) => {
            const isSelected = opt.year === value;
            return (
              <button
                key={opt.year}
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  onChange(opt.year);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-mono transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-purple-950/70 text-purple-200 font-bold border border-purple-500/40"
                    : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className={isSelected ? "text-white" : ""}>{opt.year}</span>
                  <span className="text-neutral-500 text-[11px] font-sans truncate">• {opt.label}</span>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase ${
                    isSelected
                      ? "bg-purple-900/60 text-purple-300"
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

export function BroadcastSchedulerModal({
  isOpen,
  onClose,
  media: initialMedia,
  initialMode = "weekly",
  initialDate,
  initialSeason = 1,
  initialEpisode = 1,
  existingSchedule = [],
  onScheduled,
  onSchedule,
}: BroadcastSchedulerModalProps) {
  const { toast } = useToast();
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Today in YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  // Mode state
  const [mode, setMode] = useState<SchedulerMode>(initialMode);
  const [selectedMedia, setSelectedMedia] = useState<MediaSearchResult | null>(initialMedia || null);
  const [isChangingMedia, setIsChangingMedia] = useState(false);

  // Search state (if no media provided)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // General show metadata & seasons
  const isTv = selectedMedia?.mediaType === "tv";
  const [availableSeasons, setAvailableSeasons] = useState<
    Array<{ seasonNumber: number; name: string; episodeCount: number; airDate: string | null }>
  >([]);
  const [mediaRuntime, setMediaRuntime] = useState<number | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // VHS Ownership state
  const [ownedSeasons, setOwnedSeasons] = useState<number[]>([]);
  const [isPurchasingSeason, setIsPurchasingSeason] = useState<number | null>(null);

  // Common time configuration
  const now = useMemo(() => new Date(), [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedDays, setSelectedDays] = useState<number[]>([now.getDay()]);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(17); // 8:30 PM default
  const [startSeason, setStartSeason] = useState<number>(initialSeason || 1);
  const [startEpisode, setStartEpisode] = useState<number>(initialEpisode || 1);

  // Multi-episode per day (TV)
  const [episodesPerDay, setEpisodesPerDay] = useState<1 | 2 | 3>(1);
  const [activeSlotEditing, setActiveSlotEditing] = useState<number>(0);
  const [slot2Index, setSlot2Index] = useState<number>(18); // 9:00 PM default
  const [slot2Meridiem, setSlot2Meridiem] = useState<"AM" | "PM">("PM");
  const [slot3Index, setSlot3Index] = useState<number>(19); // 9:30 PM default
  const [slot3Meridiem, setSlot3Meridiem] = useState<"AM" | "PM">("PM");

  // Screening mode state
  const [screeningDate, setScreeningDate] = useState<string>(initialDate || todayStr);

  // Nostalgia mode state
  const [startYear, setStartYear] = useState<number>(currentYear);
  const [endSeason, setEndSeason] = useState<number | null>(null);
  const [excludedSeasons, setExcludedSeasons] = useState<number[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<NostalgiaScheduleResult | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(1);
  const [seasonOverrides, setSeasonOverrides] = useState<Record<number, { customStartDate?: string }>>({});

  // Commit / Submission state
  const [isCommitting, setIsCommitting] = useState(false);

  // Notification reminder toggle for weekly mode
  const { isSupported: isPushSupported, isSubscribed, needsHomeScreenInstall, subscribe } =
    usePushNotifications();
  const [enableReminder, setEnableReminder] = useState(true);

  // Reset & sync props when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialMedia) {
        setSelectedMedia(initialMedia);
        setIsChangingMedia(false);
      }
      setMode(initialMode);
      if (initialSeason) setStartSeason(initialSeason);
      if (initialEpisode) setStartEpisode(initialEpisode);
      if (initialDate) setScreeningDate(initialDate);
      setMediaRuntime(null);
      setPreviewResult(null);
      setSeasonOverrides({});
    }
  }, [isOpen, initialMedia, initialMode, initialSeason, initialEpisode, initialDate]);

  // Lock document body scroll when modal is open to eliminate background rubber-banding
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Adjust mode if movie is selected (movie cannot do nostalgia run)
  useEffect(() => {
    if (selectedMedia && selectedMedia.mediaType !== "tv" && mode === "nostalgia") {
      setMode("screening");
    }
  }, [selectedMedia, mode]);

  // Fetch show details, runtime & seasons
  useEffect(() => {
    if (!selectedMedia?.tmdbId) {
      setAvailableSeasons([]);
      setMediaRuntime(null);
      return;
    }

    let isMounted = true;
    setIsLoadingDetails(true);

    fetch(`/api/tmdb/details?tmdbId=${selectedMedia.tmdbId}&mediaType=${selectedMedia.mediaType}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data?.defaultRuntime?.exactMinutes) {
          setMediaRuntime(data.defaultRuntime.exactMinutes);
        }
        if (Array.isArray(data?.seasons)) {
          const valid = data.seasons
            .filter((s: { seasonNumber: number }) => s.seasonNumber > 0)
            .map((s: { seasonNumber: number; name: string; episodeCount: number; airDate: string | null }) => ({
              seasonNumber: s.seasonNumber,
              name: s.name || `Season ${s.seasonNumber}`,
              episodeCount: s.episodeCount || 0,
              airDate: s.airDate || null,
            }))
            .sort((a: { seasonNumber: number }, b: { seasonNumber: number }) => a.seasonNumber - b.seasonNumber);
          setAvailableSeasons(valid);
          if (valid.length > 0 && !valid.some((s: { seasonNumber: number }) => s.seasonNumber === startSeason)) {
            setStartSeason(valid[0].seasonNumber);
          }
        }
      })
      .catch((err) => {
        console.warn("[BroadcastSchedulerModal] Failed loading show details:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMedia?.tmdbId, selectedMedia?.mediaType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Vault Tape Ownership
  const refreshOwnership = useCallback(async () => {
    if (!selectedMedia?.tmdbId) {
      setOwnedSeasons([]);
      return;
    }
    try {
      const res = await fetch(`/api/vhs/action?mediaId=${selectedMedia.tmdbId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.ownedSeasons)) {
          setOwnedSeasons(data.ownedSeasons);
        } else if (data?.isOwned) {
          setOwnedSeasons([0]);
        } else {
          setOwnedSeasons([]);
        }
      }
    } catch {
      // ignore
    }
  }, [selectedMedia?.tmdbId]);

  useEffect(() => {
    if (isOpen && selectedMedia?.tmdbId) {
      void refreshOwnership();
    }
  }, [isOpen, selectedMedia?.tmdbId, refreshOwnership]);

  // Buy Season Tape action
  const handleBuySeasonTape = async (seasonNum: number): Promise<boolean> => {
    if (!selectedMedia) return false;
    setIsPurchasingSeason(seasonNum);
    triggerHaptic(12);

    try {
      const res = await fetch("/api/vhs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BUY",
          mediaId: selectedMedia.tmdbId,
          mediaType: selectedMedia.mediaType,
          seasonNumber: seasonNum,
          meta: {
            title: selectedMedia.title,
            posterPath: selectedMedia.posterPath,
            backdropUrl: selectedMedia.backdropUrl,
            releaseYear: selectedMedia.releaseYear,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to acquire tape.");
      }

      setOwnedSeasons((prev) => Array.from(new Set([...prev, seasonNum])));
      notifyLibraryMutation();
      notifyBroadcastMutation();
      toast.success(
        `Acquired Season ${seasonNum} Master Tape into your vault!`,
        "Tape In Vault",
      );
      return true;
    } catch (err) {
      toast.error((err as Error).message || "Purchase failed", "Vault Error");
      return false;
    } finally {
      setIsPurchasingSeason(null);
    }
  };

  // Search input handler
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          const raw = Array.isArray(data) ? data : data?.results || [];
          setSearchResults(raw);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Season-specific runtime resolver: ensures accurate episode length per season
  useEffect(() => {
    if (!isTv || !selectedMedia?.tmdbId || !startSeason) return;

    let isMounted = true;
    fetch(`/api/tmdb/season?tmdbId=${selectedMedia.tmdbId}&season=${startSeason}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
        const runtimes = episodes
          .map((ep: { runtime?: { exactMinutes?: number } | number | null }) => {
            if (typeof ep.runtime === "number") return ep.runtime;
            if (ep.runtime && typeof ep.runtime.exactMinutes === "number") return ep.runtime.exactMinutes;
            return null;
          })
          .filter((r: number | null): r is number => typeof r === "number" && r > 0)
          .sort((a: number, b: number) => a - b);

        if (runtimes.length > 0) {
          const median = runtimes[Math.floor(runtimes.length / 2)];
          setMediaRuntime(median);
        }
      })
      .catch(() => {
        // ignore, keep show defaultRuntime
      });

    return () => {
      isMounted = false;
    };
  }, [isTv, selectedMedia?.tmdbId, startSeason]);

  const effectiveRuntime = useMemo(() => {
    if (mediaRuntime && mediaRuntime > 0) return mediaRuntime;
    if ((selectedMedia as { runtimeMinutes?: number })?.runtimeMinutes) {
      return (selectedMedia as { runtimeMinutes?: number }).runtimeMinutes!;
    }
    const genres = (selectedMedia as { genres?: string[] })?.genres ?? [];
    const isComedyOrAnim = genres.some((g) => {
      const gl = (g || "").toLowerCase();
      return gl.includes("comedy") || gl.includes("animation") || gl.includes("kids");
    });
    if (isTv) return isComedyOrAnim ? 22 : 25;
    return 120;
  }, [mediaRuntime, selectedMedia, isTv]);

  const effectiveBlockCount = useMemo(() => {
    return Math.max(1, Math.ceil(effectiveRuntime / BLOCK_MINUTES));
  }, [effectiveRuntime]);

  const selectedSeasonMeta = useMemo(() => {
    return availableSeasons.find((s) => s.seasonNumber === startSeason) || availableSeasons[0] || null;
  }, [availableSeasons, startSeason]);

  const selectedSeasonEpisodeCount = selectedSeasonMeta?.episodeCount || 0;

  // Time calculations
  const currentSlot = HALF_DAY_SLOTS[selectedSlotIndex] || HALF_DAY_SLOTS[17];
  const blockStartMinutes = toMinutesFromMidnight(currentSlot.hour12, currentSlot.minute, meridiem);

  const slot2Slot = HALF_DAY_SLOTS[slot2Index] || HALF_DAY_SLOTS[18];
  const slot2Minutes = toMinutesFromMidnight(slot2Slot.hour12, slot2Slot.minute, slot2Meridiem);

  const slot3Slot = HALF_DAY_SLOTS[slot3Index] || HALF_DAY_SLOTS[19];
  const slot3Minutes = toMinutesFromMidnight(slot3Slot.hour12, slot3Slot.minute, slot3Meridiem);

  const dailySlots = useMemo(() => {
    if (!isTv || episodesPerDay === 1) return [blockStartMinutes];
    if (episodesPerDay === 2) return [blockStartMinutes, slot2Minutes];
    return [blockStartMinutes, slot2Minutes, slot3Minutes];
  }, [isTv, episodesPerDay, blockStartMinutes, slot2Minutes, slot3Minutes]);

  const formattedSlot1Time = formatBlockTime(blockStartMinutes);
  const formattedSlot2Time = formatBlockTime(slot2Minutes);
  const formattedSlot3Time = formatBlockTime(slot3Minutes);

  const formattedDailyTimesSummary = useMemo(() => {
    if (!isTv || episodesPerDay === 1) return formattedSlot1Time;
    if (episodesPerDay === 2) return `${formattedSlot1Time} & ${formattedSlot2Time}`;
    return `${formattedSlot1Time}, ${formattedSlot2Time}, ${formattedSlot3Time}`;
  }, [isTv, episodesPerDay, formattedSlot1Time, formattedSlot2Time, formattedSlot3Time]);

  const handleSnapBackToBack = useCallback(() => {
    triggerHaptic(10);
    setPreviewResult(null);
    const blockDuration = effectiveBlockCount * BLOCK_MINUTES;
    const s2 = fromMinutesToSlot(blockStartMinutes + blockDuration);
    setSlot2Index(s2.slotIndex);
    setSlot2Meridiem(s2.meridiem);
    if (episodesPerDay === 3) {
      const s3 = fromMinutesToSlot(blockStartMinutes + blockDuration * 2);
      setSlot3Index(s3.slotIndex);
      setSlot3Meridiem(s3.meridiem);
    }
    toast.info("Time slots snapped consecutively back-to-back.", "Back-to-Back");
  }, [blockStartMinutes, episodesPerDay, effectiveBlockCount, toast]);

  const intraSlotOverlapError = useMemo(() => {
    if (!isTv || episodesPerDay === 1) return null;
    const blockDuration = effectiveBlockCount * BLOCK_MINUTES;
    if (episodesPerDay >= 2) {
      if (slot2Minutes < blockStartMinutes + blockDuration && slot2Minutes >= blockStartMinutes) {
        return `Episode 2 starts before Episode 1 finishes (${effectiveBlockCount * 30}m block). Space out times or snap back-to-back.`;
      }
      if (blockStartMinutes === slot2Minutes) {
        return "Episode 1 and Episode 2 cannot air at the exact same time.";
      }
      if (slot2Minutes < blockStartMinutes) {
        return "Episode 2 must air after Episode 1 in chronological order.";
      }
    }
    if (episodesPerDay === 3) {
      if (slot3Minutes < slot2Minutes + blockDuration && slot3Minutes >= slot2Minutes) {
        return `Episode 3 starts before Episode 2 finishes (${effectiveBlockCount * 30}m block). Space out times or snap back-to-back.`;
      }
      if (slot3Minutes === blockStartMinutes || slot3Minutes === slot2Minutes) {
        return "Episode 3 cannot air at the exact same time as an earlier episode.";
      }
      if (slot3Minutes < slot2Minutes) {
        return "Episode 3 must air after Episode 2 in chronological order.";
      }
    }
    return null;
  }, [isTv, episodesPerDay, blockStartMinutes, slot2Minutes, slot3Minutes, effectiveBlockCount]);

  // Conflict detection with existing weekly schedule
  const scheduleOverlapConflict = useMemo(() => {
    if (mode !== "weekly" || !selectedMedia || existingSchedule.length === 0) return null;

    const blockDuration = effectiveBlockCount * BLOCK_MINUTES;

    for (const day of selectedDays) {
      const daySchedules = existingSchedule.filter(
        (s) => s.dayOfWeek === day && s.tmdbId !== selectedMedia.tmdbId,
      );

      for (const scheduled of daySchedules) {
        const schedStart = scheduled.blockStartMinutes;
        const schedEnd = schedStart + scheduled.blockCount * BLOCK_MINUTES;

        // Check each planned episode slot
        for (let sIdx = 0; sIdx < dailySlots.length; sIdx++) {
          const plannedStart = dailySlots[sIdx];
          const plannedEnd = plannedStart + blockDuration;
          const isOverlap = plannedStart < schedEnd && plannedEnd > schedStart;
          if (isOverlap) {
            const dayName = DAYS_OF_WEEK.find((d) => d.day === day)?.short || "Day";
            return {
              message: `Conflicts with "${scheduled.title}" on ${dayName} at ${formatBlockTime(schedStart)}.`,
              conflictTitle: scheduled.title,
              conflictDay: day,
              conflictStart: schedStart,
              conflictEnd: schedEnd,
              slotIndex: sIdx,
            };
          }
        }
      }
    }
    return null;
  }, [mode, selectedMedia, existingSchedule, selectedDays, dailySlots, effectiveBlockCount]);

  const nextAvailableSlot = useMemo(() => {
    if (!scheduleOverlapConflict || mode !== "weekly") return null;
    const blockDuration = effectiveBlockCount * BLOCK_MINUTES;
    const day = scheduleOverlapConflict.conflictDay;
    const dayItems = existingSchedule
      .filter((s) => s.dayOfWeek === day && s.tmdbId !== selectedMedia?.tmdbId)
      .sort((a, b) => a.blockStartMinutes - b.blockStartMinutes);

    // Search forward from the end of conflicting show
    const searchFrom = Math.min(1440, scheduleOverlapConflict.conflictEnd);
    for (let m = searchFrom; m <= 1440 - blockDuration; m += BLOCK_MINUTES) {
      const end = m + blockDuration;
      const overlaps = dayItems.some((item) => {
        const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
        return m < itemEnd && end > item.blockStartMinutes;
      });
      if (!overlaps) return m;
    }

    // Wrap around to earlier in the day
    for (let m = 0; m < scheduleOverlapConflict.conflictStart; m += BLOCK_MINUTES) {
      if (m + blockDuration > 1440) break;
      const end = m + blockDuration;
      const overlaps = dayItems.some((item) => {
        const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
        return m < itemEnd && end > item.blockStartMinutes;
      });
      if (!overlaps) return m;
    }

    return null;
  }, [scheduleOverlapConflict, mode, effectiveBlockCount, existingSchedule, selectedMedia?.tmdbId]);

  const handleShiftToNextAvailable = useCallback(() => {
    if (nextAvailableSlot === null) return;
    triggerHaptic(12);
    const { slotIndex, meridiem: newMeridiem } = fromMinutesToSlot(nextAvailableSlot);
    setSelectedSlotIndex(slotIndex);
    setMeridiem(newMeridiem);
    if (episodesPerDay >= 2) {
      const blockDuration = effectiveBlockCount * BLOCK_MINUTES;
      const s2 = fromMinutesToSlot(nextAvailableSlot + blockDuration);
      setSlot2Index(s2.slotIndex);
      setSlot2Meridiem(s2.meridiem);
      if (episodesPerDay === 3) {
        const s3 = fromMinutesToSlot(nextAvailableSlot + blockDuration * 2);
        setSlot3Index(s3.slotIndex);
        setSlot3Meridiem(s3.meridiem);
      }
    }
    toast.success(
      `Shifted broadcast to next open slot: ${formatBlockTime(nextAvailableSlot)}`,
      "Slot Auto-Shifted",
    );
  }, [nextAvailableSlot, episodesPerDay, effectiveBlockCount, toast]);

  // Days toggling
  const toggleDay = useCallback((day: number) => {
    triggerHaptic(10);
    setPreviewResult(null);
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }, []);

  const selectedDaysSummary = useMemo(() => {
    if (selectedDays.length === 7) return "Daily";
    if (selectedDays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d))) return "Weekdays";
    if (selectedDays.length === 2 && [0, 6].every((d) => selectedDays.includes(d))) return "Weekends";
    return selectedDays
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAYS_OF_WEEK.find((item) => item.day === d)?.short)
      .filter(Boolean)
      .join(", ");
  }, [selectedDays]);

  // Nostalgia Scope
  const activeScopeSeasons = useMemo(() => {
    return availableSeasons.filter(
      (s) => s.seasonNumber >= startSeason && (endSeason === null || s.seasonNumber <= endSeason),
    );
  }, [availableSeasons, startSeason, endSeason]);

  const includedSeasonNumbers = useMemo(() => {
    if (activeScopeSeasons.length === 0) return [];
    return activeScopeSeasons
      .map((s) => s.seasonNumber)
      .filter((sNum) => !excludedSeasons.includes(sNum));
  }, [activeScopeSeasons, excludedSeasons]);

  const startYearOptions = useMemo(
    () => [
      { year: currentYear, label: "Autumn Premiere", badge: "This Year" },
      { year: currentYear + 1, label: "Next Broadcast Season Launch", badge: "Next Year" },
      { year: currentYear + 2, label: "Future Scheduled Series Run", badge: "+2 Years" },
      { year: currentYear + 3, label: "Long-Range Broadcast Schedule", badge: "+3 Years" },
    ],
    [currentYear],
  );

  // Generate Nostalgia Preview
  const handleGenerateNostalgiaPreview = useCallback(async () => {
    if (!selectedMedia) return;
    if (intraSlotOverlapError) {
      toast.error(intraSlotOverlapError, "Slot Overlap");
      return;
    }
    if (includedSeasonNumbers.length === 0) {
      toast.error("At least one season must be included in the broadcast run.", "Invalid Selection");
      return;
    }
    triggerHaptic(15);
    setIsPreviewLoading(true);

    try {
      const res = await fetch("/api/calendar/nostalgia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          tmdbId: selectedMedia.tmdbId,
          daysOfWeek: selectedDays,
          targetDayOfWeek: selectedDays[0] ?? 4,
          blockStartMinutes,
          dailySlots,
          episodesPerDay,
          startYear,
          startSeason,
          startEpisode,
          endSeason: endSeason ?? undefined,
          includedSeasonNumbers: includedSeasonNumbers.length > 0 ? includedSeasonNumbers : undefined,
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
  }, [
    selectedMedia,
    intraSlotOverlapError,
    includedSeasonNumbers,
    selectedDays,
    blockStartMinutes,
    dailySlots,
    episodesPerDay,
    startYear,
    startSeason,
    startEpisode,
    endSeason,
    seasonOverrides,
    toast,
  ]);

  // Toggle exclusion of a season directly from the roadmap and auto-recalculate
  const handleToggleExcludeFromRoadmap = useCallback(
    async (seasonNum: number) => {
      triggerHaptic(10);
      const isCurrentlyIncluded = includedSeasonNumbers.includes(seasonNum);
      const newExcluded = isCurrentlyIncluded
        ? [...excludedSeasons, seasonNum]
        : excludedSeasons.filter((s) => s !== seasonNum);
      setExcludedSeasons(newExcluded);

      const nextIncluded = availableSeasons
        .map((s) => s.seasonNumber)
        .filter((sNum) => {
          if (sNum < startSeason) return false;
          if (endSeason !== null && sNum > endSeason) return false;
          if (newExcluded.includes(sNum)) return false;
          return true;
        });

      if (nextIncluded.length === 0) {
        toast.error("Cannot exclude all seasons from the broadcast run.", "Invalid Selection");
        return;
      }

      if (!selectedMedia) return;
      setIsPreviewLoading(true);
      try {
        const res = await fetch("/api/calendar/nostalgia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            tmdbId: selectedMedia.tmdbId,
            daysOfWeek: selectedDays,
            targetDayOfWeek: selectedDays[0] ?? 4,
            blockStartMinutes,
            dailySlots,
            episodesPerDay,
            startYear,
            startSeason,
            startEpisode,
            endSeason: endSeason ?? undefined,
            includedSeasonNumbers: nextIncluded,
            seasonOverrides,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update roadmap.");
        setPreviewResult(data.preview);
      } catch (err) {
        toast.error((err as Error).message || "Failed to update roadmap", "Error");
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [
      includedSeasonNumbers,
      excludedSeasons,
      availableSeasons,
      startSeason,
      endSeason,
      startEpisode,
      selectedMedia,
      selectedDays,
      blockStartMinutes,
      dailySlots,
      episodesPerDay,
      startYear,
      seasonOverrides,
      toast,
    ],
  );

  // Final Commit Router
  const executeCommit = async () => {
    if (!selectedMedia) return;

    setIsCommitting(true);
    triggerHaptic(20);

    try {
      if (mode === "weekly") {
        if (scheduleOverlapConflict) {
          if (nextAvailableSlot !== null) {
            handleShiftToNextAvailable();
            toast.info(
              `Shifted from overlapping slot to ${formatBlockTime(nextAvailableSlot)}. Tap "Lock In" again to confirm booking.`,
              "Slot Auto-Shifted",
            );
            return;
          } else {
            toast.error(
              `Cannot schedule: overlaps with "${scheduleOverlapConflict.conflictTitle}". Please select another time or day.`,
              "Schedule Conflict",
            );
            return;
          }
        }

        const payload = {
          tmdbId: selectedMedia.tmdbId,
          mediaType: selectedMedia.mediaType as "movie" | "tv",
          title: selectedMedia.title,
          posterPath: selectedMedia.posterPath || null,
          backdropUrl: selectedMedia.backdropUrl || null,
          runtimeMinutes: effectiveRuntime,
          daysOfWeek: selectedDays,
          blockStartMinutes,
          dailySlots,
          episodesPerDay,
          startSeason: isTv ? startSeason : undefined,
          startEpisode: isTv ? startEpisode : undefined,
          totalEpisodes: isTv && selectedSeasonEpisodeCount > 0 ? selectedSeasonEpisodeCount : undefined,
          autoShiftOnConflict: true,
        };

        if (onSchedule) {
          const res = await onSchedule(payload);
          if (!res.success) throw new Error(res.error || "Failed to schedule broadcast.");
        } else {
          const res = await fetch("/api/broadcast/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to schedule broadcast.");
        }

        // Auto subscribe push notifications if enabled
        if (enableReminder && isPushSupported && !isSubscribed && !needsHomeScreenInstall) {
          try {
            await subscribe();
          } catch {
            // non-fatal
          }
        }

        notifyBroadcastMutation();
        toast.success(
          `"${selectedMedia.title}" scheduled every ${selectedDaysSummary} at ${formattedDailyTimesSummary}!`,
          "Broadcast Slotted",
        );
      } else if (mode === "screening") {
        const defaultRuntime = effectiveRuntime;
        const blockCount = effectiveBlockCount;

        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tmdbId: selectedMedia.tmdbId,
            mediaType: selectedMedia.mediaType,
            title: selectedMedia.title,
            posterPath: selectedMedia.posterPath || selectedMedia.posterUrl,
            backdropUrl: selectedMedia.backdropUrl,
            runtimeMinutes: defaultRuntime,
            scheduledDate: screeningDate,
            blockStartMinutes,
            blockCount,
            startSeason: isTv ? startSeason : 1,
            startEpisode: isTv ? startEpisode : 1,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to book calendar screening.");

        notifyBroadcastMutation();
        toast.success(
          `Screening booked for "${selectedMedia.title}" on ${screeningDate} at ${formattedSlot1Time}!`,
          "Screening Booked",
        );
      } else if (mode === "nostalgia") {
        if (!previewResult) {
          await handleGenerateNostalgiaPreview();
          return;
        }

        const res = await fetch("/api/calendar/nostalgia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "commit",
            tmdbId: selectedMedia.tmdbId,
            daysOfWeek: selectedDays,
            targetDayOfWeek: selectedDays[0] ?? 4,
            blockStartMinutes,
            dailySlots,
            episodesPerDay,
            startYear,
            startSeason,
            startEpisode,
            endSeason: endSeason ?? undefined,
            includedSeasonNumbers: includedSeasonNumbers.length > 0 ? includedSeasonNumbers : undefined,
            seasonOverrides,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to lock in nostalgia run.");

        notifyBroadcastMutation();
        toast.success(
          `Scheduled ${data.count} episodes for "${selectedMedia.title}" across ${previewResult.totalSeasons} years!`,
          "Nostalgia Run Activated",
        );
      }

      onScheduled?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Scheduling error", "Booking Failed");
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheduler-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-0 sm:p-4 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-neutral-800 bg-neutral-950 text-white shadow-2xl shadow-black animate-in zoom-in-95 duration-200 overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header: Breadcrumb & Mode Switcher */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-neutral-900 bg-neutral-950/95 px-4 sm:px-5 pt-4 pb-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  onClose();
                }}
                className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer min-h-[32px] py-1 active:scale-95"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Studio</span>
              </button>
              <span className="text-neutral-700 leading-none select-none">/</span>
              <span
                id="scheduler-modal-title"
                className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate"
              >
                Broadcast Programmer
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-900 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div className="flex items-center gap-1 rounded-xl bg-neutral-900/90 p-1 border border-neutral-800 text-xs font-mono font-bold">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(8);
                setMode("weekly");
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                mode === "weekly"
                  ? "bg-purple-950/80 text-purple-200 border border-purple-500/50 shadow-md"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
              }`}
            >
              <Radio className="h-3.5 w-3.5 text-purple-400" />
              <span>Weekly Lineup</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic(8);
                setMode("screening");
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                mode === "screening"
                  ? "bg-purple-950/80 text-purple-200 border border-purple-500/50 shadow-md"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-purple-400" />
              <span>Date Screening</span>
            </button>

            {isTv && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setMode("nostalgia");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  mode === "nostalgia"
                    ? "bg-purple-950/80 text-purple-200 border border-purple-500/50 shadow-md"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <span>Nostalgia Run</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar touch-pan-y">
          {/* Media Header Banner or Search Box */}
          {selectedMedia && !isChangingMedia ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-neutral-950 border border-neutral-800">
                  {getSafePosterUrl(selectedMedia.posterPath, selectedMedia.posterUrl) ? (
                    <Image
                      src={getSafePosterUrl(selectedMedia.posterPath, selectedMedia.posterUrl)!}
                      alt={selectedMedia.title}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-600">
                      <Tv className="h-4 w-4" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white truncate">{selectedMedia.title}</h3>
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-mono uppercase text-neutral-400">
                      {selectedMedia.mediaType}
                    </span>
                    {selectedMedia.releaseYear && (
                      <span className="text-[11px] font-mono text-neutral-500">
                        ({selectedMedia.releaseYear})
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    {isTv ? (
                      isLoadingDetails ? (
                        <span className="text-purple-400 animate-pulse">Scanning seasons...</span>
                      ) : (
                        `${availableSeasons.length} Available Seasons · Airing Season ${startSeason}${
                          selectedSeasonEpisodeCount > 0 ? ` (${selectedSeasonEpisodeCount} eps)` : ""
                        } · ${effectiveRuntime}m (${effectiveBlockCount} ${
                          effectiveBlockCount === 1 ? "Block" : "Blocks"
                        })`
                      )
                    ) : (
                      `Feature Film Broadcast · ${effectiveRuntime}m (${effectiveBlockCount} Blocks)`
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(6);
                  setIsChangingMedia(true);
                }}
                className="text-[11px] font-mono text-purple-400 hover:text-white underline cursor-pointer shrink-0"
              >
                Change Title
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-purple-400" />
                <span>Search Program to Schedule</span>
              </label>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type a movie or retro TV show..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 pl-9 text-base sm:text-xs text-white placeholder-neutral-500 focus:border-purple-500/60 focus:outline-none min-h-[40px]"
                />
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-500" />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-purple-400" />
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 no-scrollbar">
                  {searchResults.map((item) => (
                    <button
                      key={`${item.mediaType}-${item.tmdbId}`}
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        setSelectedMedia(item);
                        setIsChangingMedia(false);
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-neutral-900 transition-colors cursor-pointer"
                    >
                      <div className="relative h-9 w-6 shrink-0 overflow-hidden rounded bg-neutral-900">
                        {getSafePosterUrl(item.posterPath, item.posterUrl) && (
                          <Image
                            src={getSafePosterUrl(item.posterPath, item.posterUrl)!}
                            alt={item.title}
                            fill
                            sizes="24px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{item.title}</span>
                          <span className="text-[9px] font-mono text-neutral-500 uppercase">
                            {item.mediaType}
                          </span>
                        </div>
                        {item.releaseYear && (
                          <span className="text-[10px] font-mono text-neutral-400">{item.releaseYear}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Season & Tape Vault Licensing Status Bar (For TV Shows) */}
          {selectedMedia && isTv && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40">
              <div className="flex items-center gap-2 min-w-0">
                <Film className="h-4 w-4 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-white">
                      Season {startSeason} Tape Status:
                    </span>
                    {ownedSeasons.includes(startSeason) ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/70 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        <Check className="h-3 w-3" />
                        <span>Tape in Vault</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-950/70 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                        <Zap className="h-3 w-3" />
                        <span>License Required</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5 truncate">
                    {ownedSeasons.includes(startSeason)
                      ? "Physical VHS master tape is preserved in your permanent library."
                      : "Master tape missing. You can schedule freely, but acquire tape before on-air playback."}
                  </p>
                </div>
              </div>

              {!ownedSeasons.includes(startSeason) && (
                <button
                  type="button"
                  onClick={() => handleBuySeasonTape(startSeason)}
                  disabled={isPurchasingSeason === startSeason}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-purple-500/50 bg-purple-950/80 hover:bg-purple-900 px-2.5 py-1.5 text-[11px] font-mono font-bold text-purple-200 transition-all cursor-pointer active:scale-95 disabled:opacity-40 min-h-[36px]"
                >
                  {isPurchasingSeason === startSeason ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5 text-purple-300" />
                  )}
                  <span>Acquire Tape</span>
                </button>
              )}
            </div>
          )}

          {/* TV Season & Episode Selectors (Weekly & Screening modes) */}
          {selectedMedia && isTv && mode !== "nostalgia" && availableSeasons.length > 0 && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/40">
              <div>
                <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
                  Broadcast Season
                </label>
                <select
                  value={startSeason}
                  onChange={(e) => {
                    triggerHaptic(6);
                    setStartSeason(Number(e.target.value));
                    setStartEpisode(1);
                  }}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-mono font-bold text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[38px]"
                >
                  {availableSeasons.map((s) => (
                    <option key={s.seasonNumber} value={s.seasonNumber}>
                      {s.name} ({s.episodeCount} eps) {ownedSeasons.includes(s.seasonNumber) ? "✓ [Vault]" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
                  Starting Episode
                </label>
                <input
                  type="number"
                  min={1}
                  max={availableSeasons.find((s) => s.seasonNumber === startSeason)?.episodeCount || 50}
                  value={startEpisode}
                  onChange={(e) => setStartEpisode(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-mono font-bold text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[38px]"
                />
              </div>
            </div>
          )}

          {/* MODE 1: WEEKLY LINEUP CONFIG */}
          {mode === "weekly" && (
            <div className="space-y-4">
              {/* Day(s) of the week */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                    Broadcast Days
                  </label>
                  <span className="text-[11px] font-mono text-purple-300 font-bold">
                    {selectedDaysSummary}
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map((item) => {
                    const isSelected = selectedDays.includes(item.day);
                    return (
                      <button
                        key={item.day}
                        type="button"
                        onClick={() => toggleDay(item.day)}
                        className={`rounded-xl py-2 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[38px] ${
                          isSelected
                            ? "border border-purple-500/60 bg-purple-950/80 text-white shadow-md shadow-purple-950/40"
                            : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        {item.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Season Selector for TV in Weekly Mode */}
              {isTv && availableSeasons.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                      Starting Season
                    </label>
                    <span className="text-[11px] font-mono text-purple-300 font-bold">
                      {selectedSeasonEpisodeCount > 0 ? `${selectedSeasonEpisodeCount} Episodes` : ""}
                    </span>
                  </div>
                  <select
                    value={startSeason}
                    onChange={(e) => {
                      triggerHaptic(8);
                      setStartSeason(Number(e.target.value));
                      setStartEpisode(1);
                    }}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono font-bold text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[38px]"
                  >
                    {availableSeasons.map((s) => (
                      <option key={s.seasonNumber} value={s.seasonNumber}>
                        {s.name} ({s.episodeCount} eps)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Episodes per day (TV only) */}
              {isTv && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                      Episodes Per Airing
                    </label>
                    {episodesPerDay > 1 && (
                      <button
                        type="button"
                        onClick={handleSnapBackToBack}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/80 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-300 hover:border-purple-500/40 cursor-pointer"
                      >
                        <Zap className="h-3 w-3 text-purple-400" />
                        <span>Snap Back-to-Back</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          triggerHaptic(8);
                          setEpisodesPerDay(cnt);
                          setActiveSlotEditing(0);
                          const blockDuration = effectiveBlockCount * BLOCK_MINUTES;
                          if (cnt >= 2) {
                            const s2 = fromMinutesToSlot(blockStartMinutes + blockDuration);
                            setSlot2Index(s2.slotIndex);
                            setSlot2Meridiem(s2.meridiem);
                          }
                          if (cnt === 3) {
                            const s3 = fromMinutesToSlot(blockStartMinutes + blockDuration * 2);
                            setSlot3Index(s3.slotIndex);
                            setSlot3Meridiem(s3.meridiem);
                          }
                        }}
                        className={`rounded-xl py-2 font-mono text-xs font-bold transition-all cursor-pointer min-h-[38px] ${
                          episodesPerDay === cnt
                            ? "border border-purple-500/60 bg-purple-950/80 text-purple-200"
                            : "border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                        }`}
                      >
                        {cnt} {cnt === 1 ? "Episode" : "Episodes"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Push notifications reminder toggle */}
              {isPushSupported && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-purple-400" />
                    <div>
                      <p className="text-xs font-mono font-bold text-white">Broadcast Alerts</p>
                      <p className="text-[10px] font-mono text-neutral-400">
                        Get notified when this show is about to go live
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableReminder}
                    onChange={(e) => setEnableReminder(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          {/* MODE 2: DATE SCREENING CONFIG */}
          {mode === "screening" && (
            <div className="space-y-3">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 block">
                Screening Calendar Date
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  min={todayStr}
                  value={screeningDate}
                  onChange={(e) => setScreeningDate(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 font-mono text-base sm:text-xs text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[42px]"
                />
              </div>
            </div>
          )}

          {/* MODE 3: NOSTALGIA SYNDICATION RUN CONFIG */}
          {mode === "nostalgia" && (
            <div className="space-y-4">
              {/* Broadcast Days */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                    Broadcast Days
                  </label>
                  <span className="text-[11px] font-mono text-purple-300 font-bold">
                    {selectedDaysSummary}
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map((item) => {
                    const isSelected = selectedDays.includes(item.day);
                    return (
                      <button
                        key={item.day}
                        type="button"
                        onClick={() => toggleDay(item.day)}
                        className={`rounded-xl py-2 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[38px] ${
                          isSelected
                            ? "border border-purple-500/60 bg-purple-950/80 text-white shadow-md shadow-purple-950/40"
                            : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        {item.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Launch Year Selector with Vintage Dropdown */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                  <Layers className="h-3.5 w-3.5 text-purple-400" />
                  <span>Broadcast Launch Year</span>
                </label>
                <RetroYearDropdown
                  value={startYear}
                  onChange={(y) => {
                    setStartYear(y);
                    setPreviewResult(null);
                  }}
                  options={startYearOptions}
                />
              </div>

              {/* Seasons Scope */}
              {availableSeasons.length > 0 && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <div>
                    <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
                      Starting Season
                    </label>
                    <select
                      value={startSeason}
                      onChange={(e) => {
                        setStartSeason(Number(e.target.value));
                        setStartEpisode(1);
                        setPreviewResult(null);
                      }}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-mono font-bold text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[38px]"
                    >
                      {availableSeasons.map((s) => (
                        <option key={s.seasonNumber} value={s.seasonNumber}>
                          {s.name} ({s.episodeCount} eps)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
                      Through Season
                    </label>
                    <select
                      value={endSeason === null ? "all" : String(endSeason)}
                      onChange={(e) => {
                        setEndSeason(e.target.value === "all" ? null : Number(e.target.value));
                        setPreviewResult(null);
                      }}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-mono font-bold text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[38px]"
                    >
                      <option value="all">Series Finale (All Seasons)</option>
                      {availableSeasons
                        .filter((s) => s.seasonNumber >= startSeason)
                        .map((s) => (
                          <option key={s.seasonNumber} value={s.seasonNumber}>
                            Through {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TIME PICKER MATRIX (Common across all modes) */}
          <div className="space-y-2 border-t border-neutral-900 pt-3">
            {/* Intra-slot & existing schedule overlap warnings */}
            {intraSlotOverlapError && (
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-amber-900/60 bg-amber-950/40 text-amber-200 text-xs font-mono animate-in fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate">{intraSlotOverlapError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSnapBackToBack}
                  className="underline text-[10px] font-bold text-amber-300 hover:text-white shrink-0 ml-2 cursor-pointer"
                >
                  Snap Back-to-Back
                </button>
              </div>
            )}

            {scheduleOverlapConflict && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-300 text-xs font-mono animate-in fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate">{scheduleOverlapConflict.message}</span>
                </div>
                {nextAvailableSlot !== null && (
                  <button
                    type="button"
                    onClick={handleShiftToNextAvailable}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-900/50 hover:bg-amber-800/70 text-amber-200 px-2.5 py-1 text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                  >
                    <span>Shift to Next Slot ({formatBlockTime(nextAvailableSlot)})</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Episode Slot Selector when episodesPerDay > 1 */}
            {isTv && episodesPerDay > 1 && (
              <div className="flex items-center justify-between gap-2 bg-neutral-900/70 p-2 rounded-xl border border-neutral-800/80">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {dailySlots.map((slotMinutes, sIdx) => {
                    const isSlotActive = activeSlotEditing === sIdx;
                    const slotTime = formatBlockTime(slotMinutes);
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          triggerHaptic(6);
                          setActiveSlotEditing(sIdx);
                        }}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono font-bold transition-all cursor-pointer ${
                          isSlotActive
                            ? "bg-purple-950 text-purple-200 border border-purple-500/60 shadow-md ring-1 ring-purple-500/30"
                            : "bg-neutral-950/60 text-neutral-400 border border-neutral-800 hover:text-white"
                        }`}
                      >
                        <span>Ep {sIdx + 1}:</span>
                        <span className={isSlotActive ? "text-white" : "text-neutral-300"}>
                          {slotTime}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleSnapBackToBack}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/80 px-2 py-1 text-[10px] font-mono font-bold text-purple-300 hover:border-purple-500/40 cursor-pointer shrink-0"
                >
                  <Zap className="h-3 w-3 text-purple-400" />
                  <span>Snap</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                {isTv && episodesPerDay > 1
                  ? `Select Air Time for Episode ${activeSlotEditing + 1}`
                  : `Air Time (${formattedDailyTimesSummary})`}
              </span>

              {/* AM/PM Switch */}
              <div className="flex items-center rounded-xl bg-neutral-900 p-1 border border-neutral-800 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(8);
                    if (activeSlotEditing === 0) setMeridiem("AM");
                    else if (activeSlotEditing === 1) setSlot2Meridiem("AM");
                    else setSlot3Meridiem("AM");
                    setPreviewResult(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    (activeSlotEditing === 0 ? meridiem : activeSlotEditing === 1 ? slot2Meridiem : slot3Meridiem) === "AM"
                      ? "bg-neutral-800 text-white shadow-md"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Sun className="h-3 w-3" />
                  <span>AM</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(8);
                    if (activeSlotEditing === 0) setMeridiem("PM");
                    else if (activeSlotEditing === 1) setSlot2Meridiem("PM");
                    else setSlot3Meridiem("PM");
                    setPreviewResult(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    (activeSlotEditing === 0 ? meridiem : activeSlotEditing === 1 ? slot2Meridiem : slot3Meridiem) === "PM"
                      ? "bg-neutral-800 text-white shadow-md"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Moon className="h-3 w-3" />
                  <span>PM</span>
                </button>
              </div>
            </div>

            {/* Time Slots Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[125px] overflow-y-auto no-scrollbar rounded-xl border border-neutral-800 bg-neutral-950 p-2">
              {HALF_DAY_SLOTS.map((slot, index) => {
                const currentSlotIndex =
                  activeSlotEditing === 0
                    ? selectedSlotIndex
                    : activeSlotEditing === 1
                      ? slot2Index
                      : slot3Index;
                const isSelected = currentSlotIndex === index;

                return (
                  <button
                    key={`${slot.label}-${activeSlotEditing}`}
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      if (activeSlotEditing === 0) setSelectedSlotIndex(index);
                      else if (activeSlotEditing === 1) setSlot2Index(index);
                      else setSlot3Index(index);
                      setPreviewResult(null);
                    }}
                    className={`rounded-lg px-1.5 py-1.5 font-mono text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold shadow-md ring-1 ring-purple-500/30"
                        : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    <span>{slot.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nostalgia Multi-Year Roadmap Preview */}
          {mode === "nostalgia" && previewResult && (
            <div className="space-y-3.5 border-t border-neutral-900 pt-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 text-purple-400" />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Affiliate Lineup Matrix
                    </h4>
                  </div>
                  <span className="rounded-md border border-purple-500/40 bg-purple-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-300">
                    {previewResult.totalSeasons} Seasons · {previewResult.totalEpisodes} Episodes
                  </span>
                </div>
                <p className="text-xs text-neutral-400 font-mono">
                  From <strong className="text-white">{previewResult.firstAirDate}</strong> through{" "}
                  <strong className="text-white">{previewResult.lastAirDate}</strong>.
                </p>
              </div>

              {/* Seasons Accordion */}
              <div className="space-y-2">
                {previewResult.seasons.map((season) => {
                  const isExpanded = expandedSeason === season.seasonNumber;
                  const isOwned = ownedSeasons.includes(season.seasonNumber);
                  const override = seasonOverrides[season.seasonNumber];

                  return (
                    <div
                      key={season.seasonNumber}
                      className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 overflow-hidden transition-colors hover:border-neutral-700"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(6);
                          setExpandedSeason(isExpanded ? null : season.seasonNumber);
                        }}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-850/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-950/80 font-mono text-xs font-bold text-purple-200 border border-purple-500/40">
                            S{String(season.seasonNumber).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="text-xs font-bold text-white truncate">{season.seasonName}</h5>
                              <span className="rounded bg-neutral-800 px-1.5 py-0.2 font-mono text-[9px] text-neutral-400">
                                {season.episodeCount} eps
                              </span>
                              {/* Tape Vault Badge */}
                              {isOwned ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.2 font-mono text-[9px] text-emerald-300 font-bold">
                                  ✓ Tape in Vault
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.2 font-mono text-[9px] text-amber-300 font-bold">
                                  ⚡ License Required
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 font-mono">
                              {season.projectedStartDate} ➔ {season.projectedEndDate}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Thematic Milestone Badges */}
                          <div className="flex items-center gap-1 max-w-[90px] sm:max-w-none overflow-x-auto no-scrollbar py-0.5">
                            {season.milestones.slice(0, 2).map((badge, bIdx) => (
                              <span
                                key={bIdx}
                                className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[9px] text-neutral-300 shrink-0 whitespace-nowrap"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>

                          {!isOwned && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBuySeasonTape(season.seasonNumber);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-purple-500/40 bg-purple-950/60 hover:bg-purple-900 px-2 py-1 text-[10px] font-mono font-bold text-purple-200 cursor-pointer shrink-0"
                            >
                              <ShoppingBag className="h-3 w-3" />
                              <span className="hidden sm:inline">Acquire Tape</span>
                            </div>
                          )}

                          {/* Skip Season Action Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExcludeFromRoadmap(season.seasonNumber);
                            }}
                            title="Skip this season from your broadcast run"
                            className="flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900/80 px-2 py-1 text-[10px] font-mono text-neutral-400 hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                            <span className="hidden sm:inline">Skip</span>
                          </button>

                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Season Details & Episodes Mini-List */}
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
                                className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 font-mono text-base sm:text-xs text-white focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[36px]"
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
                          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 divide-y divide-neutral-900/60 no-scrollbar touch-pan-y">
                            {season.episodes.map((ep) => (
                              <div
                                key={ep.episodeNumber}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 pt-2 pb-1 text-xs text-neutral-300"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[10px] font-bold text-purple-400 shrink-0">
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

              {/* Skipped seasons banner */}
              {excludedSeasons.length > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-900/60 text-xs font-mono text-neutral-400">
                  <span>
                    Skipped from this run:{" "}
                    <strong className="text-neutral-300">
                      {excludedSeasons.map((s) => `Season ${s}`).join(", ")}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setExcludedSeasons([]);
                      handleGenerateNostalgiaPreview();
                    }}
                    className="text-purple-300 hover:text-white underline cursor-pointer text-[11px] font-bold"
                  >
                    Restore All
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <footer className="sticky bottom-0 z-30 shrink-0 flex items-center justify-between gap-3 border-t border-neutral-900 bg-neutral-950/95 px-4 sm:px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 sm:py-2 text-xs font-semibold text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer active:scale-95 min-h-[40px] sm:min-h-[36px]"
          >
            Cancel
          </button>

          {mode === "nostalgia" && !previewResult ? (
            <button
              type="button"
              onClick={handleGenerateNostalgiaPreview}
              disabled={!selectedMedia || isPreviewLoading || Boolean(intraSlotOverlapError)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 disabled:opacity-40 cursor-pointer transition-all min-h-[40px] sm:min-h-[36px]"
            >
              {isPreviewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
              ) : (
                <Sparkles className="h-4 w-4 text-purple-400" />
              )}
              <span>Calculate Timeline</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => executeCommit()}
              disabled={!selectedMedia || isCommitting || Boolean(intraSlotOverlapError)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider shadow-lg active:scale-95 cursor-pointer disabled:opacity-40 min-h-[40px] sm:min-h-[36px]"
            >
              {isCommitting ? (
                <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
              ) : (
                <Radio className="h-4 w-4 text-purple-400" />
              )}
              <span>
                {mode === "nostalgia"
                  ? "Lock In Multi-Year Broadcast"
                  : mode === "screening"
                    ? "Book Date Screening"
                    : "Lock In Weekly Broadcast"}
              </span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
