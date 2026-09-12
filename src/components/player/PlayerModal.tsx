"use client";

import { useEffect, useState } from "react";
import { Loader2, X, ShoppingBag, Zap } from "lucide-react";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import type { MediaSearchResult, ShowDetails } from "@/types/media";
import type { ScheduleEntry } from "@/types/schedule";
import { notifyLibraryMutation, notifyBroadcastMutation } from "@/lib/syncEvents";
import { triggerHaptic } from "@/lib/haptics";

/**
 * A single, already-resolved embed URL with no fallback chain — used for
 * News/Sports World Guide broadcasts, which have exactly one candidate
 * source (an official live stream, a news archive recording, or a
 * highlights upload) rather than a TMDB id to run through the 20-provider
 * fallback engine in `VideoPlayer`. See `src/lib/broadcastCategory.ts`.
 */
export interface DirectBroadcast {
  embedUrl: string;
  /** Shown as a banner over the player, e.g. "Official Live Stream", "Highlights Only — Not Live". */
  label: string;
  title: string;
}

interface PlayerModalProps {
  media?: MediaSearchResult;
  onClose: () => void;
  /** Pre-selects season/episode, e.g. when tuning in from a scheduled appointment. */
  initialSeason?: number;
  initialEpisode?: number;
  /** Seconds to seek to on load — used to sync a live "on air" tune-in. */
  startOffsetSeconds?: number;
  /** Scheduled start time of the program (ISO string, timestamp, or Date) for exact real-time live clock sync. */
  startTime?: number | string | Date;
  /** The full appointment this came from, if tuned in live from the TV Guide. */
  initialLiveEntry?: ScheduleEntry;
  /** When set, renders this single resolved source directly instead of `media`. */
  directBroadcast?: DirectBroadcast;
  country?: string;
}

