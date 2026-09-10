"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  RadioTower,
  RefreshCw,
  SatelliteDish,
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
  msUntilNextBlockBoundary,
} from "@/lib/schedule";
import { fetchChannelNowPlaying } from "@/lib/liveChannelClient";
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
  const tuneRequestIdRef = useRef(0);

  const activeChannel = CHANNELS[channelIndex];

  const screenMode: ScreenMode = !isLiveMode
    ? "content"
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
        startOffsetSeconds: liveEntry.liveOffsetSeconds ?? startOffsetSeconds,
        title: liveEntry.title,
      };
    }
    return { tmdbId, mediaType, season, episode, startOffsetSeconds, title };
  }, [isLiveMode, liveEntry, tmdbId, mediaType, season, episode, startOffsetSeconds, title]);

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
      startOffsetSeconds: activePlayback.startOffsetSeconds,
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

    const offset = activePlayback.startOffsetSeconds;
    if (offset && offset > 0 && iframeRef.current?.contentWindow) {
      const win = iframeRef.current.contentWindow;
      const sendSeek = () => {
        try {
          win.postMessage({ type: "seek", time: offset, seconds: offset }, "*");
          win.postMessage({ event: "seek", time: offset, value: offset }, "*");
          win.postMessage({ type: "setCurrentTime", value: offset }, "*");
          win.postMessage({ event: "command", func: "seekTo", args: [offset, true] }, "*");
          win.postMessage({ method: "setCurrentTime", value: offset }, "*");
          win.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [offset, true] }), "*");
        } catch {
          // Cross-origin safety
        }
      };

      sendSeek();
      setTimeout(sendSeek, 600);
      setTimeout(sendSeek, 1500);
      setTimeout(sendSeek, 3000);
    }
  }, [clearLoadTimeout, activePlayback.startOffsetSeconds]);

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
            const startOffset = Math.floor(activePlayback.startOffsetSeconds ?? 0);
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const ytParams = new URLSearchParams({
              autoplay: "1",
              rel: "0",
              modestbranding: "1",
            });
            if (origin) ytParams.set("origin", origin);
            if (startOffset > 0) ytParams.set("start", String(startOffset));

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
  }, []);

  const handleBumperEnded = useCallback(() => {
    setBumper((prev) => getRandomBumper(prev?.id));
  }, []);

  // The "live broadcast clock": schedules a bumper transition once the
  // program's known runtime has elapsed (if it's shorter than its reserved
  // block), and always schedules a re-check of the channel at the top of
  // the next block — this is what makes the simulated channel roll over to
  // the next scheduled program (or off-air) on its own, without the viewer
  // touching anything.
  useEffect(() => {
    if (!isLiveMode) return;

    const channelNumber = activeChannel.number;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (isOffAir) {
      const delay = msUntilNextBlockBoundary();
      timers.push(
        setTimeout(() => {
          void tuneToChannel(channelNumber);
        }, delay),
      );
    }
    if (liveEntry) {
      const blockEndMs = Math.max(0, getAppointmentEndDate(liveEntry).getTime() - Date.now());
      const blockDurationSeconds = liveEntry.blockCount * BLOCK_MINUTES * 60;

      if (liveEntry.runtimeMinutes != null) {
        const contentDurationSeconds = liveEntry.runtimeMinutes * 60;
        if (contentDurationSeconds < blockDurationSeconds) {
          const elapsedSeconds = liveEntry.liveOffsetSeconds ?? 0;
          const remainingContentMs = Math.max(
            0,
            (contentDurationSeconds - elapsedSeconds) * 1000,
          );
          timers.push(setTimeout(enterBumperPhase, remainingContentMs));
        }
      }

      timers.push(
        setTimeout(() => {
          void tuneToChannel(channelNumber);
        }, blockEndMs),
      );
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveMode, isOffAir, liveEntry?.id, activeChannel.number]);

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
  const isSyncedTuneIn = !isLiveMode && startOffsetSeconds > 0;
  // Once a third-party provider's iframe is actually up and playing, it
  // almost always renders its own title/episode UI baked into the video —
  // showing our own title text on top of that just duplicates it. Only the
  // status tags below (live/tune-in), which the provider has no way of
  // knowing about, are still worth surfacing at that point.
  const isProviderUiVisible =
    screenMode === "content" && hasLoadableSource && !exhausted && !isLoading && (!isDynamic || Boolean(dynamicEmbedUrl));
  const showNameInBadge = !isProviderUiVisible;
  const showBadge = showNameInBadge || isLiveNow || isSyncedTuneIn;

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
              muted
              playsInline
              onEnded={handleBumperEnded}
            />
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
            {(isLiveNow || isSyncedTuneIn) && (
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                <span className="truncate">
                  {isLiveNow ? `CH ${String(activeChannel.number).padStart(2, "0")} · Live` : "Live Tune-In"}
                </span>
              </p>
            )}
            {showNameInBadge && (
              <p className="truncate text-xs sm:text-sm font-semibold text-neutral-100">{displayTitle}</p>
            )}
            {isLiveNow && <p className="truncate text-[10px] text-neutral-400">{activeChannel.name}</p>}
          </div>
        )}

        {/* ── 2. Top-Right Sticky Component: Stream Switcher & Close ───────────── */}
        <div
          className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex items-center gap-2"
        >
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
                className={`flex h-8 sm:h-9 items-center gap-1 px-2 sm:px-2.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
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
                className="flex h-8 sm:h-9 w-6 items-center justify-center rounded-r-lg border-l border-neutral-800/80 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
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
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] uppercase tracking-wide transition-colors hover:bg-white/10 active:bg-white/15 cursor-pointer ${
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
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player"
              className="flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-full border border-neutral-800/80 bg-black/85 text-neutral-300 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:text-white active:scale-95 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
