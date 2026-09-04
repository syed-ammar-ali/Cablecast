"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  RadioTower,
  RefreshCw,
  SatelliteDish,
  VolumeX,
  Volume2,
  Tv,
  Maximize,
  X,
} from "lucide-react";
import {
  buildPlayerSource,
  isDynamicProvider,
  listProviders,
  PROVIDER_COUNT,
  type ProviderListEntry,
} from "@/lib/providers";
import { CHANNELS } from "@/config/channels";
import { BLOCK_MINUTES } from "@/lib/runtime";
import {
  formatClockTime,
  getAppointmentEndDate,
  msUntilNextBlockBoundary,
} from "@/lib/schedule";
import { fetchChannelNowPlaying } from "@/lib/liveChannelClient";
import { getRandomBumper, type Bumper } from "@/lib/bumpers";
import { useTouchGestures } from "@/lib/useTouchGestures";
import { DeadAirScreen } from "@/components/player/DeadAirScreen";
import type { MediaType } from "@/types/media";
import type { ScheduleEntry } from "@/types/schedule";

/** How long the loader waits for an `onLoad` event before assuming a static provider is dead. */
const LOAD_TIMEOUT_MS = 12_000;
/** Extra time given to dynamic providers (YouTube, KissKH, etc.) that need an async search first. */
const DYNAMIC_LOAD_TIMEOUT_MS = 15_000;
/** How long the 90s-style on-screen display stays up after the last interaction. */
const OSD_AUTO_HIDE_MS = 3_000;

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

interface OsdContent {
  channelLabel: string;
  channelGenre: string;
  programTitle?: string;
  audioMode: "STEREO" | "MUTED";
  time: string;
  /** Human-readable offset into current program, e.g. "+14:22 into broadcast" — omitted when no live entry */
  liveOffset?: string;
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

