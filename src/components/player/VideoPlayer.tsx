"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FastForward,
  RadioTower,
  RefreshCw,
  SatelliteDish,
  Tv,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  buildPlayerSource,
  isDynamicProvider,
  listProviders,
  PROVIDER_COUNT,
} from "@/lib/providers";
import { CHANNELS } from "@/config/channels";
import { BLOCK_MINUTES } from "@/lib/runtime";
import {
  getAppointmentEndDate,
  getAppointmentStartDate,
  msUntilNextBlockBoundary,
} from "@/lib/schedule";
import {
  fetchChannelNowPlaying,
  fetchChannelNextUpcoming,
} from "@/lib/liveChannelClient";
import { getRandomBumper, type Bumper } from "@/lib/bumpers";
import { DeadAirScreen } from "@/components/player/DeadAirScreen";
import type { MediaType } from "@/types/media";
import type { ScheduleEntry } from "@/types/schedule";

/** How long the loader waits for an `onLoad` event before assuming a static provider is dead. */
const LOAD_TIMEOUT_MS = 12_000;
/** Extra time given to dynamic providers (YouTube, KissKH, etc.) that need an async search first. */
const DYNAMIC_LOAD_TIMEOUT_MS = 15_000;

interface VideoPlayerProps {
  tmdbId: number | string;
  season?: number;
  episode?: number;
  mediaType: MediaType;
  startOffsetSeconds?: number;
  startTime?: number | string | Date;
  title?: string;
  /**
   * If this playback session started as a live tune-in from the TV Guide,
   * the full appointment it tuned into. Seeds the channel-surfing state so
   * bumper/next-block timers are already armed on mount, not just after the
   * first manual channel change.
   */
  initialLiveEntry?: ScheduleEntry;
  onClose?: () => void;
}

type ScreenMode = "tuning" | "off-air" | "bumper" | "content";

