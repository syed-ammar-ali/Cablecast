"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tv, Delete, CornerDownLeft, Sparkles, Radio, Film, X } from "lucide-react";
import type { MediaSearchResult } from "@/types/media";
import type { MediaType } from "@/types/media";
import { CHANNELS, getChannel } from "@/config/channels";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ChannelAppointment {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  season: number | null;
  episode: number | null;
  posterPath: string | null;
  blockStartMinutes: number;
  blockCount: number;
  runtimeMinutes: number | null;
  dayOfWeek: number;
}

interface ChannelResponse {
  channelNumber: number;
  channelName: string;
  channelAccentColor?: string;
  isLiveNow: boolean;
  appointment: ChannelAppointment | null;
  liveOffsetSeconds: number | null;
  nextAiringAt: {
    dayName: string;
    minuteOfDay: number;
    minutesUntil: number;
    isoString: string;
  } | null;
  message?: string;
}

export interface RegisteredShowSummary {
  id: string;
  prefix: string;
  title: string;
  channelNumber: number;
  posterPath: string | null;
  totalSeasons: number;
  totalCodes: number;
}

export interface CodeLookupResult {
  code: string;
  showTitle: string;
  showPrefix: string;
  channelNumber: number;
  posterPath: string | null;
  season: number;
  episode: number;
  episodeTitle: string | null;
  airDate: string | null;
}

