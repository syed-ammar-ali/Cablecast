"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initHlsPlayer, type HlsPlayerInstance } from "@/lib/hlsPlayer";
import {
  calculateBlockState,
  DEFAULT_BLOCK_SECONDS,
  DEFAULT_BUMPER_STREAM_URL,
} from "@/lib/broadcastBlockManager";
import { DeadAirScreen } from "@/components/player/DeadAirScreen";
import { useTouchGestures } from "@/lib/useTouchGestures";
import type { Channel } from "@/config/channels";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RadioTower,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

type PlayerStatus = "resolving" | "tuning" | "buffering" | "ready" | "signal-lost";

export interface NativeVideoPlayerProps {
  /** TMDB ID of the show or movie to stream */
  tmdbId?: string | number;
  /** Media type: movie or tv */
  type?: "movie" | "tv";
  /** Season number for TV shows (defaults to 1) */
  season?: number;
  /** Episode number for TV shows (defaults to 1) */
  episode?: number;
  /** Scheduled broadcast start time (Unix timestamp in ms, ISO string, or Date) */
  scheduledStartTime?: number | string | Date;
  /** Optional direct stream URL override (if already resolved) */
  streamUrl?: string;
  /** Bumper stream URL for commercial break transitions */
  bumperUrl?: string;
  /** Program or episode title */
  title?: string;
  /** Optional initial seek offset in seconds */
  startOffsetSeconds?: number;
  /** Legacy alias for scheduledStartTime */
  startTime?: number | string | Date;
  /** Channel metadata */
  channel?: Channel;
  nextProgramTitle?: string;
  nextProgramStartTime?: number | string | Date;
  isOffAir?: boolean;
  onProgramStart?: () => void;
  /** Duration of the main show in seconds (defaults to 22 minutes = 1320s) */
  mainShowDurationSeconds?: number;
  /** Total block duration in seconds (defaults to 30 minutes = 1800s) */
  blockTotalSeconds?: number;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const paddedSecs = String(secs).padStart(2, "0");
  if (hrs > 0) {
    const paddedMins = String(mins % 60).padStart(2, "0");
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }
  return `${String(mins).padStart(2, "0")}:${paddedSecs}`;
}

const DEFAULT_MAIN_SHOW_DURATION_SECONDS = 22 * 60; // 22 minutes

