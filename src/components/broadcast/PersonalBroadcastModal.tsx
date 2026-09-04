"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  Layers,
  Moon,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { BroadcastSlotCard } from "./BroadcastSlotCard";
import type {
  MissedBroadcastItem,
  PersonalScheduleItem,
  SeasonCompletedAlertItem,
} from "@/types/broadcast";
import {
  DAYS_OF_WEEK,
  formatBlockTime,
  formatBlockTimeRange,
  personalScheduleToMediaSearchResult,
} from "@/types/broadcast";
import type { MediaSearchResult } from "@/types/media";

interface PersonalBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: PersonalScheduleItem[];
  missed: MissedBroadcastItem[];
  seasonAlerts?: SeasonCompletedAlertItem[];
  channelName?: string;
  onUpdateChannelName?: (name: string) => void;
  onDismissSeasonAlert?: (alertId: string) => void;
  onScheduleNextSeason?: (media: MediaSearchResult, nextSeason: number) => void;
  liveNow: PersonalScheduleItem | null;
  onRemoveSchedule: (id: string) => void;
  onRemoveShowSchedule: (tmdbId: number) => void;
  onRescheduleMissed: (
    missedId: string,
    targetDayOfWeek: number,
    targetBlockStartMinutes: number,
    mode?: "move" | "one_off",
  ) => Promise<{ success: boolean; error?: string }>;
  onDismissMissed: (missedId: string) => void;
  onPlay: (target: {
    media: MediaSearchResult;
    season?: number;
    episode?: number;
    startOffsetSeconds?: number;
  }) => void;
}

type TabKey = "grid" | "lineup" | "missed";

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