interface ChannelRemoteProps {
  onTuneIn: (media: MediaSearchResult, startOffsetSeconds?: number) => void;
  /** Called when a show episode code is resolved to an air date */
  onNavigateDate: (isoDate: string) => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatMinutes(m: number): string {
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

function formatDateDisplay(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const parts = iso.split("-").map(Number);
    if (parts.length === 3) {
      const date = new Date(parts[0], parts[1] - 1, parts[2]);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  } catch {
    // fallback
  }
  return iso;
}

/* ─── Numpad Layout ──────────────────────────────────────────────────────── */

const NUMPAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["CLR", "0", "GO"],
] as const;

type NumKey = (typeof NUMPAD)[number][number];

/* ─── Main Component ─────────────────────────────────────────────────────── */

export function ChannelRemote({ onTuneIn, onNavigateDate }: ChannelRemoteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"networks" | "shows">("networks");
  const [shows, setShows] = useState<RegisteredShowSummary[]>([]);
  const [selectedShow, setSelectedShow] = useState<RegisteredShowSummary | null>(null);

  const [digits, setDigits] = useState("");
  const [isIRActive, setIsIRActive] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "not-found" | "upcoming" | "done" | "navigating"
  >("idle");
  const [result, setResult] = useState<ChannelResponse | null>(null);
  const [codeResult, setCodeResult] = useState<CodeLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remoteRef = useRef<HTMLDivElement>(null);

  // Trigger infrared indicator blink
  const pulseIR = useCallback(() => {
    setIsIRActive(true);
    setTimeout(() => setIsIRActive(false), 120);
  }, []);

  // Fetch registered shows when opened
  useEffect(() => {
    let cancelled = false;
    if (isOpen) {
      fetch("/api/codes/shows")
        .then((res) => res.json())
        .then((data: { shows?: RegisteredShowSummary[] }) => {
          if (!cancelled && data.shows) {
            setShows(data.shows);
          }
        })
        .catch(() => {
          // non-critical
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const reset = useCallback(() => {
    setDigits("");
    setStatus("idle");
    setResult(null);
    setCodeResult(null);
    setError(null);
  }, []);

  const clearAll = useCallback(() => {
    setSelectedShow(null);
    reset();
  }, [reset]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    clearAll();
  }, [clearAll]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (remoteRef.current && !remoteRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen, handleClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  const handleTune = useCallback(async () => {
    if (!digits || digits.length === 0) return;
    pulseIR();

    // ── 1. SHOW EPISODE CODE MODE ───────────────────────────────────────────
    if (selectedShow) {
      if (digits.length < 4) {
        setError(`Type 4 digits for ${selectedShow.prefix} (e.g. 0101).`);
        setStatus("not-found");
        return;
      }

      const fullCode = `${selectedShow.prefix}${digits.slice(0, 4)}`;
      setStatus("loading");
      setError(null);
      setCodeResult(null);

      try {
        const res = await fetch(`/api/codes/lookup?code=${encodeURIComponent(fullCode)}`);
        const data: CodeLookupResult & { error?: string } = await res.json();

        if (!res.ok || data.error) {
          setError(data.error ?? `Code "${fullCode}" not found.`);
          setStatus("not-found");
          return;
        }

        setCodeResult(data);

        if (!data.airDate) {
          setError(`No air date found for ${fullCode}.`);
          setStatus("not-found");
          return;
        }

        setStatus("navigating");
        setTimeout(() => {
          handleClose();
          onNavigateDate(data.airDate!);
        }, 700);
      } catch {
        setError("Failed to lookup show code.");
        setStatus("not-found");
      }
      return;
    }

    // ── 2. NETWORK CHANNEL DIRECT-DIAL MODE ─────────────────────────────────
    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/schedule/channel?number=${digits}`);
      const data: ChannelResponse = await res.json();

      if (!res.ok) {
        setError((data as unknown as { error: string }).error ?? "Channel not found.");
        setStatus("not-found");
        return;
      }

      setResult(data);

      if (!data.appointment) {
        setStatus("not-found");
        return;
      }

      if (data.isLiveNow) {
        const searchRes = await fetch(
          `/api/tmdb/search?query=${encodeURIComponent(data.appointment.title)}`,
        );
        const searchData: { results?: MediaSearchResult[] } = await searchRes.json();
        const match =
          searchData.results?.find(
            (r) =>
              r.tmdbId === data.appointment!.tmdbId &&
              r.mediaType === data.appointment!.mediaType,
          ) ??
          searchData.results?.[0] ??
          null;

        if (!match) {
          setStatus("not-found");
          setError(`Couldn't find "${data.appointment.title}" to play.`);
          return;
        }

        setStatus("done");
        setTimeout(() => {
          handleClose();
          onTuneIn(match, data.liveOffsetSeconds ?? undefined);
        }, 700);
      } else {
        setStatus("upcoming");
      }
    } catch {
      setStatus("not-found");
      setError("Failed to reach the channel.");
    }
  }, [digits, selectedShow, onTuneIn, onNavigateDate, pulseIR, handleClose]);

  // Keyboard input while open
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pulseIR();
        const maxLen = selectedShow ? 4 : 2;
        setDigits((prev) => (prev.length < maxLen ? prev + e.key : prev));
        setStatus("idle");
        setResult(null);
        setError(null);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        pulseIR();
        setDigits((prev) => prev.slice(0, -1));
        setStatus("idle");
        setResult(null);
        setError(null);
      } else if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void handleTune();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, selectedShow, handleTune, pulseIR]);

  const handleKey = useCallback(
    (key: NumKey) => {
      pulseIR();
      if (key === "CLR") {
        if (digits.length > 0) {
          reset();
        } else if (selectedShow) {
          setSelectedShow(null);
        }
        return;
      }
      if (key === "GO") {
        void handleTune();
        return;
      }
      const maxLen = selectedShow ? 4 : 2;
      setDigits((prev) => (prev.length < maxLen ? prev + key : prev));
      setStatus("idle");
      setResult(null);
      setError(null);
    },
    [handleTune, reset, selectedShow, digits.length, pulseIR],
  );

  // Active channel preview when typing channel number
  const dialChannelNumber = parseInt(digits, 10);
  const dialedChannel = useMemo(
    () => (!selectedShow && !isNaN(dialChannelNumber) ? getChannel(dialChannelNumber) : null),
    [selectedShow, dialChannelNumber],
  );

  /* ─── Mode & Status Rendering ────────────────────────────────────────────── */

  function renderDisplay() {
    if (selectedShow) {
      const sPart = digits.slice(0, 2).padEnd(2, "_");
      const ePart = digits.slice(2, 4).padEnd(2, "_");
      return (
        <div className="flex h-7 items-center justify-center gap-2 font-mono text-xl font-bold tracking-widest text-cyan-400">
          <span className="rounded bg-cyan-950/90 px-1.5 py-0.5 text-xs font-black text-cyan-300 border border-cyan-800/60">
            {selectedShow.prefix}
          </span>
          <span>
            {sPart} {ePart}
          </span>
        </div>
      );
    }

    // Direct Channel dialer (e.g. CH 02)
    return (
      <div className="flex h-7 items-center justify-center gap-1.5 font-mono">
        <span className="text-xs font-bold tracking-widest text-neutral-500 uppercase">
          CH
        </span>
        <span className="text-xl font-bold tracking-[0.2em] text-emerald-400">
          {digits ? digits.padStart(2, "0") : "--"}
        </span>
      </div>
    );
  }

  function renderStatusLine() {
    if (status === "loading")
      return <span className="text-[10px] uppercase tracking-wider text-yellow-400 animate-pulse">Tuning Broadcast…</span>;
    if (status === "navigating") {
      const targetDate = codeResult?.airDate ? formatDateDisplay(codeResult.airDate) : "date";
      return <span className="text-[10px] uppercase tracking-wider text-cyan-300 animate-pulse">Tuning to {targetDate}…</span>;
    }
    if (status === "done")
      return <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">● ON AIR</span>;
    if (status === "not-found")
      return <span className="text-[10px] uppercase tracking-wider text-red-400 font-medium">{error ?? "No Signal"}</span>;
    if (status === "upcoming" && result?.nextAiringAt)
      return (
        <span className="text-[10px] uppercase tracking-wider text-neutral-400 truncate">
          {result.nextAiringAt.dayName} · {formatMinutes(result.nextAiringAt.minuteOfDay)}
        </span>
      );

    // Idle descriptions
    if (selectedShow) {
      const s = parseInt(digits.slice(0, 2), 10);
      const e = parseInt(digits.slice(2, 4), 10);
      if (digits.length === 4 && !isNaN(s) && !isNaN(e)) {
        return <span className="text-[10px] uppercase tracking-wider text-cyan-400">Season {s}, Episode {e}</span>;
      }
      return <span className="text-[10px] uppercase tracking-wider text-neutral-500">Type Season/Ep (e.g. 0101)</span>;
    }

    if (digits.length === 0)
      return <span className="text-[10px] uppercase tracking-wider text-neutral-500">Pick Network or Dial (2–12)</span>;
    if (dialedChannel)
      return (
        <span
          className="text-[10px] uppercase tracking-wider font-semibold truncate"
          style={{ color: dialedChannel.accentColor }}
        >
          {dialedChannel.name}
        </span>
      );
    return <span className="text-[10px] uppercase tracking-wider text-neutral-400">CH {digits}</span>;
  }

  return (
    <>
      {/* Floating Trigger Button (Positioned above bottom nav on mobile: bottom-20 / pb-safe) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            reset();
          }}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 sm:z-50 flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/90 text-neutral-200 shadow-2xl shadow-black/80 backdrop-blur-md transition-all hover:border-cyan-500/50 hover:bg-neutral-800 hover:text-white hover:scale-105 active:scale-95 group"
          title="Open Remote Control"
          aria-label="Open Channel Remote"
        >
          <Tv className="h-5 w-5 text-neutral-300 transition-colors group-hover:text-cyan-300" />
        </button>
      )}

      {/* Handheld Remote Body (Floats above mobile bottom nav without overlap) */}
      {isOpen && (
        <div
          ref={remoteRef}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-64 max-w-[calc(100vw-2rem)] select-none overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl shadow-black/90 backdrop-blur-xl animate-slide-up-remote"
        >
          {/* Top Bar: IR LED Indicator & Close Button */}
          <div className="flex h-9 items-center justify-between border-b border-neutral-900 px-3.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full transition-all duration-100 ${isIRActive
                    ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] scale-110"
                    : "bg-neutral-800"
                  }`}
              />
              <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">
                Remote
              </span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:text-white transition-colors active:scale-95"
              aria-label="Close remote"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-2.5">
            {/* ── Virtual CRT Segment Display ── */}
            <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/90 p-2 text-center shadow-inner relative overflow-hidden">
              {/* Scanline CRT overlay effect */}
              <div
                className="pointer-events-none absolute inset-0 opacity-15"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 4px)",
                }}
              />

              {/* Row 1: Channel/Show Indicator */}
              <div className="mb-0.5">{renderDisplay()}</div>

              {/* Row 2: Airing Title Preview */}
              <div className="h-4 flex items-center justify-center overflow-hidden">
                {result?.appointment ? (
                  <p className="truncate text-[10px] font-medium text-neutral-300">
                    {result.appointment.title}
                  </p>
                ) : (
                  <span className="text-[10px] text-neutral-600 font-mono tracking-widest">
                    {digits ? "SELECTING…" : "STANDBY"}
                  </span>
                )}
              </div>

              {/* Row 3: Status Line (Fixed Height Container) */}
              <div className="h-4 flex items-center justify-center border-t border-neutral-900/80 pt-0.5 truncate">
                {renderStatusLine()}
              </div>
            </div>

            {/* ── Mode Switcher Tabs ── */}
            <div className="flex h-8 items-center rounded-lg bg-neutral-900 p-0.5 border border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("networks");
                  if (selectedShow) clearAll();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${activeTab === "networks" && !selectedShow
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                  }`}
              >
                <Radio className="h-3 w-3" />
                Networks
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("shows")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${activeTab === "shows" || selectedShow
                    ? "bg-cyan-950 text-cyan-300 border border-cyan-800/40"
                    : "text-neutral-500 hover:text-neutral-300"
                  }`}
              >
                <Film className="h-3 w-3" />
                Shows
              </button>
            </div>

            {/* Sub-Selector Quick Bar (Fixed Height) */}
            <div className="h-7 flex items-center overflow-x-auto scrollbar-none no-scrollbar">
              {activeTab === "networks" && !selectedShow && (
                <div className="flex gap-1 w-full">
                  {CHANNELS.map((ch) => {
                    const isCur = digits === String(ch.number);
                    return (
                      <button
                        key={ch.number}
                        type="button"
                        onClick={() => {
                          pulseIR();
                          setDigits(String(ch.number));
                        }}
                        className={`flex items-center gap-1 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all active:scale-95 ${isCur
                            ? "border border-neutral-600 bg-neutral-800 text-white"
                            : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                          }`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: ch.accentColor }}
                        />
                        <span>{ch.name.split("·")[1]?.trim() ?? `CH ${ch.number}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(activeTab === "shows" || selectedShow) && (
                <div className="flex gap-1.5 w-full">
                  {shows.length === 0 ? (
                    <span className="text-[10px] text-neutral-500 italic">No registered shows assigned</span>
                  ) : (
                    shows.map((show) => {
                      const isSel = selectedShow?.id === show.id;
                      const channel = getChannel(show.channelNumber);
                      return (
                        <button
                          key={show.id}
                          type="button"
                          onClick={() => {
                            pulseIR();
                            setSelectedShow(isSel ? null : show);
                            reset();
                          }}
                          className={`flex items-center gap-1 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all active:scale-95 ${isSel
                              ? "border border-cyan-700 bg-cyan-950 text-cyan-200"
                              : "border border-neutral-800 bg-neutral-900/70 text-neutral-400 hover:border-neutral-700 hover:text-white"
                            }`}
                        >
                          <span className="font-mono text-[9px] font-bold text-cyan-400 bg-cyan-950 px-1 rounded border border-cyan-800/50">
                            {show.prefix}
                          </span>
                          <span className="truncate max-w-[85px]">{show.title}</span>
                          {channel && (
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: channel.accentColor }}
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* ── Numpad ── */}
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              {NUMPAD.flat().map((key) => {
                const isGo = key === "GO";
                const isClear = key === "CLR";

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKey(key)}
                    disabled={status === "loading" || status === "done" || status === "navigating"}
                    className={`
                      flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-all active:scale-95 active:translate-y-0.5
                      ${isGo
                        ? "border border-emerald-800/60 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60 shadow-sm shadow-emerald-950/40"
                        : isClear
                          ? "border border-neutral-800 bg-neutral-900 text-red-400 hover:bg-neutral-800 hover:text-red-300"
                          : "border border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
                      }
                      disabled:opacity-40 disabled:cursor-not-allowed
                    `}
                    aria-label={isGo ? "Tune in" : isClear ? "Clear" : `Digit ${key}`}
                  >
                    {isGo ? (
                      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider">
                        GO <CornerDownLeft className="h-3 w-3" />
                      </span>
                    ) : isClear ? (
                      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider">
                        <Delete className="h-3 w-3" /> CLR
                      </span>
                    ) : (
                      key
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