export function NativeVideoPlayer({
  tmdbId,
  type,
  season = 1,
  episode = 1,
  scheduledStartTime,
  streamUrl: initialStreamUrl,
  bumperUrl = DEFAULT_BUMPER_STREAM_URL,
  title,
  startOffsetSeconds = 0,
  startTime,
  channel,
  nextProgramTitle,
  nextProgramStartTime,
  isOffAir = false,
  onProgramStart,
  mainShowDurationSeconds = DEFAULT_MAIN_SHOW_DURATION_SECONDS,
  blockTotalSeconds = DEFAULT_BLOCK_SECONDS,
}: NativeVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerInstanceRef = useRef<HlsPlayerInstance | null>(null);

  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(initialStreamUrl ?? null);
  const [subtitles, setSubtitles] = useState<Array<{ url: string; language: string }>>([]);
  const [status, setStatus] = useState<PlayerStatus>(initialStreamUrl ? "tuning" : "resolving");
  const [isBumperActive, setIsBumperActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // 1. Time-Sync & Live Clock Offset Calculation
  const effectiveStartRef = useRef<number | null>(null);
  const rawStart = scheduledStartTime ?? startTime;

  useEffect(() => {
    if (effectiveStartRef.current === null) {
      effectiveStartRef.current = rawStart
        ? typeof rawStart === "number"
          ? rawStart
          : new Date(rawStart).getTime()
        : Date.now() - startOffsetSeconds * 1000;
    }
  }, [rawStart, startOffsetSeconds]);

  const getEffectiveStartTime = useCallback(() => {
    return (
      effectiveStartRef.current ??
      (rawStart
        ? typeof rawStart === "number"
          ? rawStart
          : new Date(rawStart).getTime()
        : Date.now() - startOffsetSeconds * 1000)
    );
  }, [rawStart, startOffsetSeconds]);

  const calculateLiveOffset = useCallback(() => {
    const startMs = getEffectiveStartTime();
    return Math.max(0, (Date.now() - startMs) / 1000);
  }, [getEffectiveStartTime]);

  // 2. Lifecycle & Resolution: Invoke getDirectStream when tmdbId and type are provided
  useEffect(() => {
    if (initialStreamUrl) {
      return;
    }

    if (!tmdbId || !type) {
      return;
    }

    let isCancelled = false;

    const params = new URLSearchParams({
      tmdbId: String(tmdbId),
      type,
      season: String(season),
      episode: String(episode),
    });

    fetch(`/api/stream/direct?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { success: boolean; streamUrl?: string; subtitles?: Array<{ url: string; language: string }> }) => {
        if (isCancelled) return;
        if (data.success && data.streamUrl) {
          setActiveStreamUrl(data.streamUrl);
          setSubtitles(data.subtitles || []);
          setStatus("tuning");
        } else {
          setStatus("signal-lost");
        }
      })
      .catch((err) => {
        console.error("[NativeVideoPlayer] Stream resolution failed:", err);
        if (!isCancelled) setStatus("signal-lost");
      });

    return () => {
      isCancelled = true;
    };
  }, [tmdbId, type, season, episode, initialStreamUrl, retryCount]);

  // 3. Block State Calculation & Source Routing
  const getBlockState = useCallback(() => {
    const startMs = getEffectiveStartTime();
    return calculateBlockState({
      blockStartTime: startMs,
      mainShowDurationSeconds,
      blockTotalSeconds,
      currentTime: Date.now(),
    });
  }, [getEffectiveStartTime, mainShowDurationSeconds, blockTotalSeconds]);

  // 4. HLS Player Binding & Resource Cleanup
  const initializeStream = useCallback(
    (streamToLoad: string, initialSeekSeconds: number, isBumper: boolean) => {
      const video = videoRef.current;
      if (!video) return;

      // 5. Resource Cleanup: Destroy previous HLS instance before creating a new one
      if (playerInstanceRef.current) {
        playerInstanceRef.current.destroy();
        playerInstanceRef.current = null;
      }

      setIsBumperActive(isBumper);
      setStatus("tuning");

      const instance = initHlsPlayer({
        videoElement: video,
        streamUrl: streamToLoad,
        initialOffsetSeconds: initialSeekSeconds,
        startTime: getEffectiveStartTime(),
        lockToLive: true,
        autoPlay: true,
        onStatusChange: (newStatus) => {
          if (newStatus === "loading") setStatus("tuning");
          else if (newStatus === "ready") setStatus("ready");
          else if (newStatus === "recovering") setStatus("buffering");
          else if (newStatus === "error") setStatus("signal-lost");
        },
        onError: (_err, isFatal) => {
          // 4. Fail-Safe: Switch to Dead Air TV static screen on unrecoverable network/decode error
          if (isFatal) {
            setStatus("signal-lost");
          }
        },
      });

      playerInstanceRef.current = instance;
    },
    [getEffectiveStartTime],
  );

  // Mount active stream
  useEffect(() => {
    if (!activeStreamUrl || isOffAir || status === "signal-lost") return;

    const blockState = getBlockState();

    if (blockState.phase === "main-show") {
      initializeStream(activeStreamUrl, blockState.elapsedTimeSeconds, false);
    } else if (blockState.phase === "bumper-gap") {
      initializeStream(bumperUrl, blockState.elapsedTimeSeconds - mainShowDurationSeconds, true);
    } else {
      initializeStream(activeStreamUrl, 0, false);
    }

    return () => {
      if (playerInstanceRef.current) {
        playerInstanceRef.current.destroy();
        playerInstanceRef.current = null;
      }
    };
  }, [activeStreamUrl, bumperUrl, isOffAir, status, getBlockState, mainShowDurationSeconds, initializeStream, retryCount]);

  // 5. Seamless Transition: On ended, switch from main show to bumper gap
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnded = () => {
      if (!isBumperActive) {
        const state = getBlockState();
        if (state.phase === "bumper-gap" || state.elapsedTimeSeconds >= mainShowDurationSeconds) {
          const bumperOffset = Math.max(0, state.elapsedTimeSeconds - mainShowDurationSeconds);
          initializeStream(bumperUrl, bumperOffset, true);
        }
      }
    };

    video.addEventListener("ended", handleVideoEnded);
    return () => {
      video.removeEventListener("ended", handleVideoEnded);
    };
  }, [isBumperActive, bumperUrl, getBlockState, mainShowDurationSeconds, initializeStream]);

  // Video event synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlaying = () => setStatus("ready");
    const onWaiting = () => setStatus((prev) => (prev === "ready" ? "buffering" : prev));
    const onVolume = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("volumechange", onVolume);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("volumechange", onVolume);
    };
  }, []);

  // Keyboard seek lock
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        ["ArrowLeft", "ArrowRight", "Home", "End", "j", "l", "J", "L"].includes(e.key) &&
        !["input", "textarea"].includes((document.activeElement?.tagName || "").toLowerCase())
      ) {
        e.preventDefault();
        e.stopPropagation();
        const video = videoRef.current;
        if (video) video.currentTime = calculateLiveOffset();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [calculateLiveOffset]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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

  useEffect(() => {
    showControls();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    };
  }, [showControls]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    if (video.paused) {
      void video.play();
      showGestureFeedback(<Play className="h-5 w-5 text-emerald-400" />, "PLAYING");
    } else {
      video.pause();
      showGestureFeedback(<Pause className="h-5 w-5 text-amber-400" />, "PAUSED");
    }
  }, [showControls, showGestureFeedback]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    showGestureFeedback(
      nextMuted ? <VolumeX className="h-5 w-5 text-red-400" /> : <Volume2 className="h-5 w-5 text-emerald-400" />,
      nextMuted ? "MUTED" : "UNMUTED",
    );
  }, [showControls, showGestureFeedback]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    showControls();
    showGestureFeedback(
      <Maximize className="h-5 w-5 text-amber-400" />,
      document.fullscreenElement ? "WINDOWED" : "FULLSCREEN",
    );
    if (document.fullscreenElement) {
      void document.exitFullscreen();
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
    } else {
      void container.requestFullscreen().then(() => {
        try {
          const orientation = screen.orientation as unknown as
            | { lock?: (orientation: string) => Promise<void>; unlock?: () => void }
            | undefined;
          if (orientation && typeof orientation.lock === "function") {
            void orientation.lock("landscape").catch(() => {});
          }
        } catch {
          // Non-fatal
        }
      }).catch(() => {});
    }
  }, [showControls, showGestureFeedback]);

  const handleRetry = useCallback(() => {
    setStatus("resolving");
    setRetryCount((c) => c + 1);
  }, []);

  const { handleTouchStart, handleTouchEnd } = useTouchGestures({
    onSwipeLeft: toggleMute,
    onSwipeRight: toggleMute,
    onDoubleTap: toggleFullscreen,
  });

  // 4. Fail-Safe: Off-Air & Dead Air Screen with "OFF AIR - NO SIGNAL"
  if (isOffAir || status === "signal-lost") {
    return (
      <div className="relative h-full w-full">
        <DeadAirScreen
          channel={channel}
          nextProgramTitle={nextProgramTitle || title}
          nextProgramStartTime={nextProgramStartTime}
          statusLabel="OFF AIR - NO SIGNAL"
          reasonLabel="No direct broadcast signal available. Stand by for recovery."
          onProgramStart={onProgramStart || handleRetry}
        />
        <button
          type="button"
          onClick={handleRetry}
          className="absolute bottom-6 right-6 z-30 flex items-center gap-1.5 rounded-full border border-neutral-700 bg-black/80 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white shadow-lg backdrop-blur-md transition-colors hover:border-neutral-400 hover:bg-neutral-900"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Retune Channel
        </button>
      </div>
    );
  }

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onClick={showControls}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="group relative h-full w-full overflow-hidden bg-black select-none touch-none overscroll-none"
    >
      {/* 3. Native <video> element with default browser controls disabled */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain pointer-events-auto"
        controls={false}
        playsInline
        onClick={togglePlay}
      >
        {subtitles.map((sub, idx) => (
          <track
            key={idx}
            src={sub.url}
            kind="subtitles"
            srcLang={sub.language}
            label={sub.language}
            default={idx === 0}
          />
        ))}
      </video>

      {/* 2. Authentic Retro "TUNING IN..." CRT Loading Screen */}
      {(status === "resolving" || status === "tuning") && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/95 text-neutral-300">
          {/* CRT Scanline overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0px, rgba(0,0,0,0.4) 1px, transparent 1px, transparent 2px)",
            }}
          />
          <RadioTower className="h-10 w-10 animate-pulse text-red-500" />
          <p className="font-mono text-sm font-bold uppercase tracking-[0.25em] text-neutral-200">
            {status === "resolving"
              ? "TUNING IN..."
              : isBumperActive
                ? "TUNING STATION ID..."
                : "TUNING DIRECT BROADCAST..."}
          </p>
          <div className="h-1 w-44 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-1/3 animate-[loading-scan_1.2s_ease-in-out_infinite] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>
        </div>
      )}

      {/* Buffering State */}
      {status === "buffering" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 text-neutral-300">
          <RadioTower className="h-8 w-8 animate-pulse text-amber-400" />
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-300">Buffering Stream...</p>
        </div>
      )}

      {/* Title & Channel Header OSD */}
      {title && (
        <div
          className={`pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-20 max-w-[70vw] rounded-md border border-neutral-700/50 bg-black/75 px-3 py-2 backdrop-blur-md transition-opacity duration-300 ${
            isControlsVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {isBumperActive ? "Station Intermission" : "Direct Broadcast Feed"}
          </p>
          <p className="truncate text-sm font-semibold text-neutral-100">{title}</p>
        </div>
      )}

      {/* Gesture HUD Feedback Pill */}
      {gestureFeedback && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex items-center gap-2.5 rounded-2xl border border-neutral-700/80 bg-black/85 px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-90 duration-150">
          {gestureFeedback.icon}
          <span>{gestureFeedback.text}</span>
        </div>
      )}

      {/* Player Controls Bar (Scrubber Disabled) */}
      <div
        className={`absolute inset-x-[max(1rem,env(safe-area-inset-left))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex flex-col gap-2 transition-opacity duration-300 ${
          isControlsVisible
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
        }`}
      >
        <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-700/50 bg-black/75 px-3.5 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-white cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 text-white" />}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-white cursor-pointer"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              <VolumeIcon className="h-4 w-4" />
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (videoRef.current) {
                  videoRef.current.volume = v;
                  videoRef.current.muted = v === 0;
                }
              }}
              className="h-1 w-20 cursor-pointer accent-neutral-300"
              aria-label="Volume"
            />

            <div className="flex items-center gap-2 border-l border-neutral-800 pl-3">
              <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-red-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                LIVE
              </span>
              <span className="font-mono text-xs text-neutral-400">{formatTime(currentTime)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-white cursor-pointer"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
