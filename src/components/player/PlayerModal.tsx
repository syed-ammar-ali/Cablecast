"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import type { MediaSearchResult, ShowDetails } from "@/types/media";
import type { ScheduleEntry } from "@/types/schedule";

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

  const showPlayer = Boolean(directBroadcast) || !isTv || (details && !isLoadingDetails);

  return (
    <div className="fixed inset-0 z-50 bg-black animate-in fade-in">
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
      ) : !media || !showPlayer ? (
        <div className="relative flex h-full w-full items-center justify-center bg-black text-neutral-500">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-full border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:text-white active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <Loader2 className="h-8 w-8 animate-spin" />
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
          title={isTv ? `${media.title} · S${season}E${episode}` : media.title}
          onClose={onClose}
        />
      )}
    </div>
  );
}
