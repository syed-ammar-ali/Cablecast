"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface LiveHeadControllerOptions {
  /** Video DOM element or ref */
  videoElement: HTMLVideoElement | null;
  /** Scheduled broadcast start time (Date object, timestamp in ms, or ISO date string) */
  scheduledStartTime: Date | number | string;
  /** Total broadcast duration in seconds */
  durationSeconds: number;
  /** Optional tolerance in seconds to consider the player "At Live Head" (default: 2s) */
  liveThresholdSeconds?: number;
  /** Callback fired whenever live head or sync state updates */
  onSyncUpdate?: (state: LiveBroadcastState) => void;
  /** Callback fired when user attempts to seek past the live head */
  onSeekBlocked?: (attemptedTime: number, clampedTime: number) => void;
}

export interface LiveBroadcastState {
  /** Current calculated live broadcast head position in seconds */
  liveHeadSeconds: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total program duration in seconds */
  durationSeconds: number;
  /** Whether the user is currently watching in real-time sync with the live head */
  isAtLiveHead: boolean;
  /** How many seconds behind the live head the user currently is */
  secondsBehindLive: number;
  /** Percentage of program that has aired so far (0 - 100) */
  airedPercentage: number;
}

export interface LiveHeadControllerInstance {
  /** Returns the current live head in seconds based on system clock */
  getLiveHeadSeconds: () => number;
  /** Jumps playback directly to the current live head */
  jumpToLive: () => void;
  /** Safely seeks to a target offset, clamped strictly between 0 and current live head */
  seekTo: (targetSeconds: number) => void;
  /** Tears down event listeners and sync timers */
  destroy: () => void;
}

/**
 * Calculates the exact current "live head" position in seconds
 * based on the system clock: elapsed = (now - scheduledStartTime)
 */
export function calculateCurrentLiveHead(
  scheduledStartTime: Date | number | string,
  durationSeconds: number
): number {
  const startMs =
    scheduledStartTime instanceof Date
      ? scheduledStartTime.getTime()
      : typeof scheduledStartTime === "string"
      ? new Date(scheduledStartTime).getTime()
      : scheduledStartTime;

  const nowMs = Date.now();
  const elapsedSeconds = Math.floor((nowMs - startMs) / 1000);

  // Clamp between 0 and total duration
  return Math.max(0, Math.min(elapsedSeconds, durationSeconds));
}

/**
 * Imperative controller that binds to an HTML5 <video> element and
 * strictly enforces a live broadcast viewing experience.
 */