function formatCommercialCountdown(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function VideoPlayer({
  tmdbId,
  season = 1,
  episode = 1,
  mediaType,
  startOffsetSeconds = 0,
  title,
  initialLiveEntry,
  onClose,
}: VideoPlayerProps) {
  const [currentSeason, setCurrentSeason] = useState(season);
  const [currentEpisode, setCurrentEpisode] = useState(episode);

  useEffect(() => {
    setCurrentSeason(season);
  }, [season]);

  useEffect(() => {
    setCurrentEpisode(episode);
  }, [episode]);

  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Dynamic provider state (YouTube, KissKH, DramaCool, Kartoons) --------
  const [dynamicEmbedUrl, setDynamicEmbedUrl] = useState<string | null>(null);
  const dynamicRequestIdRef = useRef(0);

  // --- Manual provider picker (the dropdown next to "Swap Stream") -------
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const providerList = useMemo(() => listProviders(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // --- Channel surfing + live tuning state --------------------------------
  const initialChannelIndex = useMemo(() => {
    const channelNumber = initialLiveEntry?.channelNumber;
    if (channelNumber === undefined) return 0;
    const index = CHANNELS.findIndex((channel) => channel.number === channelNumber);
    return index === -1 ? 0 : index;
  }, [initialLiveEntry]);

  const [channelIndex, setChannelIndex] = useState(initialChannelIndex);

  // Once true, this player is simulating a live broadcast on the channel
  // lineup rather than the originally requested on-demand title — either
  // because it was opened from an "on air now" tune-in, or the user pressed
  // the channel-up/down keys at least once.
  const [isLiveMode, setIsLiveMode] = useState(Boolean(initialLiveEntry));
  const [liveEntry, setLiveEntry] = useState<ScheduleEntry | null>(initialLiveEntry ?? null);
  const [isOffAir, setIsOffAir] = useState(false);
  const [offAirTargetTime, setOffAirTargetTime] = useState<number | null>(null);
  const [isTuningChannel, setIsTuningChannel] = useState(false);
  const [isBumperPhase, setIsBumperPhase] = useState(false);
  const [bumper, setBumper] = useState<Bumper | null>(null);
  const [isBumperMuted, setIsBumperMuted] = useState(true);
  const [nextUpcomingEntry, setNextUpcomingEntry] = useState<ScheduleEntry | null>(null);
  const tuneRequestIdRef = useRef(0);

  const activeChannel = CHANNELS[channelIndex];

  const advanceToNextEpisode = useCallback(() => {
    setIsBumperPhase(false);
    setBumper(null);
    setCurrentEpisode((prev) => prev + 1);
    setCurrentProviderIndex(0);
    setExhausted(false);
    setIsLoading(true);
    setReloadTick((t) => t + 1);
  }, []);

  const screenMode: ScreenMode = !isLiveMode
    ? (isBumperPhase ? "bumper" : "content")
    : isTuningChannel
      ? "tuning"
      : isOffAir
        ? "off-air"
        : isBumperPhase
          ? "bumper"
          : "content";

  const activePlayback = useMemo(() => {
    if (isLiveMode && liveEntry) {
      return {
        tmdbId: liveEntry.tmdbId,
        mediaType: liveEntry.mediaType,
        season: liveEntry.season ?? 1,
        episode: liveEntry.episode ?? 1,
        title: liveEntry.title,
      };
    }
    return {
      tmdbId,
      mediaType,
      season: currentSeason,
      episode: currentEpisode,
      title: title ? title.replace(/·\s*S\d+E\d+/i, `· S${currentSeason}E${currentEpisode}`) : title,
    };
  }, [isLiveMode, liveEntry, tmdbId, mediaType, currentSeason, currentEpisode, title]);

  const contentIdentity = `${activePlayback.tmdbId}-${activePlayback.mediaType}-${activePlayback.season}-${activePlayback.episode}`;

  const currentProvider = providerList[currentProviderIndex] ?? providerList[0];
  const isDynamic = isDynamicProvider(currentProviderIndex);
  // The display title carries a " · S1E1" suffix for TV — strip it so the
  // search query is just the clean show/movie title.
  const searchTitle = (activePlayback.title ?? "").replace(/\s*·\s*S\d+E\d+$/i, "").trim();
  const hasLoadableSource = !isDynamic || Boolean(dynamicEmbedUrl);

  const source = useMemo(() => {
    if (isDynamic) {
      return {
        providerIndex: currentProviderIndex,
        providerId: currentProvider?.id ?? "dynamic",
        providerName: currentProvider?.name ?? "Dynamic Source",
        url: dynamicEmbedUrl ?? "",
        isLastProvider: currentProviderIndex === PROVIDER_COUNT - 1,
      };
    }
    return buildPlayerSource({
      providerIndex: currentProviderIndex,
      tmdbId: activePlayback.tmdbId,
      mediaType: activePlayback.mediaType,
      season: activePlayback.season,
      episode: activePlayback.episode,
    });
  }, [currentProviderIndex, activePlayback, isDynamic, dynamicEmbedUrl, currentProvider]);

  const iframeKey = `${contentIdentity}-${source.providerIndex}-${reloadTick}-${dynamicEmbedUrl ?? "x"}`;

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const advanceProvider = useCallback(() => {
    clearLoadTimeout();
    setCurrentProviderIndex((index) => {
      const next = index + 1;
      if (next >= PROVIDER_COUNT) {
        setExhausted(true);
        return index;
      }
      setIsLoading(true);
      return next;
    });
  }, [clearLoadTimeout]);

  const retryFromTop = useCallback(() => {
    clearLoadTimeout();
    setExhausted(false);
    setIsLoading(true);
    setCurrentProviderIndex(0);
    setReloadTick((tick) => tick + 1);
  }, [clearLoadTimeout]);

  const jumpToProvider = useCallback(
    (index: number) => {
      clearLoadTimeout();
      setExhausted(false);
      setIsLoading(true);
      setCurrentProviderIndex(index);
      setReloadTick((tick) => tick + 1);
      setIsProviderMenuOpen(false);
    },
    [clearLoadTimeout],
  );

  // Close the provider picker on an outside click/tap or Escape.
  useEffect(() => {
    if (!isProviderMenuOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!providerMenuRef.current?.contains(event.target as Node)) {
        setIsProviderMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsProviderMenuOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProviderMenuOpen]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handleIframeLoad = useCallback(() => {
    // The iframe's own document finished loading — that's the real, working
    // signal that this provider produced *something* playable. Clear the
    // watchdog so we stop here instead of yanking away from a source that's
    // actually working.
    clearLoadTimeout();
    setIsLoading(false);
  }, [clearLoadTimeout]);

  const handleIframeError = useCallback(() => {
    advanceProvider();
  }, [advanceProvider]);

  useEffect(() => {
    setCurrentProviderIndex(0);
    setExhausted(false);
    setReloadTick((tick) => tick + 1);
  }, [contentIdentity]);

  // Arm a watchdog timer every time the source changes: most fallback
  // embeds respond with a 200 + broken page rather than a real network
  // error, so `onError` alone can't be trusted to catch a dead source —
  // if `onLoad` doesn't fire within the window, assume it's dead and move
  // on. Dynamic providers (YouTube, KissKH, etc.) get extra time since they
  // need an async search step before any video URL even exists yet.
  useEffect(() => {
    if (exhausted || screenMode !== "content" || !hasLoadableSource) {
      clearLoadTimeout();
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    clearLoadTimeout();
    timeoutRef.current = setTimeout(() => {
      advanceProvider();
    }, isDynamic ? DYNAMIC_LOAD_TIMEOUT_MS : LOAD_TIMEOUT_MS);

    return clearLoadTimeout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProviderIndex, reloadTick, exhausted, screenMode, hasLoadableSource, isDynamic]);

  // Dynamic provider resolver (YouTube, KissKH, DramaCool): searches respective
  // API for a matching stream. If nothing confidently matches, auto-advances to next.
  useEffect(() => {
    if (!isDynamic || exhausted || screenMode !== "content") return;

    const requestId = ++dynamicRequestIdRef.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDynamicEmbedUrl(null);

    const providerId = currentProvider?.id;
    const cleanTitle = searchTitle || String(activePlayback.title ?? "");

    if (providerId === "youtube-official") {
      const params = new URLSearchParams({
        title: cleanTitle,
        mediaType: activePlayback.mediaType,
      });
      if (activePlayback.mediaType === "tv") {
        params.set("season", String(activePlayback.season));
        params.set("episode", String(activePlayback.episode));
      }

      fetch(`/api/youtube/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { match: { videoId: string } | null }) => {
          if (dynamicRequestIdRef.current !== requestId) return;
          if (data.match?.videoId) {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const ytParams = new URLSearchParams({
              autoplay: "1",
              rel: "0",
              modestbranding: "1",
            });
            if (origin) ytParams.set("origin", origin);

            setDynamicEmbedUrl(
              `https://www.youtube.com/embed/${data.match.videoId}?${ytParams.toString()}`,
            );
          } else {
            advanceProvider();
          }
        })
        .catch(() => {
          if (dynamicRequestIdRef.current !== requestId) return;
          advanceProvider();
        });
    } else if (providerId === "kisskh-asian") {
      const params = new URLSearchParams({
        title: cleanTitle,
      });
      if (activePlayback.mediaType === "tv") {
        params.set("season", String(activePlayback.season));
        params.set("episode", String(activePlayback.episode));
      }

      fetch(`/api/kisskh/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { match: { embedUrl: string } | null }) => {
          if (dynamicRequestIdRef.current !== requestId) return;
          if (data.match?.embedUrl) {
            setDynamicEmbedUrl(data.match.embedUrl);
          } else {
            advanceProvider();
          }
        })
        .catch(() => {
          if (dynamicRequestIdRef.current !== requestId) return;
          advanceProvider();
        });
    } else if (providerId === "dramacool-asian") {
      const params = new URLSearchParams({
        title: cleanTitle,
      });
      if (activePlayback.mediaType === "tv") {
        params.set("episode", String(activePlayback.episode));
      }

      fetch(`/api/dramacool/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { match: { embedUrl: string } | null }) => {
          if (dynamicRequestIdRef.current !== requestId) return;
          if (data.match?.embedUrl) {
            setDynamicEmbedUrl(data.match.embedUrl);
          } else {
            advanceProvider();
          }
        })
        .catch(() => {
          if (dynamicRequestIdRef.current !== requestId) return;
          advanceProvider();
        });
    } else if (providerId === "kartoons-direct") {
      const providerSlug = activePlayback.mediaType === "movie" ? "kisscartoon" : "supercartoons";
      const params = new URLSearchParams({
        title: cleanTitle,
        provider: providerSlug,
      });
      if (activePlayback.mediaType === "tv") {
        params.set("season", String(activePlayback.season));
        params.set("episode", String(activePlayback.episode));
      }

      fetch(`/api/cartoons/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { match: { embedUrl: string } | null }) => {
          if (dynamicRequestIdRef.current !== requestId) return;
          if (data.match?.embedUrl) {
            setDynamicEmbedUrl(data.match.embedUrl);
          } else {
            advanceProvider();
          }
        })
        .catch(() => {
          if (dynamicRequestIdRef.current !== requestId) return;
          advanceProvider();
        });
    } else {
      advanceProvider();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDynamic, currentProviderIndex, reloadTick, exhausted, screenMode, contentIdentity]);

  // Re-checks what (if anything) is airing on `channelNumber` right now.
  // Used both after a manual channel change and when a live block rolls
  // over to the next scheduled slot automatically.
  const tuneToChannel = useCallback(async (channelNumber: number) => {
    const requestId = ++tuneRequestIdRef.current;
    const entry = await fetchChannelNowPlaying(channelNumber);
    if (tuneRequestIdRef.current !== requestId) return;

    setIsTuningChannel(false);
    setIsBumperPhase(false);
    setBumper(null);
    if (entry) {
      setLiveEntry(entry);
      setIsOffAir(false);
      setOffAirTargetTime(null);
    } else {
      setLiveEntry(null);
      setIsOffAir(true);
      setOffAirTargetTime(Date.now() + msUntilNextBlockBoundary());
    }
  }, []);

  const cycleChannel = useCallback(
    (direction: 1 | -1) => {
      const nextIndex = (channelIndex + direction + CHANNELS.length) % CHANNELS.length;
      const channel = CHANNELS[nextIndex];

      setChannelIndex(nextIndex);
      setIsLiveMode(true);
      setIsTuningChannel(true);
      setIsBumperPhase(false);
      setBumper(null);
      setLiveEntry(null);
      setIsOffAir(false);
      setOffAirTargetTime(null);

      void tuneToChannel(channel.number);
    },
    [channelIndex, tuneToChannel],
  );

  const enterBumperPhase = useCallback(() => {
    setIsBumperPhase(true);
    setBumper((prev) => getRandomBumper(prev?.id));
    if (isLiveMode) {
      void fetchChannelNextUpcoming(activeChannel.number).then((nextEntry) => {
        if (nextEntry) {
          setNextUpcomingEntry(nextEntry);
        }
      });
    }
  }, [isLiveMode, activeChannel.number]);

  const handleAdvanceToNextProgram = useCallback(() => {
    setIsBumperPhase(false);
    setBumper(null);
    setNextUpcomingEntry(null);
    if (isLiveMode) {
      void tuneToChannel(activeChannel.number);
    } else if (mediaType === "tv") {
      advanceToNextEpisode();
    }
  }, [isLiveMode, tuneToChannel, activeChannel.number, mediaType, advanceToNextEpisode]);

  // Target time for next scheduled program during commercial break
  const nextProgramTargetTimeMs = useMemo(() => {
    if (!isLiveMode) return null;
    if (nextUpcomingEntry) {
      return getAppointmentStartDate(nextUpcomingEntry).getTime();
    }
    if (liveEntry) {
      return getAppointmentEndDate(liveEntry).getTime();
    }
    return null;
  }, [isLiveMode, nextUpcomingEntry, liveEntry]);

  const handleBumperEnded = useCallback(() => {
    // If we are in live broadcast mode, check if the next program's scheduled start time has arrived!
    if (isLiveMode) {
      const nextTargetMs = nextProgramTargetTimeMs;
      if (nextTargetMs && Date.now() >= nextTargetMs) {
        handleAdvanceToNextProgram();
        return;
      }
    }
    // For on-demand TV show binging, advance to next episode after the commercial break
    if (!isLiveMode && mediaType === "tv") {
      handleAdvanceToNextProgram();
      return;
    }
    // Otherwise, continue endless loop through randomized retro commercials
    setBumper((prev) => getRandomBumper(prev?.id));
  }, [isLiveMode, nextProgramTargetTimeMs, mediaType, handleAdvanceToNextProgram]);

  const [secondsUntilNextProgram, setSecondsUntilNextProgram] = useState<number | null>(null);

  useEffect(() => {
    if (screenMode !== "bumper" || !nextProgramTargetTimeMs) {
      setSecondsUntilNextProgram(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((nextProgramTargetTimeMs - Date.now()) / 1000));
      setSecondsUntilNextProgram(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [screenMode, nextProgramTargetTimeMs]);

  // The dynamic broadcast clock:
  // 1. Plays the entire episode from 00:00 without skipping or cutting content.
  // 2. Automatically rolls retro commercials only after the episode completes.
  // 3. Hands off to the next program when its scheduled airtime arrives.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (isLiveMode) {
      const channelNumber = activeChannel.number;

      if (isOffAir) {
        const delay = msUntilNextBlockBoundary();
        timers.push(
          setTimeout(() => {
            if (activeChannel.number === channelNumber) {
              void tuneToChannel(channelNumber);
            }
          }, delay),
        );
      }

      if (liveEntry) {
        // Episode content duration based on TMDB runtime
        const effectiveRuntimeMinutes =
          liveEntry.runtimeMinutes && liveEntry.runtimeMinutes > 0
            ? liveEntry.runtimeMinutes
            : liveEntry.mediaType === "movie"
            ? 105
            : liveEntry.blockCount
            ? Math.min(liveEntry.blockCount * 30 - 6, 24)
            : 22;
        const contentDurationMs = effectiveRuntimeMinutes * 60 * 1000;

        // Commercial break trigger: only fires after the viewer has completed watching the full show.
        // Anchored to active playback (does not count loader / provider search time against runtime).
        if (!isLoading && !exhausted && screenMode === "content") {
          timers.push(setTimeout(enterBumperPhase, contentDurationMs));
        }

        // Block end trigger: when the block officially ends, if we are in commercial break, roll to next show
        const blockEndMs = Math.max(0, getAppointmentEndDate(liveEntry).getTime() - Date.now());
        if (blockEndMs > 0) {
          timers.push(
            setTimeout(() => {
              if (activeChannel.number === channelNumber) {
                setIsBumperPhase((currentBumperPhase) => {
                  if (currentBumperPhase) {
                    void tuneToChannel(channelNumber);
                    return false;
                  }
                  return currentBumperPhase;
                });
              }
            }, blockEndMs),
          );
        }
      }
    } else {
      // On-demand playback: roll retro commercial break when episode runtime elapses
      if (!isLoading && !exhausted && screenMode === "content") {
        const estimatedMinutes = mediaType === "movie" ? 105 : 24;
        const contentDurationMs = estimatedMinutes * 60 * 1000;
        timers.push(setTimeout(enterBumperPhase, contentDurationMs));
      }
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveMode, isOffAir, liveEntry?.id, activeChannel.number, mediaType, enterBumperPhase, tuneToChannel, isLoading, exhausted, screenMode]);

  const displayTitle = !isLiveMode
    ? title ?? "Now Playing"
    : screenMode === "off-air"
      ? "No Signal"
      : screenMode === "bumper"
        ? bumper?.label ?? "Station Break"
        : screenMode === "tuning"
          ? `Tuning ${activeChannel.name}...`
          : liveEntry?.title ?? title ?? "Now Playing";

  // Desktop keyboard shortcuts: arrow keys cycle live channels, escape closes
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        ["input", "textarea"].includes((document.activeElement?.tagName || "").toLowerCase())
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          cycleChannel(1);
          break;
        case "ArrowDown":
          event.preventDefault();
          cycleChannel(-1);
          break;
        case "Escape":
          onClose?.();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleChannel, onClose]);

  const isLiveNow = isLiveMode && screenMode === "content";
  // Once a third-party provider's iframe is actually up and playing, it
  // almost always renders its own title/episode UI baked into the video —
  // showing our own title text on top of that just duplicates it. Only the
  // status tags below (live), which the provider has no way of
  // knowing about, are still worth surfacing at that point.
  const isProviderUiVisible =
    screenMode === "content" && hasLoadableSource && !exhausted && !isLoading && (!isDynamic || Boolean(dynamicEmbedUrl));
  const showNameInBadge = !isProviderUiVisible;
  const showBadge = showNameInBadge || isLiveNow;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-black"
    >
      {/* Screen — fills the entire player with no invisible touch blockers */}
      <div className="relative h-full w-full bg-black">
        {screenMode === "content" && !exhausted && hasLoadableSource && (
          <div className="relative h-full w-full">
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={source.url}
              title={displayTitle}
              className="absolute inset-0 h-full w-full border-0"
              width="100%"
              height="100%"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy={
                currentProvider?.id === "youtube-official"
                  ? "strict-origin-when-cross-origin"
                  : "no-referrer"
              }
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </div>
        )}

        {screenMode === "off-air" && (
          <DeadAirScreen
            channel={activeChannel}
            nextProgramTitle={liveEntry?.title}
            nextProgramStartTime={offAirTargetTime ?? undefined}
            onProgramStart={() => {
              void tuneToChannel(activeChannel.number);
            }}
          />
        )}

        {screenMode === "bumper" && bumper && (
          <div className="absolute inset-0 bg-black">
            <video
              key={bumper.id}
              src={bumper.url}
              className="absolute inset-0 h-full w-full object-contain"
              autoPlay
              muted={isBumperMuted}
              playsInline
              onEnded={handleBumperEnded}
            />
            {/* CRT Scanline and Phosphor Glow Layer for authentic broadcast feel */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 2px)",
              }}
            />
            {/* Retro station ID, commercial category & audio toggle badge overlay */}
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-20 flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-black/85 p-2.5 sm:p-3 font-mono text-xs text-amber-400 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.25)] max-w-[calc(100vw-2rem)] sm:max-w-md pointer-events-auto">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 truncate">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                  <span className="font-bold tracking-widest truncate">{bumper.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBumperMuted((prev) => !prev)}
                  className="flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-950/50 hover:bg-amber-900/70 px-2 py-1 text-[10px] font-mono text-amber-300 hover:text-white transition-all active:scale-95 cursor-pointer touch-manipulation shrink-0 shadow-sm"
                  title={isBumperMuted ? "Unmute commercial audio" : "Mute commercial audio"}
                >
                  {isBumperMuted ? (
                    <VolumeX className="h-3.5 w-3.5 text-neutral-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  )}
                  <span>{isBumperMuted ? "Unmute Ad" : "Audio On"}</span>
                </button>
              </div>
              {bumper.categoryLabel && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] sm:text-[10px] text-amber-200/80 uppercase tracking-widest truncate">
                    {bumper.categoryLabel}
                  </span>
                  <span className="text-[9px] text-neutral-500">·</span>
                  <span className="text-[9px] text-neutral-400 uppercase tracking-wider">
                    Commercial Break
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {screenMode === "tuning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/95 text-neutral-300">
            <RadioTower className="h-10 w-10 animate-pulse" />
            <p className="text-sm uppercase tracking-widest">Tuning {activeChannel.name}...</p>
          </div>
        )}

        {screenMode === "content" && isDynamic && !dynamicEmbedUrl && !exhausted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 text-neutral-300">
            <RadioTower className="h-10 w-10 animate-pulse" />
            <p className="text-sm uppercase tracking-widest">Searching {currentProvider?.name}...</p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full w-1/3 animate-[loading-scan_1.2s_ease-in-out_infinite] bg-neutral-400" />
            </div>
          </div>
        )}

        {screenMode === "content" && hasLoadableSource && isLoading && !exhausted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 text-neutral-300">
            <RadioTower className="h-10 w-10 animate-pulse" />
            <p className="text-sm uppercase tracking-widest">Tuning into {source.providerName}...</p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full w-1/3 animate-[loading-scan_1.2s_ease-in-out_infinite] bg-neutral-400" />
            </div>
          </div>
        )}

        {screenMode === "content" && exhausted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center text-neutral-300">
            <SatelliteDish className="h-10 w-10" />
            <p className="text-sm uppercase tracking-widest">
              All broadcast feeds exhausted — no signal detected.
            </p>
            <button
              type="button"
              onClick={retryFromTop}
              className="flex items-center gap-2 rounded-md border border-neutral-600 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-neutral-200 transition-colors hover:bg-white/10 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Retry From Feed 1
            </button>
          </div>
        )}

        {/* ── 1. Top-Left Sticky Component: On-Air / Program Badge ─────────────── */}
        {showBadge && (
          <div
            className="pointer-events-auto absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex max-w-[48vw] sm:max-w-[320px] flex-col rounded-lg border border-neutral-800/80 bg-black/85 px-2.5 py-1.5 shadow-lg backdrop-blur-md"
          >
            {screenMode === "bumper" ? (
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold tracking-wider text-amber-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                <span>COMMERCIAL BREAK</span>
              </div>
            ) : (
              <>
                {isLiveNow && (
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                    <span className="truncate">
                      CH {String(activeChannel.number).padStart(2, "0")} · On Air
                    </span>
                  </p>
                )}
                {showNameInBadge && (
                  <p className="truncate text-xs sm:text-sm font-semibold text-neutral-100">{displayTitle}</p>
                )}
                {isLiveNow && <p className="truncate text-[10px] text-neutral-400">{activeChannel.name}</p>}
              </>
            )}
          </div>
        )}

        {/* ── 2. Top-Right Sticky Component: Stream Switcher, Next Show & Close ── */}
        <div
          className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex items-center gap-1.5 sm:gap-2"
        >
          {screenMode === "bumper" ? (
            <>
              {/* Next Program / Episode countdown pill */}
              <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-neutral-800/90 bg-black/85 px-2 sm:px-2.5 py-1.5 font-mono text-xs backdrop-blur-md shadow-lg">
                <span className="h-2 w-2 shrink-0 animate-ping rounded-full bg-emerald-400" />
                <div className="flex flex-col">
                  <span className="text-[8px] sm:text-[9px] text-neutral-400 uppercase tracking-wider">
                    {secondsUntilNextProgram !== null && secondsUntilNextProgram > 0
                      ? `Next in ${formatCommercialCountdown(secondsUntilNextProgram)}`
                      : "Next Ready"}
                  </span>
                  <span className="font-bold text-white text-[10px] sm:text-xs truncate max-w-[85px] xs:max-w-[130px] sm:max-w-[200px]">
                    {mediaType === "tv" && !isLiveMode
                      ? `Episode ${currentEpisode + 1}`
                      : nextUpcomingEntry?.title || activeChannel.name}
                  </span>
                </div>
              </div>

              {/* Next Show skip button */}
              <button
                type="button"
                onClick={handleAdvanceToNextProgram}
                className="flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-950/80 hover:bg-amber-900/90 text-amber-200 hover:text-white px-2.5 sm:px-3 text-xs font-mono font-bold tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer touch-manipulation"
                title="Skip commercial break and tune into next program"
              >
                <FastForward className="h-3.5 w-3.5" />
                <span className="hidden xs:inline sm:inline">Next Show</span>
              </button>
            </>
          ) : (
            <div className="flex items-center rounded-lg border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md">
              {screenMode === "content" && (
                <span className="flex h-8 sm:h-9 items-center gap-1 rounded-l-lg border-r border-neutral-800/80 px-2 sm:px-2.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  <SatelliteDish className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span>{String(currentProviderIndex + 1).padStart(2, "0")}/{String(PROVIDER_COUNT).padStart(2, "0")}</span>
                </span>
              )}

              <div ref={providerMenuRef} className="relative flex items-stretch">
                <button
                  type="button"
                  onClick={advanceProvider}
                  disabled={exhausted || screenMode !== "content"}
                  title="Stream not working? Swap to next"
                  aria-label="Stream not working? Swap to next"
                  className={`flex h-8 sm:h-9 items-center gap-1 px-2 sm:px-2.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer touch-manipulation ${
                    screenMode === "content" ? "" : "rounded-l-lg"
                  }`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsProviderMenuOpen((open) => !open)}
                  disabled={screenMode !== "content"}
                  aria-label="Select stream source"
                  aria-expanded={isProviderMenuOpen}
                  className="flex h-8 sm:h-9 w-6 items-center justify-center rounded-r-lg border-l border-neutral-800/80 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer touch-manipulation"
                >
                  <ChevronDown className={`h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform ${isProviderMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {isProviderMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 sm:w-56 max-h-[50vh] sm:max-h-[60vh] overflow-hidden flex flex-col rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-2xl shadow-black backdrop-blur-xl z-40">
                    <p className="border-b border-neutral-800/80 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-neutral-400 shrink-0 font-medium">
                      Select Stream ({currentProviderIndex + 1}/{PROVIDER_COUNT})
                    </p>
                    <ul className="flex-1 overflow-y-auto no-scrollbar">
                      {providerList.map((provider) => {
                        const isActive = provider.index === currentProviderIndex;
                        return (
                          <li key={provider.id}>
                            <button
                              type="button"
                              onClick={() => jumpToProvider(provider.index)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] uppercase tracking-wide transition-colors hover:bg-white/10 active:bg-white/15 cursor-pointer touch-manipulation ${
                                isActive ? "bg-white/10 font-semibold text-white" : "text-neutral-300"
                              }`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    provider.isDynamic ? "bg-amber-400" : "bg-emerald-400"
                                  }`}
                                />
                                <span className="truncate">{provider.name}</span>
                              </span>
                              {isActive && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {screenMode === "content" && (
                <button
                  type="button"
                  onClick={enterBumperPhase}
                  title="Finished watching? Roll retro commercial break"
                  className="flex h-8 sm:h-9 items-center gap-1.5 border-l border-neutral-800/80 px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-mono font-medium text-amber-300/90 hover:bg-white/10 hover:text-amber-200 transition-colors cursor-pointer touch-manipulation"
                >
                  <Tv className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Roll Ads</span>
                </button>
              )}
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player"
              className="flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-full border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:text-white active:scale-95 cursor-pointer touch-manipulation shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
