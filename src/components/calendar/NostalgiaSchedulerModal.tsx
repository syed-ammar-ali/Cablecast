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
  SlidersHorizontal,
  X,
  Hash,
  Zap,
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
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 px-3.5 py-2 text-left text-xs font-mono font-bold text-neutral-200 transition-colors hover:border-neutral-700 focus:border-purple-500/60 focus:outline-none cursor-pointer"
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
        <div className="absolute left-0 top-full z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 p-1 backdrop-blur-xl shadow-2xl shadow-black animate-in fade-in zoom-in-95 duration-150">
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
                    ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                    : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={isSelected ? "text-purple-200 font-bold" : "text-white"}>
                    {opt.year}
                  </span>
                  <span className="text-neutral-400 text-[11px] font-sans">{opt.label}</span>
                </div>
                <span
                  className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                    isSelected
                      ? "bg-purple-900/80 text-purple-300 border border-purple-500/40"
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

interface RetroSelectOption<T extends string | number> {
  value: T;
  label: string;
  badge?: string;
  sublabel?: string;
}

function RetroSelectDropdown<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  value: T;
  onChange: (val: T) => void;
  options: RetroSelectOption<T>[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value) || options[0];

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
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-left text-xs font-mono font-bold text-white transition-colors hover:border-neutral-700 focus:border-purple-500/60 focus:outline-none cursor-pointer min-h-[38px] active:scale-[0.99]"
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <span className="truncate text-white">
            {selected ? selected.label : placeholder}
          </span>
          {selected?.sublabel && (
            <span className="text-[10px] text-neutral-400 font-sans truncate">
              {selected.sublabel}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-purple-300" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-56 w-full min-w-[200px] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/95 p-1 backdrop-blur-xl shadow-2xl shadow-black no-scrollbar animate-in fade-in zoom-in-95 duration-150">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-mono transition-colors cursor-pointer ${
                  isSelected
                    ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                    : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate min-w-0">
                  <span className={`truncate ${isSelected ? "text-purple-200 font-bold" : "text-white"}`}>
                    {opt.label}
                  </span>
                  {opt.sublabel && (
                    <span className="text-[10px] text-neutral-500 font-sans truncate">
                      {opt.sublabel}
                    </span>
                  )}
                </div>
                {opt.badge && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                      isSelected
                        ? "bg-purple-900/80 text-purple-300 border border-purple-500/40"
                        : "bg-neutral-900 text-neutral-500"
                    }`}
                  >
                    {opt.badge}
                  </span>
                )}
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
  const [selectedDays, setSelectedDays] = useState<number[]>([4]); // Default Thursday
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(17); // 8:30 PM default
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");
  const [startYear, setStartYear] = useState<number>(currentYear);

  // Multi-episode per broadcast day configuration
  const [episodesPerDay, setEpisodesPerDay] = useState<1 | 2 | 3>(1);
  const [activeSlotEditing, setActiveSlotEditing] = useState<number>(0);
  const [slot2Index, setSlot2Index] = useState<number>(18); // 9:00 PM default
  const [slot2Meridiem, setSlot2Meridiem] = useState<"AM" | "PM">("PM");
  const [slot3Index, setSlot3Index] = useState<number>(19); // 9:30 PM default
  const [slot3Meridiem, setSlot3Meridiem] = useState<"AM" | "PM">("PM");

  // Show season configuration & scope
  const [availableSeasons, setAvailableSeasons] = useState<
    Array<{ seasonNumber: number; name: string; episodeCount: number; airDate: string | null }>
  >([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [startSeason, setStartSeason] = useState<number>(1);
  const [startEpisode, setStartEpisode] = useState<number>(1);
  const [endSeason, setEndSeason] = useState<number | null>(null);
  const [excludedSeasons, setExcludedSeasons] = useState<number[]>([]);

  // Fetch show season metadata whenever selectedShow changes
  useEffect(() => {
    if (!selectedShow?.tmdbId) {
      setAvailableSeasons([]);
      setStartSeason(1);
      setStartEpisode(1);
      setEndSeason(null);
      setExcludedSeasons([]);
      return;
    }

    let isMounted = true;
    setIsLoadingDetails(true);

    fetch(`/api/tmdb/details?tmdbId=${selectedShow.tmdbId}&mediaType=tv`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
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
          const firstNum = valid[0]?.seasonNumber ?? 1;
          setStartSeason(firstNum);
          setStartEpisode(1);
          setEndSeason(null);
          setExcludedSeasons([]);
        }
      })
      .catch((err) => {
        console.warn("[NostalgiaSchedulerModal] Failed to load season details:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedShow?.tmdbId]);

  const selectedStartingSeasonObj = useMemo(() => {
    return availableSeasons.find((s) => s.seasonNumber === startSeason);
  }, [availableSeasons, startSeason]);

  const maxEpisodesInStartSeason = selectedStartingSeasonObj?.episodeCount || 50;

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

  const handleSelectStartSeason = (newStart: number) => {
    triggerHaptic(8);
    setStartSeason(newStart);
    setStartEpisode(1);
    setPreviewResult(null);
    if (endSeason !== null && endSeason < newStart) {
      setEndSeason(null);
    }
  };

  const toggleSeasonInclusion = useCallback((seasonNum: number) => {
    triggerHaptic(8);
    setPreviewResult(null);
    setExcludedSeasons((prev) => {
      if (prev.includes(seasonNum)) {
        return prev.filter((s) => s !== seasonNum);
      } else {
        return [...prev, seasonNum];
      }
    });
  }, []);

  const toggleDay = useCallback((day: number) => {
    triggerHaptic(10);
    setPreviewResult(null);
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Keep at least one day selected
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
          const rawList = Array.isArray(data)
            ? data
            : Array.isArray(data?.results)
              ? data.results
              : [];
          const tvOnly = rawList.filter((item: MediaSearchResult) => item.mediaType === "tv");
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

  const slot2Slot = HALF_DAY_SLOTS[slot2Index] || HALF_DAY_SLOTS[18];
  const slot2Minutes = toMinutesFromMidnight(slot2Slot.hour12, slot2Slot.minute, slot2Meridiem);

  const slot3Slot = HALF_DAY_SLOTS[slot3Index] || HALF_DAY_SLOTS[19];
  const slot3Minutes = toMinutesFromMidnight(slot3Slot.hour12, slot3Slot.minute, slot3Meridiem);

  const dailySlots = useMemo(() => {
    if (episodesPerDay === 1) return [blockStartMinutes];
    if (episodesPerDay === 2) return [blockStartMinutes, slot2Minutes];
    return [blockStartMinutes, slot2Minutes, slot3Minutes];
  }, [episodesPerDay, blockStartMinutes, slot2Minutes, slot3Minutes]);

  const formattedSlot1Time = formatBlockTime(blockStartMinutes);
  const formattedSlot2Time = formatBlockTime(slot2Minutes);
  const formattedSlot3Time = formatBlockTime(slot3Minutes);

  const formattedDailyTimesSummary = useMemo(() => {
    if (episodesPerDay === 1) return formattedSlot1Time;
    if (episodesPerDay === 2) return `${formattedSlot1Time} & ${formattedSlot2Time}`;
    return `${formattedSlot1Time}, ${formattedSlot2Time}, ${formattedSlot3Time}`;
  }, [episodesPerDay, formattedSlot1Time, formattedSlot2Time, formattedSlot3Time]);

  const handleSnapBackToBack = useCallback(() => {
    triggerHaptic(10);
    setPreviewResult(null);
    const s2 = fromMinutesToSlot(blockStartMinutes + 30);
    setSlot2Index(s2.slotIndex);
    setSlot2Meridiem(s2.meridiem);
    if (episodesPerDay === 3) {
      const s3 = fromMinutesToSlot(blockStartMinutes + 60);
      setSlot3Index(s3.slotIndex);
      setSlot3Meridiem(s3.meridiem);
    }
    toast.info("Time slots snapped consecutively back-to-back.", "Back-to-Back");
  }, [blockStartMinutes, episodesPerDay, toast]);

  const handleSelectEpisodesPerDay = useCallback(
    (count: 1 | 2 | 3) => {
      triggerHaptic(8);
      setPreviewResult(null);
      setEpisodesPerDay(count);
      setActiveSlotEditing(0);
      if (count >= 2) {
        const s2 = fromMinutesToSlot(blockStartMinutes + 30);
        setSlot2Index(s2.slotIndex);
        setSlot2Meridiem(s2.meridiem);
      }
      if (count === 3) {
        const s3 = fromMinutesToSlot(blockStartMinutes + 60);
        setSlot3Index(s3.slotIndex);
        setSlot3Meridiem(s3.meridiem);
      }
    },
    [blockStartMinutes],
  );

  const intraSlotOverlapError = useMemo(() => {
    if (episodesPerDay === 1) return null;
    if (episodesPerDay >= 2) {
      if (slot2Minutes < blockStartMinutes + 30 && slot2Minutes >= blockStartMinutes) {
        return "Episode 2 starts before Episode 1 finishes. Please space out times or snap back-to-back.";
      }
      if (blockStartMinutes === slot2Minutes) {
        return "Episode 1 and Episode 2 cannot air at the exact same time.";
      }
      if (slot2Minutes < blockStartMinutes) {
        return "Episode 2 must air after Episode 1 in chronological order.";
      }
    }
    if (episodesPerDay === 3) {
      if (slot3Minutes < slot2Minutes + 30 && slot3Minutes >= slot2Minutes) {
        return "Episode 3 starts before Episode 2 finishes. Please space out times or snap back-to-back.";
      }
      if (slot3Minutes === blockStartMinutes || slot3Minutes === slot2Minutes) {
        return "Episode 3 cannot air at the exact same time as an earlier episode.";
      }
      if (slot3Minutes < slot2Minutes) {
        return "Episode 3 must air after Episode 2 in chronological order.";
      }
    }
    return null;
  }, [episodesPerDay, blockStartMinutes, slot2Minutes, slot3Minutes]);

  const startYearOptions = useMemo(
    () => [
      {
        year: currentYear,
        label: "Autumn Premiere",
        badge: "This Year",
      },
      {
        year: currentYear + 1,
        label: "Next Broadcast Season Launch",
        badge: "Next Year",
      },
      {
        year: currentYear + 2,
        label: "Future Scheduled Series Run",
        badge: `+2 Years`,
      },
      {
        year: currentYear + 3,
        label: "Long-Range Broadcast Schedule",
        badge: `+3 Years`,
      },
      {
        year: currentYear + 4,
        label: "Far Horizon Schedule",
        badge: `+4 Years`,
      },
    ],
    [currentYear],
  );

  const startSeasonOptions = useMemo(
    () =>
      availableSeasons.map((s) => ({
        value: s.seasonNumber,
        label: s.name || `Season ${s.seasonNumber}`,
        badge: `${s.episodeCount} eps`,
      })),
    [availableSeasons],
  );

  const endSeasonOptions = useMemo(() => {
    const opts: RetroSelectOption<string>[] = [
      {
        value: "finale",
        label: "Series Finale",
        badge: "All Seasons",
      },
    ];
    availableSeasons
      .filter((s) => s.seasonNumber >= startSeason)
      .forEach((s) => {
        opts.push({
          value: String(s.seasonNumber),
          label: `Through ${s.name || `Season ${s.seasonNumber}`}`,
          badge: `${s.episodeCount} eps`,
        });
      });
    return opts;
  }, [availableSeasons, startSeason]);

  // Fetch or calculate preview
  const handleGeneratePreview = useCallback(async () => {
    if (!selectedShow) return;
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
          tmdbId: selectedShow.tmdbId,
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
    selectedShow,
    intraSlotOverlapError,
    selectedDays,
    blockStartMinutes,
    dailySlots,
    episodesPerDay,
    startYear,
    startSeason,
    startEpisode,
    endSeason,
    includedSeasonNumbers,
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

      if (!selectedShow) return;
      setIsPreviewLoading(true);
      try {
        const res = await fetch("/api/calendar/nostalgia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            tmdbId: selectedShow.tmdbId,
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
      selectedShow,
      selectedDays,
      blockStartMinutes,
      dailySlots,
      episodesPerDay,
      startYear,
      seasonOverrides,
      toast,
    ],
  );

  // Commit schedule to calendar
  const handleCommitSchedule = async () => {
    if (!selectedShow || !previewResult) return;
    if (intraSlotOverlapError) {
      toast.error(intraSlotOverlapError, "Slot Overlap");
      return;
    }
    if (includedSeasonNumbers.length === 0) {
      toast.error("At least one season must be included in the broadcast run.", "Invalid Selection");
      return;
    }
    triggerHaptic(20);
    setIsCommitting(true);

    try {
      const res = await fetch("/api/calendar/nostalgia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          tmdbId: selectedShow.tmdbId,
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
        <header className="sticky top-0 z-30 shrink-0 border-b border-neutral-900 bg-neutral-950/95 px-5 pt-5 pb-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-2.5">
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

          <div className="flex items-center justify-between gap-2 border-t border-neutral-900/60 pt-2 sm:border-t-0 sm:pt-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-purple-400 shadow">
                <Radio className="h-3 w-3" />
              </div>
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
                Retro TV Broadcast Scheduler
              </h1>
            </div>
          </div>
        </header>

        {/* Scrollable Form Body */}
        <div className="no-scrollbar flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5 overscroll-contain touch-pan-y">
          {/* Step 1: Select Series */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
              <Tv className="h-3.5 w-3.5 text-purple-400" />
              <span>1. Select TV Series</span>
            </label>

            {selectedShow ? (
              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 transition-colors">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow">
                    {(() => {
                      const poster = getSafePosterUrl(selectedShow.posterPath, selectedShow.posterUrl);
                      return poster ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={poster}
                          alt={selectedShow.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-600">
                          <Tv className="h-4 w-4" />
                        </div>
                      );
                    })()}
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
                    placeholder="Search any show (e.g. Friends, Seinfeld, Buffy, Twin Peaks)..."
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900/80 pl-9 pr-4 py-2.5 sm:py-2 text-base sm:text-xs font-mono text-white placeholder-neutral-500 focus:border-purple-500/60 focus:bg-black focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-purple-400" />
                  )}
                </div>

                {/* Search Dropdown */}
                {searchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 divide-y divide-neutral-900 shadow-2xl no-scrollbar">
                    {searchResults.map((item) => {
                      const poster = getSafePosterUrl(item.posterPath, item.posterUrl);
                      return (
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
                          <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded bg-neutral-900 border border-neutral-800">
                            {poster ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={poster} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-neutral-600">
                                <Tv className="h-3.5 w-3.5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">{item.title}</p>
                            <p className="text-[10px] text-neutral-400 font-mono">
                              {item.releaseYear ? `${item.releaseYear} • ` : ""}TV Series
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Season Scope & Starting Point */}
          {selectedShow && (
            <div className="space-y-3.5 border-t border-neutral-900 pt-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-purple-400" />
                  <span>2. Starting Season & Series Scope</span>
                </label>
                {availableSeasons.length > 0 && (
                  <span className="font-mono text-[10px] text-purple-300 bg-purple-950/70 border border-purple-500/40 rounded-md px-2 py-0.5 font-bold">
                    Start: S{startSeason}:E{startEpisode}
                    {endSeason ? ` ➔ S${endSeason}` : ` ➔ Finale`}
                  </span>
                )}
              </div>

              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-4 text-neutral-500 gap-2 text-xs font-mono">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                  <span>Scanning show seasons and episode counts...</span>
                </div>
              ) : availableSeasons.length > 0 ? (
                <div className="space-y-3">
                  {/* Selectors Grid: Start Season, Start Episode, End Season */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* 1. Start Season */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-neutral-400 font-bold uppercase">
                        Start From Season
                      </label>
                      <RetroSelectDropdown
                        value={startSeason}
                        onChange={handleSelectStartSeason}
                        options={startSeasonOptions}
                      />
                    </div>

                    {/* 2. Start Episode */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-mono text-neutral-400 font-bold uppercase">
                          Start At Episode
                        </label>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          of {maxEpisodesInStartSeason}
                        </span>
                      </div>
                      <div className="flex items-center rounded-xl border border-neutral-800 bg-neutral-900/90 px-3 py-2 min-h-[38px] focus-within:border-purple-500/60 transition-colors">
                        <span className="text-xs text-neutral-500 font-mono mr-1">Ep</span>
                        <input
                          type="number"
                          min="1"
                          max={maxEpisodesInStartSeason}
                          value={startEpisode}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(maxEpisodesInStartSeason, Number(e.target.value) || 1));
                            setStartEpisode(val);
                            setPreviewResult(null);
                          }}
                          className="w-full bg-transparent font-mono text-xs font-bold text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 3. Run Through (End Season) */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-neutral-400 font-bold uppercase">
                        Broadcast Through
                      </label>
                      <RetroSelectDropdown
                        value={endSeason !== null ? String(endSeason) : "finale"}
                        onChange={(val) => {
                          triggerHaptic(8);
                          setEndSeason(val === "finale" ? null : Number(val));
                          setPreviewResult(null);
                        }}
                        options={endSeasonOptions}
                      />
                    </div>
                  </div>

                  {/* Season Inclusion Chips (Within Active Broadcast Scope) */}
                  {activeScopeSeasons.length > 1 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                        <span>Click any season to include or exclude from this run:</span>
                        <span className={`font-bold ${includedSeasonNumbers.length === 0 ? "text-amber-400" : "text-purple-300"}`}>
                          {includedSeasonNumbers.length} of {activeScopeSeasons.length} seasons active
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activeScopeSeasons.map((s) => {
                          const isIncluded = includedSeasonNumbers.includes(s.seasonNumber);
                          return (
                            <button
                              key={s.seasonNumber}
                              type="button"
                              onClick={() => toggleSeasonInclusion(s.seasonNumber)}
                              title={isIncluded ? `Season ${s.seasonNumber} included - Click to skip` : `Season ${s.seasonNumber} skipped - Click to include`}
                              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono transition-all cursor-pointer active:scale-95 ${
                                isIncluded
                                  ? "border border-purple-500/50 bg-purple-950/70 text-purple-200 font-bold shadow-sm"
                                  : "border border-neutral-800 bg-neutral-900/40 text-neutral-500 line-through hover:border-neutral-700 hover:text-neutral-300"
                              }`}
                            >
                              <span>S{s.seasonNumber}</span>
                              <span className="text-[9px] opacity-70 font-sans">({s.episodeCount} eps)</span>
                            </button>
                          );
                        })}
                      </div>
                      {includedSeasonNumbers.length === 0 && (
                        <p className="text-[11px] font-mono text-amber-400 pt-0.5">
                          ⚠️ At least one season must remain active in the broadcast run.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Appointment Configuration */}
          <div className="space-y-4 border-t border-neutral-900 pt-4">
            {/* Air Day Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                <CalendarDays className="h-3.5 w-3.5 text-purple-400" />
                <span>3. Weekly Airing Days ({selectedDaysSummary})</span>
              </label>

              {/* Day Pills multi-select */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {DAYS_OF_WEEK.map((d) => {
                  const isSelected = selectedDays.includes(d.day);
                  return (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => toggleDay(d.day)}
                      title={d.name}
                      aria-pressed={isSelected}
                      className={`flex flex-col items-center justify-center rounded-xl py-2.5 sm:py-2 px-0.5 sm:px-1 min-h-[44px] sm:min-h-[38px] text-center transition-all cursor-pointer active:scale-95 ${
                        isSelected
                          ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                          : "border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      <span className="font-mono text-xs">{d.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 4: Episodes Per Day & Air Time Slots */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                  <Clock className="h-3.5 w-3.5 text-purple-400" />
                  <span>4. Air Time & Daily Episodes</span>
                </label>
                <span className="font-mono text-[10px] text-purple-300 bg-purple-950/70 border border-purple-500/40 rounded-md px-2 py-0.5 font-bold">
                  {episodesPerDay} ep/day · {formattedDailyTimesSummary}
                </span>
              </div>

              {/* Episodes Per Airing Day Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-neutral-900/40 p-2.5 rounded-xl border border-neutral-800">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-mono text-neutral-300 font-bold uppercase">
                    Episodes Per Broadcast Day
                  </span>
                  <p className="text-[10px] font-mono text-neutral-500">
                    Air single episodes or multi-episode runs each scheduled day
                  </p>
                </div>
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  {([1, 2, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => handleSelectEpisodesPerDay(count)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-mono font-bold transition-all cursor-pointer active:scale-95 ${
                        episodesPerDay === count
                          ? "border-purple-500/60 bg-purple-950 text-purple-200 shadow-sm"
                          : "border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }`}
                    >
                      {count} {count === 1 ? "Episode" : "Episodes"}
                    </button>
                  ))}
                </div>
              </div>

              {/* When 2 or 3 episodes per day: Slot Selection Tabs & Snap Back-to-Back */}
              {episodesPerDay > 1 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {Array.from({ length: episodesPerDay }).map((_, sIdx) => {
                        const isSlotActive = activeSlotEditing === sIdx;
                        const slotTime =
                          sIdx === 0
                            ? formattedSlot1Time
                            : sIdx === 1
                              ? formattedSlot2Time
                              : formattedSlot3Time;
                        return (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => {
                              triggerHaptic(8);
                              setActiveSlotEditing(sIdx);
                            }}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition-all cursor-pointer active:scale-95 ${
                              isSlotActive
                                ? "border-purple-500/80 bg-purple-950 text-purple-200 shadow-md ring-1 ring-purple-500/40"
                                : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
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
                      title="Automatically set consecutive 30-min time slots"
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/80 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300 hover:border-purple-500/40 hover:bg-purple-950/60 transition-all cursor-pointer active:scale-95"
                    >
                      <Zap className="h-3 w-3 text-purple-400" />
                      <span>Snap Back-to-Back</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Overlap Error Warning */}
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

              {/* AM / PM Segmented Switch & Time Slot Matrix for activeSlotEditing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-neutral-400 font-bold uppercase">
                    {episodesPerDay > 1 ? `Adjust Time for Episode ${activeSlotEditing + 1}` : "Select Air Time"}
                  </span>

                  {/* AM / PM Segmented Switch */}
                  <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800 gap-1">
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
                        if (activeSlotEditing === 0) setMeridiem("PM");
                        else if (activeSlotEditing === 1) setSlot2Meridiem("PM");
                        else setSlot3Meridiem("PM");
                        setPreviewResult(null);
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        (activeSlotEditing === 0 ? meridiem : activeSlotEditing === 1 ? slot2Meridiem : slot3Meridiem) === "PM"
                          ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <Moon className="h-3 w-3" />
                      <span>PM</span>
                    </button>
                  </div>
                </div>

                {/* Time Slot Matrix */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[130px] overflow-y-auto no-scrollbar rounded-xl border border-neutral-800 bg-neutral-950 p-2">
                  {HALF_DAY_SLOTS.map((slot, index) => {
                    const currentEditingIndex =
                      activeSlotEditing === 0
                        ? selectedSlotIndex
                        : activeSlotEditing === 1
                          ? slot2Index
                          : slot3Index;
                    const isSelected = currentEditingIndex === index;
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
                        className={`relative rounded-lg px-1.5 py-1 font-mono text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? "border border-purple-500/60 bg-purple-950/80 text-purple-200 font-bold ring-1 ring-purple-500/30 shadow-md"
                            : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        <span>{slot.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Launch Year Selector with Custom Vintage Dropdown */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                <Layers className="h-3.5 w-3.5 text-purple-400" />
                <span>5. Broadcast Launch Year</span>
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

            {/* Calculate Button */}
            {selectedShow && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleGeneratePreview}
                  disabled={isPreviewLoading || Boolean(intraSlotOverlapError) || includedSeasonNumbers.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white hover:border-purple-400 py-2.5 text-xs font-bold uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:opacity-40 active:scale-95"
                >
                  {isPreviewLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                      <span>Scanning Historical Broadcast Weeks...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-purple-400" />
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
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700 text-purple-400">
                      <CalendarCheck2 className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Affiliate Lineup Matrix
                    </h3>
                  </div>
                  <span className="rounded-md border border-purple-500/40 bg-purple-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-300">
                    {previewResult.totalSeasons} Seasons · {previewResult.totalEpisodes} Episodes
                  </span>
                </div>

                <p className="text-xs text-neutral-400 font-mono">
                  Broadcasting{" "}
                  <span className="text-purple-300 font-bold">
                    {previewResult.episodesPerDay > 1
                      ? `${previewResult.episodesPerDay} eps every `
                      : "every "}
                    {selectedDaysSummary} ({formattedDailyTimesSummary})
                  </span>{" "}
                  starting with{" "}
                  <span className="text-purple-300 font-bold">
                    Season {previewResult.startSeason ?? startSeason}
                    {previewResult.startEpisode > 1 ? ` (Ep ${previewResult.startEpisode})` : ""}
                    {previewResult.endSeason ? ` through Season ${previewResult.endSeason}` : ""}
                  </span>{" "}
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
                          <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-950/80 font-mono text-xs font-bold text-purple-200 border border-purple-500/40">
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
                          {/* Skip Season Action Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExcludeFromRoadmap(season.seasonNumber);
                            }}
                            title="Skip this season from your broadcast run"
                            className="flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900/80 px-2 py-1 text-[10px] font-mono text-neutral-400 hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-300 transition-colors cursor-pointer active:scale-95"
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
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-neutral-900/60 no-scrollbar touch-pan-y">
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
                    Skipped from this run: <strong className="text-neutral-300">{excludedSeasons.map((s) => `Season ${s}`).join(", ")}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setExcludedSeasons([]);
                      handleGeneratePreview();
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
              disabled={isCommitting || Boolean(intraSlotOverlapError) || includedSeasonNumbers.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white hover:border-purple-400 px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-40 min-h-[42px] sm:min-h-[36px]"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                  <span>Locking In Lineup...</span>
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4 text-purple-400" />
                  <span className="truncate">Lock In Multi-Year Broadcast</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={!selectedShow || isPreviewLoading || Boolean(intraSlotOverlapError) || includedSeasonNumbers.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white hover:border-purple-400 px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 disabled:opacity-40 cursor-pointer transition-all min-h-[42px] sm:min-h-[36px]"
            >
              {isPreviewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
              ) : (
                <Sparkles className="h-4 w-4 text-purple-400" />
              )}
              <span>Calculate Timeline</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