export function PersonalBroadcastModal({
  isOpen,
  onClose,
  schedule,
  missed,
  seasonAlerts = [],
  channelName = "My Lineup",
  onUpdateChannelName,
  onDismissSeasonAlert,
  onScheduleNextSeason,
  liveNow,
  onRemoveSchedule,
  onRemoveShowSchedule,
  onRescheduleMissed,
  onDismissMissed,
  onPlay,
}: PersonalBroadcastModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(
    missed.length > 0 ? "missed" : seasonAlerts.length > 0 ? "lineup" : "grid",
  );
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [reschedulingItem, setReschedulingItem] = useState<MissedBroadcastItem | null>(null);

  // Channel name inline editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(channelName);
  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (reschedulingItem) {
          setReschedulingItem(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, reschedulingItem, onClose]);

  if (!isOpen) return null;

  const handleSaveName = () => {
    const trimmed = tempName.trim() || "My Lineup";
    onUpdateChannelName?.(trimmed);
    setIsEditingName(false);
  };

  const daySchedule = schedule.filter((item) => item.dayOfWeek === selectedDay);

  // Separate permanent recurring series from one-off encore reruns
  const recurringItems = schedule.filter((item) => !item.isRerun);
  const rerunItems = schedule.filter((item) => item.isRerun);

  // Group recurring schedule by show for the Lineup tab (prevents duplicate series cards)
  const uniqueShows = Array.from(
    new Set(recurringItems.map((item) => item.tmdbId)),
  ).map((tmdbId) => {
    const airings = recurringItems.filter((item) => item.tmdbId === tmdbId);
    return {
      tmdbId,
      first: airings[0],
      airings,
    };
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="personal-broadcast-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-0 sm:p-6 backdrop-blur-md animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full sm:max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-neutral-800 bg-neutral-950 shadow-2xl animate-in zoom-in-95"
      >
        {/* Top Header - Unified Breadcrumb navigation with Admin View */}
        <header className="border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Back to Cablecast</span>
              </button>
              <span className="text-neutral-700 leading-none select-none">/</span>
              <span className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate">
                Broadcast Studio
              </span>
            </div>
          </div>

          {/* Subtitle / Channel Rename row */}
          <div className="flex items-center justify-between gap-2 border-t border-neutral-900/60 pt-2.5 sm:border-t-0 sm:pt-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-purple-400 shadow">
                <Radio className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
                Personal Lineup
              </h1>
              {liveNow && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-700/50 bg-red-950/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-red-400 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
                  Live
                </span>
              )}
            </div>

            <div className="shrink-0">
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    placeholder="Channel Name"
                    className="rounded-lg border border-neutral-700 bg-black/80 px-2 py-0.5 font-mono text-xs text-white outline-none focus:border-neutral-500 w-28 sm:w-auto"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    className="rounded-md border border-neutral-700 bg-neutral-800 p-1 text-white hover:bg-neutral-700 cursor-pointer"
                    title="Save name"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempName(channelName);
                      setIsEditingName(false);
                    }}
                    className="rounded-md border border-neutral-800 p-1 text-neutral-400 hover:text-white cursor-pointer"
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTempName(channelName);
                    setIsEditingName(true);
                  }}
                  className="group flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-neutral-300 hover:border-purple-500/50 hover:bg-purple-950/20 hover:text-white transition-all cursor-pointer shadow-sm"
                  title="Click to rename your channel"
                >
                  <span className="font-mono text-neutral-100 font-bold truncate max-w-[120px] sm:max-w-none">{channelName}</span>
                  <Edit2 className="h-3 w-3 text-neutral-500 group-hover:text-purple-400 shrink-0" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Live on-air banner */}
        {liveNow && (
          <div className="flex items-center justify-between border-b border-red-900/40 bg-red-950/20 px-6 py-2.5 text-xs text-red-200">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>
                <strong className="text-white">Airing Now:</strong> {liveNow.title}
                {liveNow.mediaType === "tv" && ` (S${liveNow.currentSeason}E${liveNow.currentEpisode})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const calculatedOffset = (nowMinutes - liveNow.blockStartMinutes) * 60 + now.getSeconds();
                const offset = liveNow.liveOffsetSeconds ?? Math.max(0, calculatedOffset);
                onPlay({
                  media: personalScheduleToMediaSearchResult(liveNow),
                  season: liveNow.mediaType === "tv" ? liveNow.currentSeason : undefined,
                  episode: liveNow.mediaType === "tv" ? liveNow.currentEpisode : undefined,
                  startOffsetSeconds: offset,
                });
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-900/50 px-3 py-1 text-xs font-bold text-white shadow transition-colors hover:bg-red-800 active:scale-95 cursor-pointer"
            >
              <Play className="h-3 w-3 fill-white" />
              Tune In Live
            </button>
          </div>
        )}

        {/* Season Completed Alerts Banner */}
        {seasonAlerts.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-neutral-900 bg-neutral-950 px-6 py-3">
            {seasonAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="h-4 w-4 shrink-0 text-yellow-400" />
                  <span className="truncate">
                    <strong>Season {alert.completedSeason} Completed:</strong> You finished all episodes of &quot;{alert.title}&quot;!
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {alert.nextSeason && onScheduleNextSeason && (
                    <button
                      type="button"
                      onClick={() => {
                        onScheduleNextSeason(
                          personalScheduleToMediaSearchResult(alert),
                          alert.nextSeason!,
                        );
                        onDismissSeasonAlert?.(alert.id);
                        onClose();
                      }}
                      className="rounded-lg border border-yellow-500/60 bg-yellow-500 px-3 py-1 text-xs font-bold text-black hover:bg-yellow-400 shadow cursor-pointer"
                    >
                      Schedule Season {alert.nextSeason}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismissSeasonAlert?.(alert.id)}
                    className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                    title="Dismiss alert"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top Feature Tab Switcher */}
        <div className="border-b border-neutral-900 bg-black px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-center">
          <div className="flex w-full sm:w-auto items-center justify-center overflow-x-auto no-scrollbar rounded-xl bg-neutral-950 p-1 border border-neutral-800 gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("grid")}
              className={`flex flex-1 sm:flex-initial justify-center items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-lg px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "grid"
                  ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Calendar className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${activeTab === "grid" ? "text-yellow-400" : "text-neutral-500"}`} />
              <span className="hidden sm:inline">Weekly Grid</span>
              <span className="sm:hidden">Grid</span>
              {schedule.length > 0 && (
                <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-300">
                  {schedule.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("lineup")}
              className={`flex flex-1 sm:flex-initial justify-center items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-lg px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "lineup"
                  ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Tv className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${activeTab === "lineup" ? "text-cyan-400" : "text-neutral-500"}`} />
              <span className="hidden sm:inline">Personal Lineup</span>
              <span className="sm:hidden">Lineup</span>
              {uniqueShows.length > 0 && (
                <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-300">
                  {uniqueShows.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("missed")}
              className={`flex flex-1 sm:flex-initial justify-center items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-lg px-2.5 sm:px-4 py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "missed"
                  ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <RotateCcw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${activeTab === "missed" ? "text-emerald-400" : "text-neutral-500"}`} />
              <span className="hidden sm:inline">Missed &amp; Reruns</span>
              <span className="sm:hidden">Missed</span>
              {missed.length > 0 && (
                <span className="inline-flex items-center rounded-full border border-red-700/50 bg-red-950/40 px-1.5 py-0.2 font-mono text-[10px] font-bold text-red-400">
                  {missed.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="no-scrollbar flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Tab 1: Weekly Grid */}
          {activeTab === "grid" && (
            <div key="grid" className="space-y-6 animate-in fade-in duration-150">
              {/* Day selector - 3-letter pill bar on mobile, full grid on desktop */}
              <div className="flex sm:grid sm:grid-cols-7 w-full gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                {DAYS_OF_WEEK.map((d) => {
                  const count = schedule.filter((s) => s.dayOfWeek === d.day).length;
                  const isSelected = selectedDay === d.day;
                  const shortName = d.name.slice(0, 3).toUpperCase();
                  return (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => setSelectedDay(d.day)}
                      className={`flex flex-1 min-w-[44px] sm:min-w-0 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 sm:py-2.5 px-1.5 sm:px-2 text-xs font-bold transition-all shrink-0 sm:shrink ${
                        isSelected
                          ? "border border-neutral-700 bg-neutral-800 text-white shadow-md"
                          : "border border-neutral-800/80 bg-neutral-950/80 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
                      }`}
                    >
                      <span className="sm:hidden text-[11px] uppercase tracking-wider">{shortName}</span>
                      <span className="hidden sm:inline">{d.name}</span>
                      {count > 0 && (
                        <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-300">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Day Schedule Cards */}
              {daySchedule.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-8 sm:p-12 text-center text-neutral-600 min-h-[220px] sm:min-h-[280px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-500 mb-3 shadow">
                    <Calendar className="h-6 w-6 text-neutral-400" />
                  </div>
                  <p className="text-sm font-bold text-neutral-300">
                    No broadcasts scheduled for {DAYS_OF_WEEK.find((d) => d.day === selectedDay)?.name}
                  </p>
                  <p className="mt-1.5 max-w-sm text-xs text-neutral-500 leading-relaxed">
                    Open any movie or TV series in the guide and click &quot;Schedule Broadcast&quot; to program this time slot.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {daySchedule.map((item) => (
                    <BroadcastSlotCard
                      key={item.id}
                      item={item}
                      onPlay={onPlay}
                      onRemove={onRemoveSchedule}
                      onCloseModal={onClose}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Station Lineup */}
          {activeTab === "lineup" && (
            <div key="lineup" className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-neutral-400" />
                    Active Series Lineup ({uniqueShows.length})
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Recurring programmed TV series and weekly appointment rotation
                  </p>
                </div>
              </div>

              {uniqueShows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-600">
                  <Tv className="h-8 w-8 mx-auto mb-2 text-neutral-700" />
                  <p className="text-sm font-semibold text-neutral-400">No recurring series in lineup yet</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Program TV series from the catalog to build your network schedule.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {uniqueShows.map(({ tmdbId, first, airings }) => {
                    const posterUrl = getSafePosterUrl(first.posterPath, first.backdropUrl);
                    const scheduleSummary = airings
                      .map((a) => {
                        const day = DAYS_OF_WEEK.find((d) => d.day === a.dayOfWeek)?.short;
                        const time = formatBlockTime(a.blockStartMinutes);
                        return `${day} @ ${time}`;
                      })
                      .join(" · ");

                    return (
                      <div
                        key={tmdbId}
                        className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-colors hover:border-neutral-700 sm:p-5"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                          {/* Poster */}
                          <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow">
                            {posterUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={posterUrl}
                                alt=""
                                className="h-full w-full object-cover object-center"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-neutral-600">
                                <Tv className="h-5 w-5" />
                              </div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-neutral-200 border border-neutral-800">
                                {first.mediaType.toUpperCase()}
                              </span>
                              <h4 className="text-sm font-bold text-white truncate">{first.title}</h4>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                              <span className="font-mono font-medium text-neutral-200">
                                {scheduleSummary}
                              </span>
                              {first.mediaType === "tv" && (
                                <>
                                  <span>•</span>
                                  <span className="text-neutral-400">
                                    Sequence: Season {first.currentSeason}, Episode {first.currentEpisode}
                                    {first.totalEpisodes ? ` of ${first.totalEpisodes}` : ""}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Action Button matching Admin */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => onRemoveShowSchedule(tmdbId)}
                              className="flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {rerunItems.length > 0 && (
                <div className="mt-6 pt-6 border-t border-neutral-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Upcoming One-Off Encore Reruns ({rerunItems.length})
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        Temporary makeup broadcasts · Automatically clears once aired or watched
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {rerunItems.map((item) => {
                      const posterUrl = getSafePosterUrl(item.posterPath, item.backdropUrl);
                      const day = DAYS_OF_WEEK.find((d) => d.day === item.dayOfWeek)?.name ?? `Day ${item.dayOfWeek}`;
                      const timeRange = formatBlockTimeRange(item.blockStartMinutes, item.blockCount);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-amber-800/40 bg-amber-950/10 p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-neutral-900 border border-neutral-800">
                              {posterUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={posterUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-neutral-600">
                                  <Tv className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="rounded bg-amber-950/60 border border-amber-700/50 px-1.5 py-0.2 font-mono text-[9px] font-bold text-amber-300">
                                  ONE-OFF RERUN
                                </span>
                                <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                              </div>
                              <p className="text-[11px] text-neutral-400 mt-0.5">
                                {day} @ {timeRange} · {item.blockCount} {item.blockCount === 1 ? "Block" : "Blocks"} ({item.blockCount * 30}m)
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveSchedule(item.id)}
                            className="flex items-center gap-1 rounded-md border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-400 cursor-pointer"
                            title="Cancel this one-off rerun"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Missed & Reruns */}
          {activeTab === "missed" && (
            <div key="missed" className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-emerald-400" />
                    Unwatched Broadcasts &amp; Rerun Queue ({missed.length})
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Episodes that aired while offline with 1-click rerun rescheduling
                  </p>
                </div>
              </div>

              {missed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-600">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500/60" />
                  <p className="text-sm font-semibold text-neutral-300">All Caught Up</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    No unwatched broadcasts in queue. Missed broadcasts will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {missed.map((item) => {
                    const posterUrl = getSafePosterUrl(item.posterPath, item.backdropUrl);
                    return (
                      <div
                        key={item.id}
                        className="group relative overflow-hidden rounded-xl border border-amber-800/40 bg-neutral-950 p-4 transition-colors hover:border-amber-700/60 sm:p-5"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                          {/* Poster */}
                          <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow">
                            {posterUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={posterUrl}
                                alt=""
                                className="h-full w-full object-cover object-center"
                              />
                            ) : (
                              <div className="h-16 w-11 shrink-0 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-600">
                                <Tv className="h-5 w-5" />
                              </div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="inline-flex items-center rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                                MISSED AIRING
                              </span>
                              <span className="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-900/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-neutral-300">
                                {item.blockCount ?? (item.mediaType === "movie" ? 4 : 1)} {(item.blockCount ?? (item.mediaType === "movie" ? 4 : 1)) === 1 ? "Block" : "Blocks"} ({item.runtimeMinutes ?? (item.mediaType === "movie" ? 120 : 30)}m)
                              </span>
                              <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                            </div>

                            <p className="text-xs text-neutral-400">
                              {item.season && item.episode ? `Season ${item.season}, Episode ${item.episode} • ` : ""}
                              Originally Aired: {item.originalAirDate} at {item.originalAirTime}
                            </p>
                          </div>

                          {/* Action Buttons matching Admin */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => {
                                onPlay({
                                  media: {
                                    tmdbId: item.tmdbId,
                                    mediaType: item.mediaType,
                                    title: item.title,
                                    releaseYear: item.originalAirDate ? item.originalAirDate.slice(0, 4) : null,
                                    posterPath: item.posterPath ?? null,
                                    posterUrl: item.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null,
                                    backdropUrl: item.backdropUrl ?? null,
                                    overview: "",
                                    voteAverage: 0,
                                  },
                                  season: item.season ?? undefined,
                                  episode: item.episode ?? undefined,
                                });
                                onClose();
                              }}
                              className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white cursor-pointer"
                              title="Watch episode now"
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                              <span>Watch</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setReschedulingItem(item)}
                              className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white cursor-pointer"
                            >
                              <RotateCcw className="h-3.5 w-3.5 text-yellow-400" />
                              <span>Reschedule</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onDismissMissed(item.id)}
                              className="flex items-center gap-1 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-300 cursor-pointer"
                              title="Dismiss"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Dismiss</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reschedule Rerun Modal */}
        {reschedulingItem && (
          <RescheduleRerunModal
            item={reschedulingItem}
            schedule={schedule}
            onClose={() => setReschedulingItem(null)}
            onReschedule={onRescheduleMissed}
          />
        )}

      </div>
    </div>
  );
}

function RescheduleRerunModal({
  item,
  schedule,
  onClose,
  onReschedule,
}: {
  item: MissedBroadcastItem;
  schedule: PersonalScheduleItem[];
  onClose: () => void;
  onReschedule: (
    missedId: string,
    targetDayOfWeek: number,
    targetBlockStartMinutes: number,
    mode?: "move" | "one_off",
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const runtimeMinutes = item.runtimeMinutes ?? (item.mediaType === "movie" ? 120 : 30);
  const blockCount = item.blockCount ?? Math.max(1, Math.ceil(runtimeMinutes / 30));

  const [mode, setMode] = useState<"move" | "one_off">("move");
  const [day, setDay] = useState<number>(new Date().getDay());
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(16); // 8:00 PM default
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSlot = HALF_DAY_SLOTS[selectedSlotIndex] ?? HALF_DAY_SLOTS[16];
  const targetBlockStartMinutes = toMinutesFromMidnight(currentSlot.hour12, currentSlot.minute, meridiem);
  const timeRangeLabel = formatBlockTimeRange(targetBlockStartMinutes, blockCount);
  const dayName = DAYS_OF_WEEK.find((d) => d.day === day)?.name ?? `Day ${day}`;

  // Real-time conflict validation against existing schedule
  const conflict = useMemo(() => {
    const dayItems = schedule.filter((s) => s.dayOfWeek === day);
    const requestedEnd = targetBlockStartMinutes + blockCount * 30;

    for (const s of dayItems) {
      // In move mode, if s is the original schedule item, it won't conflict with its old slot
      if (mode === "move" && s.id === item.scheduleId) continue;
      const sEnd = s.blockStartMinutes + s.blockCount * 30;
      const overlaps = targetBlockStartMinutes < sEnd && requestedEnd > s.blockStartMinutes;
      if (overlaps) {
        return {
          title: s.title,
          timeStr: formatBlockTimeRange(s.blockStartMinutes, s.blockCount),
        };
      }
    }
    return null;
  }, [schedule, day, targetBlockStartMinutes, blockCount, mode, item.scheduleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (conflict) {
      setError(`Slot conflict: Overlaps with "${conflict.title}" (${conflict.timeStr}). Please pick an open time slot.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await onReschedule(item.id, day, targetBlockStartMinutes, mode);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || "Failed to reschedule broadcast.");
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-md animate-in fade-in">
      <div className="relative flex w-full max-w-lg flex-col rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto no-scrollbar">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg border border-neutral-800 p-1.5 text-neutral-400 hover:border-neutral-700 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-900 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-yellow-400 shadow">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white truncate">
                Reschedule Broadcast
              </h3>
              <span className="inline-flex items-center gap-1 rounded bg-neutral-900 border border-neutral-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-yellow-400">
                <Layers className="h-3 w-3" />
                {blockCount} {blockCount === 1 ? "Block" : "Blocks"} ({runtimeMinutes}m)
              </span>
            </div>
            <p className="text-xs text-neutral-400 truncate mt-0.5">
              {item.title} {item.season && item.episode ? `· S${item.season}:E${item.episode}` : "· Feature Film"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Step 1: Choose Rerun Mode */}
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              1. Choose Schedule Action
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Option A: Move Weekly Broadcast */}
              <button
                type="button"
                onClick={() => setMode("move")}
                className={`flex flex-col text-left rounded-xl p-3 border transition-all cursor-pointer ${
                  mode === "move"
                    ? "border-yellow-500/70 bg-yellow-500/10 shadow-md ring-1 ring-yellow-500/40"
                    : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-400"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-xs font-bold uppercase tracking-wider ${mode === "move" ? "text-yellow-400" : "text-neutral-300"}`}>
                    Move Weekly Airing
                  </span>
                  {mode === "move" && <Check className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
                </div>
                <p className="text-[11px] leading-relaxed text-neutral-400">
                  Moves your recurring broadcast to this new slot and rewinds to this episode. No duplicates in lineup.
                </p>
              </button>

              {/* Option B: One-Off Encore Rerun */}
              <button
                type="button"
                onClick={() => setMode("one_off")}
                className={`flex flex-col text-left rounded-xl p-3 border transition-all cursor-pointer ${
                  mode === "one_off"
                    ? "border-amber-500/70 bg-amber-500/10 shadow-md ring-1 ring-amber-500/40"
                    : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-400"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-xs font-bold uppercase tracking-wider ${mode === "one_off" ? "text-amber-400" : "text-neutral-300"}`}>
                    One-Off Encore
                  </span>
                  {mode === "one_off" && <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                </div>
                <p className="text-[11px] leading-relaxed text-neutral-400">
                  Schedules a single special broadcast for this missed episode. Keeps your regular schedule intact.
                </p>
              </button>
            </div>
          </div>

          {/* Step 2: Day Selection */}
          <div className="border-t border-neutral-900 pt-4">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <Calendar className="h-3.5 w-3.5 text-neutral-500" />
              2. Select Air Day
            </label>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map((d) => {
                const isSelected = day === d.day;
                const isToday = new Date().getDay() === d.day;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => {
                      setDay(d.day);
                      setError(null);
                    }}
                    className={`flex flex-col items-center justify-center rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "border border-neutral-600 bg-neutral-800 text-white shadow-md ring-1 ring-neutral-500"
                        : "border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    <span>{d.short}</span>
                    {isToday && (
                      <span className="text-[8px] font-mono text-yellow-400 uppercase tracking-tighter">
                        Today
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Time selection */}
          <div className="border-t border-neutral-900 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                <Clock className="h-3.5 w-3.5 text-neutral-500" />
                3. Air Time ({formatBlockTime(targetBlockStartMinutes)})
              </label>

              {/* AM / PM Segmented Switch */}
              <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setMeridiem("AM")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    meridiem === "AM"
                      ? "bg-neutral-800 text-white shadow-md"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  <Sun className="h-3 w-3" />
                  <span>AM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMeridiem("PM")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    meridiem === "PM"
                      ? "bg-neutral-800 text-white shadow-md"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  <Moon className="h-3 w-3" />
                  <span>PM</span>
                </button>
              </div>
            </div>

            {/* Time Slot Matrix */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[120px] overflow-y-auto no-scrollbar rounded-xl border border-neutral-800 bg-neutral-950 p-2">
              {HALF_DAY_SLOTS.map((slot, index) => {
                const isSelected = selectedSlotIndex === index;
                return (
                  <button
                    key={`${slot.label}-${meridiem}`}
                    type="button"
                    onClick={() => {
                      setSelectedSlotIndex(index);
                      setError(null);
                    }}
                    className={`rounded-lg px-1.5 py-1 font-mono text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? "border border-neutral-600 bg-neutral-800 text-white font-bold shadow-md ring-1 ring-neutral-500"
                        : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Summary Card */}
          <div className="rounded-xl border border-neutral-800/90 bg-neutral-900/40 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block">
                Scheduled Air Window
              </span>
              <p className="text-xs font-bold text-white font-mono truncate">
                {dayName} · {timeRangeLabel}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-800/80 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-300 border border-neutral-700/60">
                {blockCount} {blockCount === 1 ? "Block" : "Blocks"} ({blockCount * 30}m)
              </span>
            </div>
          </div>

          {/* Conflict Alert */}
          {conflict && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong>Slot Conflict:</strong> Overlaps with &quot;{conflict.title}&quot; ({conflict.timeStr}). Please select an unoccupied time slot.
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || Boolean(conflict)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting
              ? "Saving Schedule..."
              : mode === "move"
                ? `Confirm Move to ${dayName} @ ${formatBlockTime(targetBlockStartMinutes)}`
                : `Confirm One-Off Encore (${dayName} @ ${formatBlockTime(targetBlockStartMinutes)})`}
          </button>
        </form>
      </div>
    </div>
  );
}
