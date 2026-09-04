"use client";

import { useEffect, useRef } from "react";
import Hls, { type HlsConfig, type ErrorData } from "hls.js";

export type HlsEngineType = "native" | "hlsjs" | "unsupported";

export interface HlsPlayerOptions {
  /** The HTML5 <video> element to attach the stream to */
  videoElement: HTMLVideoElement;
  /** The .m3u8 master playlist or stream URL */
  streamUrl: string;
  /** Initial playback offset in seconds (e.g. live simulation or resume position) */
  initialOffsetSeconds?: number;
  /** Scheduled start time of the program (ISO string, epoch ms, or Date) for exact real-time live clock sync */
  startTime?: number | string | Date;
  /** Whether to lock playback strictly to real-time live clock and prevent user seeking */
  lockToLive?: boolean;
  /** Whether to attempt autoplay once the manifest is parsed */
  autoPlay?: boolean;
  /** Custom Hls.js configuration options */
  hlsConfig?: Partial<HlsConfig>;
  /** Callback fired when the manifest is parsed and stream is ready */
  onReady?: (engine: HlsEngineType) => void;
  /** Callback fired when an error occurs or stream fails */
  onError?: (error: Error | ErrorData, isFatal: boolean) => void;
  /** Callback fired when player state changes (e.g. buffering, recovering) */
  onStatusChange?: (status: "loading" | "ready" | "recovering" | "error") => void;
}

export interface HlsPlayerInstance {
  /** The underlying Hls.js instance (if hls.js is used) or null for native playback */
  hls: Hls | null;
  /** The active playback engine type */
  engineType: HlsEngineType;
  /** Current calculated real-time live offset in seconds */
  getLiveOffset: () => number;
  /** Programmatically seek to an offset */
  seekTo: (seconds: number) => void;
  /** Safely tears down and cleans up resources */
  destroy: () => void;
}

/**
 * Initializes an HLS stream onto an HTML5 <video> element with strict real-time live sync:
 *
 * 1. Time-Sync Calculation: Calculates seconds offset from program scheduled start time to current system time.
 * 2. Auto-Seek on Load: Jumps directly into broadcast where it should be live once manifest is parsed.
 * 3. Seek Prevention: Adds 'seeking' event listener snapping currentTime back to real-time live clock.
 * 4. Automatic error recovery and resource cleanup.
 */
