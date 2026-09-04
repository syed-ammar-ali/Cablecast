"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // Touch-controlled overlay for direct broadcasts (auto-fades after 3.5s)
  const [isDirectControlsVisible, setIsDirectControlsVisible] = useState(true);
  const directControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showDirectControls = useCallback(() => {
    setIsDirectControlsVisible(true);
    if (directControlsTimeoutRef.current) clearTimeout(directControlsTimeoutRef.current);
    directControlsTimeoutRef.current = setTimeout(() => setIsDirectControlsVisible(false), 3500);
  }, []);

  useEffect(() => {
    if (directBroadcast) {
      showDirectControls();
    }
    return () => {
      if (directControlsTimeoutRef.current) clearTimeout(directControlsTimeoutRef.current);
    };
  }, [directBroadcast, showDirectControls]);

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
    <div className="group fixed inset-0 z-50 bg-black animate-in fade-in">
      {directBroadcast ? (
        <div
          className="relative h-full w-full bg-black"
          onClick={showDirectControls}
          onTouchStart={showDirectControls}
        >
          {/* Top tap-catcher to reveal controls on mobile over iframe */}
          <div
            className="absolute top-0 inset-x-0 h-16 z-20 cursor-pointer"
            onClick={showDirectControls}
            onTouchStart={showDirectControls}
            aria-hidden="true"
          />

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

          <div
            className={`pointer-events-none absolute left-4 top-4 z-20 max-w-[70vw] rounded-md border border-neutral-700/50 bg-black/60 px-3 py-2 backdrop-blur-sm transition-opacity duration-300 ${
              isDirectControlsVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              {directBroadcast.label}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close broadcast"
            className={`absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-30 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700/60 bg-black/75 text-neutral-300 backdrop-blur-md transition-all duration-300 hover:text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg ${
              isDirectControlsVisible
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
            }`}
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
            className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-40 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700/60 bg-black/75 text-neutral-300 backdrop-blur-md transition-all duration-200 hover:text-white hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
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
