"use client";

import { useCallback } from "react";
import { RotateCcw } from "lucide-react";
import type { LiveBroadcastState } from "@/lib/liveHeadController";

interface LiveScrubberProps {
  state: LiveBroadcastState;
  onSeek: (seconds: number) => void;
  onJumpToLive: () => void;
  disabled?: boolean;
}

function formatClockTime(seconds: number): string {
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

/**
 * Custom Broadcast Scrubber Bar that:
 * 1. Shows total program duration.
 * 2. Visualizes the aired "Live Window" boundary.
 * 3. Restricts scrubbing forward past the live broadcast head.
 * 4. Enables "Sync to Live" jump button if viewer is watching past content.
 */
export function LiveScrubber({
  state,
  onSeek,
  onJumpToLive,
  disabled = false,
}: LiveScrubberProps) {
  const {
    liveHeadSeconds,
    currentTime,
    durationSeconds,
    isAtLiveHead,
    secondsBehindLive,
    airedPercentage,
  } = state;

  const currentPercentage = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0;

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetVal = Number(e.target.value);
      // Extra safety: clamp to liveHeadSeconds
      onSeek(Math.min(targetVal, liveHeadSeconds));
    },
    [onSeek, liveHeadSeconds]
  );

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {/* Visual Timeline Track */}
      <div className="relative h-2 w-full rounded-full bg-neutral-800/80 overflow-hidden">
        {/* Gray/Dark portion = Future / Un-aired time */}

        {/* Amber/Blue Track = Aired Live Window (0 to Live Head) */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-neutral-600/60 rounded-full transition-all duration-300"
          style={{ width: `${airedPercentage}%` }}
        />

        {/* Red/Accent Track = Current Playback Position */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-red-500 rounded-full transition-all duration-100"
          style={{ width: `${Math.min(currentPercentage, airedPercentage)}%` }}
        />

        {/* Live Head Tick Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
          style={{ left: `${airedPercentage}%` }}
          title={`Live Head: ${formatClockTime(liveHeadSeconds)}`}
        />
      </div>

      {/* Interactive Range Input (Restricted to max = liveHeadSeconds) */}
      <div className="relative flex items-center">
        <input
          type="range"
          min={0}
          max={liveHeadSeconds > 0 ? liveHeadSeconds : 1}
          step={0.1}
          value={Math.min(currentTime, liveHeadSeconds)}
          onChange={handleInputChange}
          disabled={disabled || liveHeadSeconds <= 0}
          aria-label="Seek in broadcast"
          className="h-2 w-full cursor-pointer accent-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>

      {/* Status bar with time labels & Live Sync Button */}
      <div className="flex items-center justify-between text-[11px] text-neutral-400 font-medium">
        <div className="flex items-center gap-2">
          <span className="text-white font-mono">{formatClockTime(currentTime)}</span>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-500 font-mono" title="Total Program Duration">
            {formatClockTime(durationSeconds)}
          </span>
        </div>

        {/* Live Indicator / Jump to Live Button */}
        <div className="flex items-center gap-2">
          {isAtLiveHead ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-500 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              LIVE
            </span>
          ) : (
            <button
              type="button"
              onClick={onJumpToLive}
              title="Catch up to current live broadcast"
              className="flex items-center gap-1 rounded bg-red-600/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-semibold text-red-400 transition-colors hover:bg-red-600 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              JUMP TO LIVE (-{formatClockTime(secondsBehindLive)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