export function PlayerModal({
  media,
  onClose,
  initialSeason,
  initialEpisode,
  startOffsetSeconds = 0,
  startTime,
  initialLiveEntry,
  directBroadcast,
  country,
}: PlayerModalProps) {
  const isTv = !directBroadcast && media?.mediaType === "tv";

  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [season, setSeason] = useState(initialSeason ?? 1);
  const episode = initialEpisode ?? 1;

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ── Screen WakeLock API: keeps phone screen awake during streaming ──
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    async function requestLock() {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator && !released) {
        try {
          sentinel = await navigator.wakeLock.request("screen");
        } catch {
          // WakeLock may fail if low battery or permission denied; ignore safely
        }
      }
    }

    void requestLock();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !released) {
        void requestLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinel) {
        sentinel.release().catch(() => {});
      }
    };
  }, []);

  // ── MediaSession API: populates lock screen & Bluetooth playback info ──
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const displayTitle = directBroadcast?.title || media?.title || "Live Broadcast";
    const displayArtist = isTv
      ? `Season ${season}, Episode ${episode}`
      : directBroadcast?.label || "Cablecast Retro TV";
    const artworkUrl = media?.posterUrl || "/icon-512.png";

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle,
        artist: displayArtist,
        album: "Cablecast",
        artwork: [
          { src: artworkUrl, sizes: "512x512", type: "image/png" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
      });
      navigator.mediaSession.playbackState = "playing";
    } catch {
      // Ignore
    }

    const actionHandlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["stop", () => onClose()],
      [
        "pause",
        () => {
          try {
            navigator.mediaSession.playbackState = "paused";
          } catch {}
        },
      ],
      [
        "play",
        () => {
          try {
            navigator.mediaSession.playbackState = "playing";
          } catch {}
        },
      ],
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported action types
      }
    }

    return () => {
      try {
        navigator.mediaSession.playbackState = "none";
      } catch {
        // Ignore
      }
      for (const [action] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore
        }
      }
    };
  }, [directBroadcast, media, isTv, season, episode, onClose]);

  // Only fetched to default `season` to the show's actual first season
  // (e.g. some shows start at 0 for specials) when the caller didn't pass
  // one explicitly — there's no in-player season/episode switcher anymore.
  useEffect(() => {
    if (!isTv || !media?.tmdbId) return;

    let cancelled = false;

    fetch(`/api/tmdb/details?tmdbId=${media.tmdbId}&mediaType=tv`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load show details (${res.status})`);
        return res.json() as Promise<ShowDetails>;
      })
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        if (
          initialSeason === undefined ||
          (data.seasons.length > 0 && !data.seasons.some((s) => s.seasonNumber === initialSeason))
        ) {
          setSeason(data.seasons[0]?.seasonNumber ?? 1);
        }
      })
      .catch(() => {
        // Non-fatal — worst case `season` just stays at its initial/default value.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isTv, media?.tmdbId, initialSeason]);

  // Check season tape vault ownership for TV broadcasts
  const [isSeasonOwned, setIsSeasonOwned] = useState<boolean | null>(null);
  const [isCheckingOwnership, setIsCheckingOwnership] = useState(false);
  const [isPurchasingTape, setIsPurchasingTape] = useState(false);

  useEffect(() => {
    if (!isTv || !media?.tmdbId) {
      setIsSeasonOwned(true);
      return;
    }

    let cancelled = false;
    setIsCheckingOwnership(true);

    fetch(`/api/vhs/action?mediaId=${media.tmdbId}&season=${season}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setIsSeasonOwned(Boolean(data?.isValid || data?.isOwned || data?.isRented));
      })
      .catch(() => {
        if (!cancelled) setIsSeasonOwned(true);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingOwnership(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isTv, media?.tmdbId, season]);

  const handleBuySeasonTape = async () => {
    if (!media?.tmdbId) return;
    setIsPurchasingTape(true);
    triggerHaptic(12);

    try {
      const res = await fetch("/api/vhs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BUY",
          mediaId: media.tmdbId,
          mediaType: "tv",
          seasonNumber: season,
          meta: {
            title: media.title,
            posterPath: media.posterUrl,
            backdropUrl: media.backdropUrl,
            releaseYear: media.releaseYear,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to acquire tape.");
      }

      notifyLibraryMutation();
      notifyBroadcastMutation();
      setIsSeasonOwned(true);
    } catch (err) {
      console.error("[PlayerModal] Failed to buy tape:", err);
    } finally {
      setIsPurchasingTape(false);
    }
  };

  const showPlayer = Boolean(directBroadcast) || !isTv || (details && !isLoadingDetails);

  return (
    <div className="fixed inset-0 z-[100] bg-black animate-in fade-in">
      {directBroadcast ? (
        <div className="relative h-full w-full bg-black">
          <iframe
            key={directBroadcast.embedUrl}
            src={directBroadcast.embedUrl}
            title={directBroadcast.title}
            className="absolute inset-0 h-full w-full border-0"
            width="100%"
            height="100%"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />

          {/* Top-left broadcast badge: strictly fits its shape, pointer-events-auto */}
          <div className="pointer-events-auto absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 max-w-[50vw] sm:max-w-[320px] rounded-lg border border-neutral-800/80 bg-black/85 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="truncate">{directBroadcast.label}</span>
            </p>
            {directBroadcast.title && (
              <p className="truncate text-xs sm:text-sm font-semibold text-neutral-100">{directBroadcast.title}</p>
            )}
          </div>

          {/* Top-right close button: strictly fits its shape, pointer-events-auto */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close broadcast"
            className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-full border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:text-white active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : !media || !showPlayer || isCheckingOwnership ? (
        <div className="relative flex h-full w-full items-center justify-center bg-black text-neutral-500">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-full border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:text-white active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      ) : isTv && isSeasonOwned === false ? (
        /* Retro CRT Signal Restricted - Tape Not in Vault Screen */
        <div className="relative flex h-full w-full flex-col items-center justify-center bg-neutral-950 p-4 text-center select-none overflow-hidden">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-full border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:text-white active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Retro CRT Scanlines & Vignette */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_black_90%)] opacity-80 z-10" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.45)_50%)] bg-[length:100%_4px] opacity-50 z-10" />

          {/* SMPTE Color Bars Header */}
          <div className="w-full max-w-md h-3 flex overflow-hidden rounded-t-xl mb-0 border-t border-x border-neutral-800 shadow-lg z-20">
            <div className="flex-1 bg-[#c0c0c0]" />
            <div className="flex-1 bg-[#c0c000]" />
            <div className="flex-1 bg-[#00c0c0]" />
            <div className="flex-1 bg-[#00c000]" />
            <div className="flex-1 bg-[#c000c0]" />
            <div className="flex-1 bg-[#c00000]" />
            <div className="flex-1 bg-[#0000c0]" />
          </div>

          <div className="relative z-20 w-full max-w-md rounded-b-2xl border border-neutral-800 bg-black/95 p-6 shadow-2xl backdrop-blur-md space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-950/60 px-3 py-1 text-[11px] font-mono font-bold text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                <span>SIGNAL RESTRICTED // MASTER TAPE REQUIRED</span>
              </div>

              <h2 className="text-lg font-bold text-white mt-1">{media?.title}</h2>
              <p className="text-xs font-mono text-purple-300">
                Season {season} · Episode {episode}
              </p>
            </div>

            <p className="text-xs text-neutral-400 font-mono leading-relaxed">
              This broadcast is scheduled on your channel lineup, but the physical VHS master tape for <strong className="text-neutral-200">Season {season}</strong> is not preserved in your collection vault.
            </p>

            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={handleBuySeasonTape}
                disabled={isPurchasingTape}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-purple-500/60 bg-purple-950/80 hover:bg-purple-900 text-purple-200 hover:text-white py-3 text-xs font-bold font-mono uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isPurchasingTape ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                    <span>Acquiring Tape from Vault...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4 text-purple-300" />
                    <span>Acquire Season {season} Master Tape</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 py-2.5 text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Return to Broadcast Studio
              </button>
            </div>
          </div>
        </div>
      ) : (
        <VideoPlayer
          key={`embed-${media.tmdbId}-${season}-${episode}`}
          tmdbId={media.tmdbId}
          mediaType={media.mediaType}
          season={season}
          episode={episode}
          startOffsetSeconds={startOffsetSeconds}
          startTime={startTime}
          initialLiveEntry={initialLiveEntry}
          country={country}
          title={isTv ? `${media.title} · S${season}E${episode}` : media.title}
          onClose={onClose}
        />
      )}
    </div>
  );
}