  // --- Manual provider picker (the dropdown next to "Swap Channel") -------
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
  const [isMuted, setIsMuted] = useState(false);
  const [osd, setOsd] = useState<OsdContent | null>(null);
  const osdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Close the provider picker on an outside click or Escape.
  useEffect(() => {
    if (!isProviderMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!providerMenuRef.current?.contains(event.target as Node)) {
        setIsProviderMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsProviderMenuOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
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
    } else if (providerId === "kisskh-asian" || providerId === "dramacool-asian") {
      const providerSlug = providerId === "kisskh-asian" ? "kisskh" : "dramacool";
      const params = new URLSearchParams({
        title: cleanTitle,
        mediaType: activePlayback.mediaType,
        provider: providerSlug,
      });
      if (activePlayback.mediaType === "tv") {
        params.set("season", String(activePlayback.season));
        params.set("episode", String(activePlayback.episode));
      }

      fetch(`/api/asian/search?${params.toString()}`)
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
    } else if (
      providerId === "kartoons-me" ||
      providerId === "kimcartoon" ||
      providerId === "gogoanime"
    ) {
      const providerSlug =
        providerId === "kartoons-me"
          ? "kartoons"
          : providerId === "kimcartoon"
            ? "kimcartoon"
            : "gogoanime";
      const params = new URLSearchParams({
        title: cleanTitle,
        mediaType: activePlayback.mediaType,
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

  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [gestureFeedback, setGestureFeedback] = useState<{ icon: React.ReactNode; text: string } | null>(null);
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setIsControlsVisible(false), 3500);
  }, []);

  const showGestureFeedback = useCallback((icon: React.ReactNode, text: string) => {
    setGestureFeedback({ icon, text });
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => setGestureFeedback(null), 1500);
  }, []);

  const showOsd = useCallback((content: OsdContent) => {
    setOsd(content);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => setOsd(null), OSD_AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    };
  }, [showControls]);

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
      const offsetSeconds = entry.liveOffsetSeconds ?? null;
      const liveOffset = offsetSeconds != null && offsetSeconds > 0
        ? `+${String(Math.floor(offsetSeconds / 60)).padStart(2, "0")}:${String(Math.floor(offsetSeconds % 60)).padStart(2, "0")} into broadcast`
        : undefined;
      const channel = CHANNELS.find((c) => c.number === channelNumber);
      if (channel) {
        showOsd({
          channelLabel: `CH ${String(channel.number).padStart(2, "0")}`,
          channelGenre: channel.genre.toUpperCase(),
          programTitle: entry.title,
          audioMode: isMuted ? "MUTED" : "STEREO",
          time: formatClockTime(),
          liveOffset,
        });
      }
    } else {
      setLiveEntry(null);
      setIsOffAir(true);
      setOffAirTargetTime(Date.now() + msUntilNextBlockBoundary());
    }
  }, [isMuted, showOsd]);

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

      showControls();
      showGestureFeedback(
        <Tv className="h-5 w-5 text-purple-400" />,
        `CH ${String(channel.number).padStart(2, "0")} · ${channel.name}`,
      );

      showOsd({
        channelLabel: `CH ${String(channel.number).padStart(2, "0")}`,
        channelGenre: channel.genre.toUpperCase(),
        audioMode: isMuted ? "MUTED" : "STEREO",
        time: formatClockTime(),
        // No offset shown during a channel change — we don't know what's on yet
      });

      void tuneToChannel(channel.number);
    },
    [channelIndex, isMuted, showControls, showGestureFeedback, showOsd, tuneToChannel],
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

  const toggleMute = useCallback(() => {
    setIsMuted((prevMuted) => {
      const nextMuted = !prevMuted;
      showControls();
      showGestureFeedback(
        nextMuted ? <VolumeX className="h-5 w-5 text-red-400" /> : <Volume2 className="h-5 w-5 text-emerald-400" />,
        nextMuted ? "MUTED" : "UNMUTED",
      );
      const offsetSeconds = liveEntry?.liveOffsetSeconds ?? null;
      const liveOffset = offsetSeconds != null
        ? `+${String(Math.floor(offsetSeconds / 60)).padStart(2, "0")}:${String(Math.floor(offsetSeconds % 60)).padStart(2, "0")} into broadcast`
        : undefined;
      showOsd({
        channelLabel: `CH ${String(activeChannel.number).padStart(2, "0")}`,
        channelGenre: activeChannel.genre.toUpperCase(),
        audioMode: nextMuted ? "MUTED" : "STEREO",
        time: formatClockTime(),
        liveOffset,
      });
      return nextMuted;
    });
  }, [activeChannel, liveEntry?.liveOffsetSeconds, showControls, showGestureFeedback, showOsd]);

  // Cross-browser fullscreen helpers. Safari (desktop + iOS) never shipped
  // the unprefixed Fullscreen API, so every call here falls back to the
  // `webkit`-prefixed equivalent. Promise rejections are caught and logged
  // instead of left to surface as "unhandled rejection" — a rejection here
  // just means the browser refused (e.g. no transient user-activation left),
  // not a bug in our code, so it shouldn't crash anything.
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (!container) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    const isCurrentlyFullscreen = Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
    showControls();
    showGestureFeedback(
      <Maximize className="h-5 w-5 text-amber-400" />,
      isCurrentlyFullscreen ? "WINDOWED" : "FULLSCREEN",
    );

    if (isCurrentlyFullscreen) {
      const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc);
      Promise.resolve(exit?.())
        .then(() => {
          try {
            const orientation = screen.orientation as unknown as
              | { lock?: (orientation: string) => Promise<void>; unlock?: () => void }
              | undefined;
            if (orientation && typeof orientation.unlock === "function") {
              orientation.unlock();
            }
          } catch {
            // Non-fatal
          }
        })
        .catch((error: unknown) => {
          console.error("[VideoPlayer] Failed to exit fullscreen:", error);
        });
      return;
    }

    const request = container.requestFullscreen?.bind(container) ?? container.webkitRequestFullscreen?.bind(container);
    Promise.resolve(request?.())
      .catch((error: unknown) => {
        console.error("[VideoPlayer] Failed to enter fullscreen:", error);
      });
  }, [showControls, showGestureFeedback]);

  const displayTitle = !isLiveMode
    ? title ?? "Now Playing"
    : screenMode === "off-air"
      ? "No Signal"
      : screenMode === "bumper"
        ? bumper?.label ?? "Station Break"
        : screenMode === "tuning"
          ? `Tuning ${activeChannel.name}...`
          : liveEntry?.title ?? title ?? "Now Playing";

  const triggerInfoOsd = useCallback(() => {
    const offsetSeconds = liveEntry?.liveOffsetSeconds ?? (isLiveMode ? startOffsetSeconds : null);
    const liveOffset = offsetSeconds != null && offsetSeconds > 0
      ? `+${String(Math.floor(offsetSeconds / 60)).padStart(2, "0")}:${String(Math.floor(offsetSeconds % 60)).padStart(2, "0")} into broadcast`
      : undefined;

    showOsd({
      channelLabel: isLiveMode ? `CH ${String(activeChannel.number).padStart(2, "0")}` : "ON DEMAND",
      channelGenre: isLiveMode ? activeChannel.genre.toUpperCase() : "MEDIA",
      programTitle: displayTitle,
      audioMode: isMuted ? "MUTED" : "STEREO",
      time: formatClockTime(),
      liveOffset,
    });
  }, [activeChannel, displayTitle, isLiveMode, isMuted, liveEntry?.liveOffsetSeconds, showOsd, startOffsetSeconds]);

  // Global channel-surfing shortcuts. Scoped to this component's mounted
  // lifetime (i.e. only while a player is actually open) rather than
  // app-wide, so it never hijacks arrow keys while browsing the catalog or
  // using a <select> elsewhere on the page.
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
        case "m":
        case "M":
          event.preventDefault();
          toggleMute();
          break;
        case "i":
        case "I":
          event.preventDefault();
          triggerInfoOsd();
          break;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleChannel, toggleMute, toggleFullscreen, triggerInfoOsd]);

  // Mobile Touch Gestures:
  // - Swipe Up: Next Channel
  // - Swipe Down: Previous Channel
  // - Swipe Left: Mute / Unmute
  // - Swipe Right: Show OSD Banner
  // - Double Tap: Fullscreen Toggle
  const { handleTouchStart, handleTouchEnd } = useTouchGestures({
    onTap: showControls,
    onSwipeUp: () => {
      showControls();
      cycleChannel(1);
    },
    onSwipeDown: () => {
      showControls();
      cycleChannel(-1);
    },
    onSwipeLeft: () => {
      showControls();
      toggleMute();
    },
    onSwipeRight: () => {
      triggerInfoOsd();
      showControls();
    },
    onDoubleTap: () => {
      showControls();
      toggleFullscreen();
    },
  });

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
      onMouseMove={showControls}
      onClick={showControls}
      onTouchStart={(e) => {
        showControls();
        handleTouchStart(e);
      }}
      onTouchEnd={handleTouchEnd}
      className="group relative h-full w-full overflow-hidden bg-black touch-none overscroll-none select-none"
    >
      {/* Screen — fills the entire player now; there's no separate bezel/remote strip */}
      <div className="relative h-full w-full bg-black">
        {/* Transparent tap zones along top & bottom edges to reveal overlay controls on mobile touch even when an iframe is active */}
        <div
          className="absolute top-0 inset-x-0 h-16 z-20 cursor-pointer"
          onClick={showControls}
          onTouchStart={showControls}
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 inset-x-0 h-12 z-20 cursor-pointer"
          onClick={showControls}
          onTouchStart={showControls}
          aria-hidden="true"
        />
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
              // YouTube requires a real referrer/origin to validate the embed
              // request (see the `source` memo above) — every other provider
              // keeps the stricter no-referrer policy.
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

        {/*
         * Top-left content-info badge — a retro "channel bug". Suppressed
         * once a third-party provider's own on-screen UI is visible (it
         * already shows the title/episode itself), unless we have live/
         * tune-in status info the provider has no way of knowing about.
         */}
        {showBadge && (
          <div
            className={`pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-20 max-w-[70vw] rounded-md border border-neutral-700/50 bg-black/75 px-3 py-2 backdrop-blur-md transition-opacity duration-300 ${
              isControlsVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {(isLiveNow || isSyncedTuneIn) && (
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                {isLiveNow ? `CH ${String(activeChannel.number).padStart(2, "0")} · Live` : "Live Tune-In"}
              </p>
            )}
            {showNameInBadge && (
              <p className="truncate text-sm font-semibold text-neutral-100">{displayTitle}</p>
            )}
            {isLiveNow && <p className="truncate text-xs text-neutral-400">{activeChannel.name}</p>}
          </div>
        )}

        {/* 90s channel-surf OSD — sits below top controls with safe-area offset */}
        {osd && (
          <div className="pointer-events-none absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-30 max-w-[80vw] rounded-md border border-neutral-700/50 bg-black/80 px-3.5 py-2.5 text-right backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.85)] animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-lg font-bold leading-tight tracking-widest text-neutral-100">{osd.channelLabel}</p>
            <p className="text-xs font-semibold leading-tight tracking-wider text-neutral-400">
              {osd.channelGenre}
            </p>
            {osd.programTitle && (
              <p className="mt-1 truncate text-xs font-bold text-white">
                {osd.programTitle}
              </p>
            )}
            {osd.liveOffset && (
              <p className="mt-0.5 text-[11px] leading-tight tracking-wide text-red-400 font-mono">
                {osd.liveOffset}
              </p>
            )}
            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] leading-tight tracking-wide text-neutral-400 font-mono">
              {osd.audioMode === "MUTED" && <VolumeX className="h-3 w-3 text-red-400" />}
              {osd.audioMode} · {osd.time}
            </p>
          </div>
        )}

        {/* Gesture HUD Feedback Pill */}
        {gestureFeedback && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex items-center gap-2.5 rounded-2xl border border-neutral-700/80 bg-black/85 px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-90 duration-150">
            {gestureFeedback.icon}
            <span>{gestureFeedback.text}</span>
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
              All channels exhausted — no signal on any provider.
            </p>
            <button
              type="button"
              onClick={retryFromTop}
              className="flex items-center gap-2 rounded-md border border-neutral-600 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-neutral-200 transition-colors hover:bg-white/10 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Retry From Channel 1
            </button>
          </div>
        )}

        {/*
         * Top-right controls cluster:
         * Unified overlay containing the source counter, swap button, provider dropdown,
         * and close button. Appears on touch/tap or mouse move and automatically
         * fades out after 3.5s of inactivity so the screen remains clean and cinema-grade.
         */}
        <div
          className={`absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-30 flex items-center gap-2.5 transition-opacity duration-300 ${
            isControlsVisible
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
          }`}
        >
          <div className="flex items-center rounded-md border border-neutral-700/50 bg-black/75 text-neutral-300 backdrop-blur-md shadow-lg">
            {screenMode === "content" && (
              <span className="flex h-9 items-center gap-1.5 rounded-l-md border-r border-neutral-700/50 px-3 text-[10px] uppercase tracking-widest text-neutral-400">
                <SatelliteDish className="h-3.5 w-3.5" />
                {String(currentProviderIndex + 1).padStart(2, "0")}/{String(PROVIDER_COUNT).padStart(2, "0")}
              </span>
            )}

            <div ref={providerMenuRef} className="relative flex items-stretch">
              <button
                type="button"
                onClick={advanceProvider}
                disabled={exhausted || screenMode !== "content"}
                title="Source not working? Swap"
                aria-label="Source not working? Swap"
                className={`flex h-9 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
                  screenMode === "content" ? "" : "rounded-l-md"
                }`}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsProviderMenuOpen((open) => !open)}
                disabled={screenMode !== "content"}
                aria-label="Choose a specific source"
                aria-expanded={isProviderMenuOpen}
                className="flex h-9 w-6 items-center justify-center rounded-r-md border-l border-neutral-700/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isProviderMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isProviderMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 max-h-[50vh] overflow-hidden flex flex-col rounded-md border border-neutral-700/60 bg-neutral-950 shadow-[0_0_24px_rgba(0,0,0,0.85)] z-40">
                  <p className="border-b border-neutral-800 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-neutral-400 shrink-0">
                    Select Source ({currentProviderIndex + 1}/{PROVIDER_COUNT})
                  </p>
                  <ul className="flex-1 overflow-y-auto no-scrollbar">
                    {providerList.map((provider) => {
                      const isActive = provider.index === currentProviderIndex;
                      return (
                        <li key={provider.id}>
                          <button
                            type="button"
                            onClick={() => jumpToProvider(provider.index)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] uppercase tracking-wide transition-colors hover:bg-white/10 cursor-pointer ${
                              isActive ? "bg-white/10 text-white" : "text-neutral-300"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  provider.isDynamic ? "bg-amber-400" : "bg-emerald-400"
                                }`}
                                title={
                                  provider.isDynamic
                                    ? "Dynamic Search Provider"
                                    : "Standard Stream Provider"
                                }
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

          {/* Close affordance - unified with controls overlay */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700/60 bg-black/75 text-neutral-300 backdrop-blur-md transition-all duration-200 hover:scale-105 hover:text-white active:scale-95 cursor-pointer shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