export function initHlsPlayer(options: HlsPlayerOptions): HlsPlayerInstance {
  const {
    videoElement,
    streamUrl,
    initialOffsetSeconds = 0,
    startTime,
    lockToLive = true,
    autoPlay = false,
    hlsConfig = {},
    onReady,
    onError,
    onStatusChange,
  } = options;

  let isDestroyed = false;
  let engineType: HlsEngineType = "unsupported";

  onStatusChange?.("loading");

  // 1. Time-Sync Calculation
  const mountTimeMs = Date.now();
  const programStartMs = startTime
    ? (typeof startTime === "number" ? startTime : new Date(startTime).getTime())
    : (mountTimeMs - (initialOffsetSeconds * 1000));

  const calculateLiveOffset = (): number => {
    return Math.max(0, (Date.now() - programStartMs) / 1000);
  };

  // 2. Auto-Seek on Load
  const applyOffsetAndPlay = () => {
    const targetOffset = calculateLiveOffset();
    if (targetOffset > 0) {
      try {
        videoElement.currentTime = targetOffset;
      } catch (err) {
        console.warn("[HlsPlayer] Failed to apply live offset on manifest parsed:", err);
      }
    }
    if (autoPlay) {
      videoElement.play().catch((err) => {
        // Autoplay may be blocked by browser policy without user gesture
        console.warn("[HlsPlayer] Autoplay prevented by browser policy:", err);
      });
    }
  };

  // 4. Seek Prevention: Snap video back to live clock offset on any seek attempt
  let isSnapping = false;
  const handleSeeking = () => {
    if (isDestroyed || !lockToLive || isSnapping) return;
    const targetOffset = calculateLiveOffset();
    if (Math.abs(videoElement.currentTime - targetOffset) > 0.75) {
      isSnapping = true;
      try {
        videoElement.currentTime = targetOffset;
      } catch (err) {
        console.warn("[HlsPlayer] Failed snapping seek back to live offset:", err);
      }
      setTimeout(() => {
        isSnapping = false;
      }, 60);
    }
  };

  videoElement.addEventListener("seeking", handleSeeking);

  // ---------------------------------------------------------------------------
  // 1. Native HLS Engine (Safari / iOS WebKit)
  // ---------------------------------------------------------------------------
  if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
    engineType = "native";
    videoElement.src = streamUrl;

    const handleLoadedMetadata = () => {
      if (isDestroyed) return;
      applyOffsetAndPlay();
      onStatusChange?.("ready");
      onReady?.("native");
    };

    const handleNativeError = () => {
      if (isDestroyed) return;
      const mediaError = videoElement.error;
      const err = new Error(mediaError ? `Native HLS error code: ${mediaError.code} (${mediaError.message})` : "Native HLS playback error");
      onStatusChange?.("error");
      onError?.(err, true);
    };

    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("error", handleNativeError);

    const destroy = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      videoElement.removeEventListener("seeking", handleSeeking);
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("error", handleNativeError);
      videoElement.removeAttribute("src");
      videoElement.load(); // Reset native decoder pipeline
    };

    return {
      hls: null,
      engineType,
      getLiveOffset: calculateLiveOffset,
      seekTo: (sec: number) => {
        if (!lockToLive) videoElement.currentTime = sec;
      },
      destroy,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Hls.js Engine (Chrome, Firefox, Edge, Android, Opera)
  // ---------------------------------------------------------------------------
  if (Hls.isSupported()) {
    engineType = "hlsjs";

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30, // Limit back-buffer to 30s to prevent unbounded memory allocation
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 30 * 1000 * 1000, // 30MB maximum segment buffer cap
      ...hlsConfig,
    });

    // Load stream and attach to <video>
    hls.loadSource(streamUrl);
    hls.attachMedia(videoElement);

    // Manifest parsed -> apply live offset and notify ready
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isDestroyed) return;
      applyOffsetAndPlay();
      onStatusChange?.("ready");
      onReady?.("hlsjs");
    });

    // Error handling & recovery
    let mediaRecoveryAttempts = 0;
    let networkRecoveryAttempts = 0;
    const MAX_RECOVERIES = 3;

    hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
      if (isDestroyed) return;

      if (!data.fatal) {
        // Non-fatal warning / dropped frame
        onError?.(data, false);
        return;
      }

      console.warn(`[HlsPlayer] Fatal ${data.type} error:`, data.details);

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          if (networkRecoveryAttempts < MAX_RECOVERIES) {
            networkRecoveryAttempts++;
            onStatusChange?.("recovering");
            console.log(`[HlsPlayer] Attempting network recovery (${networkRecoveryAttempts}/${MAX_RECOVERIES})...`);
            hls.startLoad();
          } else {
            onStatusChange?.("error");
            onError?.(data, true);
            destroy();
          }
          break;

        case Hls.ErrorTypes.MEDIA_ERROR:
          if (mediaRecoveryAttempts < MAX_RECOVERIES) {
            mediaRecoveryAttempts++;
            onStatusChange?.("recovering");
            console.log(`[HlsPlayer] Attempting media recovery (${mediaRecoveryAttempts}/${MAX_RECOVERIES})...`);
            hls.recoverMediaError();
          } else {
            onStatusChange?.("error");
            onError?.(data, true);
            destroy();
          }
          break;

        default:
          onStatusChange?.("error");
          onError?.(data, true);
          destroy();
        break;
      }
    });

    const destroy = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      videoElement.removeEventListener("seeking", handleSeeking);
      try {
        hls.detachMedia();
        hls.destroy();
      } catch (err) {
        console.warn("[HlsPlayer] Error during Hls.js cleanup:", err);
      }
    };

    return {
      hls,
      engineType,
      getLiveOffset: calculateLiveOffset,
      seekTo: (sec: number) => {
        if (!lockToLive) videoElement.currentTime = sec;
      },
      destroy,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Unsupported Environment
  // ---------------------------------------------------------------------------
  const unsupportedError = new Error("Neither Native HLS nor Hls.js is supported in this browser.");
  onStatusChange?.("error");
  onError?.(unsupportedError, true);

  return {
    hls: null,
    engineType: "unsupported",
    getLiveOffset: calculateLiveOffset,
    seekTo: () => {},
    destroy: () => {
      videoElement.removeEventListener("seeking", handleSeeking);
    },
  };
}

/**
 * React Hook for binding an HLS stream to a video ref.
 */
export function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: Omit<HlsPlayerOptions, "videoElement">
) {
  const playerRef = useRef<HlsPlayerInstance | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !options.streamUrl) return;

    const instance = initHlsPlayer({
      ...options,
      videoElement: video,
    });
    playerRef.current = instance;

    return () => {
      instance.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.streamUrl,
    options.initialOffsetSeconds,
    options.startTime,
    options.lockToLive,
    options.autoPlay,
    videoRef,
  ]);

  return playerRef;
}