export function createLiveHeadController(
  options: LiveHeadControllerOptions
): LiveHeadControllerInstance {
  const {
    videoElement,
    scheduledStartTime,
    durationSeconds,
    liveThresholdSeconds = 2,
    onSyncUpdate,
    onSeekBlocked,
  } = options;

  let isDestroyed = false;
  let syncTimer: ReturnType<typeof setInterval> | null = null;

  const getLiveHead = () => calculateCurrentLiveHead(scheduledStartTime, durationSeconds);

  // Initial sync: position playback at the live head if starting from 0
  if (videoElement) {
    const initialLiveHead = getLiveHead();
    if (initialLiveHead > 0 && videoElement.currentTime === 0) {
      videoElement.currentTime = initialLiveHead;
    }
  }

  const checkAndClamp = () => {
    if (!videoElement || isDestroyed) return;

    const liveHead = getLiveHead();
    const current = videoElement.currentTime;

    // Requirement 3: Intercept and clamp forward seeks exceeding live head
    if (current > liveHead + 0.5) {
      console.warn(
        `[LiveHeadController] Forward seek blocked: ${current.toFixed(1)}s > Live Head ${liveHead.toFixed(1)}s. Clamping.`
      );
      videoElement.currentTime = liveHead;
      onSeekBlocked?.(current, liveHead);
    }

    const secondsBehind = Math.max(0, liveHead - videoElement.currentTime);
    const isAtLive = secondsBehind <= liveThresholdSeconds;
    const airedPct = durationSeconds > 0 ? (liveHead / durationSeconds) * 100 : 0;

    onSyncUpdate?.({
      liveHeadSeconds: liveHead,
      currentTime: videoElement.currentTime,
      durationSeconds,
      isAtLiveHead: isAtLive,
      secondsBehindLive: Math.round(secondsBehind),
      airedPercentage: Math.min(100, Math.max(0, airedPct)),
    });
  };

  // 1. Intercept 'seeking' events immediately
  const handleSeeking = () => {
    if (!videoElement) return;
    const liveHead = getLiveHead();
    if (videoElement.currentTime > liveHead) {
      videoElement.currentTime = liveHead;
      onSeekBlocked?.(videoElement.currentTime, liveHead);
    }
    checkAndClamp();
  };

  // 2. Intercept 'timeupdate' to ensure continuous sync
  const handleTimeUpdate = () => {
    checkAndClamp();
  };

  if (videoElement) {
    videoElement.addEventListener("seeking", handleSeeking);
    videoElement.addEventListener("seeked", checkAndClamp);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("playing", checkAndClamp);
  }

  // 3. Clock tick interval (every 1 second) to progress live head as real-world time ticks
  syncTimer = setInterval(() => {
    checkAndClamp();
  }, 1000);

  const jumpToLive = () => {
    if (!videoElement) return;
    const liveHead = getLiveHead();
    videoElement.currentTime = liveHead;
    if (videoElement.paused) {
      void videoElement.play();
    }
  };

  const seekTo = (targetSeconds: number) => {
    if (!videoElement) return;
    const liveHead = getLiveHead();
    // Strictly clamp target between 0 and live head
    const clamped = Math.max(0, Math.min(targetSeconds, liveHead));
    videoElement.currentTime = clamped;
  };

  const destroy = () => {
    if (isDestroyed) return;
    isDestroyed = true;

    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }

    if (videoElement) {
      videoElement.removeEventListener("seeking", handleSeeking);
      videoElement.removeEventListener("seeked", checkAndClamp);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("playing", checkAndClamp);
    }
  };

  return {
    getLiveHeadSeconds: getLiveHead,
    jumpToLive,
    seekTo,
    destroy,
  };
}

/**
 * React Hook for managing live broadcast playback constraints and UI state.
 */
export function useLiveBroadcastController(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  scheduledStartTime: Date | number | string,
  durationSeconds: number,
  liveThresholdSeconds = 2
) {
  const [broadcastState, setBroadcastState] = useState<LiveBroadcastState>(() => {
    const initialLiveHead = calculateCurrentLiveHead(scheduledStartTime, durationSeconds);
    return {
      liveHeadSeconds: initialLiveHead,
      currentTime: 0,
      durationSeconds,
      isAtLiveHead: true,
      secondsBehindLive: 0,
      airedPercentage: durationSeconds > 0 ? (initialLiveHead / durationSeconds) * 100 : 0,
    };
  });

  const [seekBlockedNotice, setSeekBlockedNotice] = useState<boolean>(false);
  const controllerRef = useRef<LiveHeadControllerInstance | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const controller = createLiveHeadController({
      videoElement: video,
      scheduledStartTime,
      durationSeconds,
      liveThresholdSeconds,
      onSyncUpdate: (state) => {
        setBroadcastState(state);
      },
      onSeekBlocked: () => {
        setSeekBlockedNotice(true);
        setTimeout(() => setSeekBlockedNotice(false), 2000);
      },
    });

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [videoRef, scheduledStartTime, durationSeconds, liveThresholdSeconds]);

  const jumpToLive = useCallback(() => {
    controllerRef.current?.jumpToLive();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    controllerRef.current?.seekTo(seconds);
  }, []);

  return {
    ...broadcastState,
    seekBlockedNotice,
    jumpToLive,
    seekTo,
  };
}
