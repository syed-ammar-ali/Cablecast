"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "@/config/channels";
import { Radio, Tv, Volume2, VolumeX } from "lucide-react";

/** Classic 7-bar SMPTE color bar sequence (top field). */
const TOP_BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c0c0", "#c000c0", "#c00000", "#0000c0"];
/** Reversed/inverted bars (middle field), authentic to the SMPTE pattern. */
const MID_BARS = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];

export type DeadAirVisualMode = "static-snow" | "smpte-bars";

export interface DeadAirScreenProps {
  channel?: Channel;
  nextProgramTitle?: string;
  nextProgramStartTime?: number | string | Date;
  defaultMode?: DeadAirVisualMode;
  statusLabel?: string;
  reasonLabel?: string;
  /** Fired automatically when the clock reaches the next program's start time */
  onProgramStart?: () => void;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const hrs = Math.floor(mins / 60);
  const padSecs = String(secs).padStart(2, "0");
  if (hrs > 0) {
    const padMins = String(mins % 60).padStart(2, "0");
    return `${hrs}:${padMins}:${padSecs}`;
  }
  return `${String(mins).padStart(2, "0")}:${padSecs}`;
}

export function DeadAirScreen({
  channel,
  nextProgramTitle,
  nextProgramStartTime,
  defaultMode = "static-snow",
  statusLabel = "OFF AIR",
  reasonLabel = "Please Stand By",
  onProgramStart,
}: DeadAirScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visualMode, setVisualMode] = useState<DeadAirVisualMode>(defaultMode);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [secondsUntilNext, setSecondsUntilNext] = useState<number | null>(() => {
    if (!nextProgramStartTime) return null;
    const targetMs = typeof nextProgramStartTime === "number"
      ? nextProgramStartTime
      : new Date(nextProgramStartTime).getTime();
    return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscNodeRef = useRef<OscillatorNode | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // ---------------------------------------------------------------------------
  // 4. Auto-Recovery Polling: checks every second against nextProgramStartTime
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!nextProgramStartTime) return;

    const targetMs = typeof nextProgramStartTime === "number"
      ? nextProgramStartTime
      : new Date(nextProgramStartTime).getTime();

    if (targetMs - Date.now() <= 0) {
      onProgramStart?.();
      return;
    }

    const intervalId = setInterval(() => {
      const remainingMs = targetMs - Date.now();
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
      setSecondsUntilNext(remainingSecs);

      // Exact moment the clock reaches the start time — fire ONCE and stop polling.
      if (remainingMs <= 0) {
        clearInterval(intervalId);
        console.log("[DeadAirScreen] Next program start time reached! Triggering live recovery...");
        onProgramStart?.();
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [nextProgramStartTime, onProgramStart]);

  // ---------------------------------------------------------------------------
  // 2. HTML5 Canvas TV Static / Snow Animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (visualMode !== "static-snow") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      // Lower internal resolution for authentic retro CRT grain and 60fps performance
      canvas.width = Math.max(320, Math.floor(window.innerWidth / 3));
      canvas.height = Math.max(240, Math.floor(window.innerHeight / 3));
    };

    resize();
    window.addEventListener("resize", resize);

    const renderStatic = () => {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;

      const imgData = ctx.createImageData(width, height);
      const buffer32 = new Uint32Array(imgData.data.buffer);
      const len = buffer32.length;

      // Fill buffer with random pixel noise + subtle scanline interference
      for (let i = 0; i < len; i++) {
        const val = (Math.random() * 255) | 0;
        // Format: 0xAABBGGRR
        buffer32[i] = (255 << 24) | (val << 16) | (val << 8) | val;
      }

      ctx.putImageData(imgData, 0, 0);
      animationFrameId = requestAnimationFrame(renderStatic);
    };

    animationFrameId = requestAnimationFrame(renderStatic);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [visualMode]);

  // ---------------------------------------------------------------------------
  // 3. Web Audio API Synthesis: White Noise or 1kHz Sine Wave
  // ---------------------------------------------------------------------------
  const stopAudio = useCallback(() => {
    try {
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 0.05);
      }
      if (oscNodeRef.current) {
        oscNodeRef.current.stop(audioCtxRef.current ? audioCtxRef.current.currentTime + 0.06 : 0);
        oscNodeRef.current.disconnect();
        oscNodeRef.current = null;
      }
      if (noiseSourceRef.current) {
        noiseSourceRef.current.stop(audioCtxRef.current ? audioCtxRef.current.currentTime + 0.06 : 0);
        noiseSourceRef.current.disconnect();
        noiseSourceRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.suspend();
      }
    } catch {
      // Ignore cleanup error on torn down context
    }
    setIsAudioActive(false);
  }, []);

  const startAudio = useCallback(async (targetMode?: DeadAirVisualMode) => {
    stopAudio();

    const mode = targetMode ?? visualMode;

    try {
      // Lazy init AudioContext on user interaction
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      if (mode === "static-snow") {
        // Generate authentic filtered white noise for TV static
        const bufferSize = ctx.sampleRate * 2; // 2 seconds looped noise buffer
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        // Bandpass/Lowpass filter for realistic retro TV CRT speaker frequency response
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(650, ctx.currentTime);
        filter.Q.setValueAtTime(1.2, ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(masterGain);

        masterGain.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 0.1);
        whiteNoise.start();
        noiseSourceRef.current = whiteNoise;
      } else {
        // Generate 1kHz standard broadcast SMPTE calibration test tone
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1000, ctx.currentTime); // 1,000 Hz

        osc.connect(masterGain);
        masterGain.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.1);
        osc.start();
        oscNodeRef.current = osc;
      }

      setIsAudioActive(true);
    } catch (err) {
      console.warn("[DeadAirScreen] Web Audio synthesis blocked or failed:", err);
      setIsAudioActive(false);
    }
  }, [stopAudio, visualMode]);

  // Teardown audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopAudio]);

  const toggleAudio = () => {
    if (isAudioActive) stopAudio();
    else void startAudio();
  };

  const handleToggleVisualMode = () => {
    const nextMode: DeadAirVisualMode = visualMode === "static-snow" ? "smpte-bars" : "static-snow";
    setVisualMode(nextMode);
    if (isAudioActive) {
      void startAudio(nextMode);
    }
  };

  return (
    <div className="group relative h-full w-full overflow-hidden bg-black font-mono select-none">
      {/* 2. Visual Effects: Static Snow vs SMPTE Color Bars */}
      {visualMode === "static-snow" ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col">
          {/* Top SMPTE Bars */}
          <div className="flex h-[68%] w-full">
            {TOP_BARS.map((color, index) => (
              <div key={index} className="h-full flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>

          {/* Mid Inverted Bars */}
          <div className="flex h-[8%] w-full">
            {MID_BARS.map((color, index) => (
              <div key={index} className="h-full flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>

          {/* Bottom Black/Cast Blocks */}
          <div className="flex h-[24%] w-full bg-[#0d0d0d]">
            <div
              className="h-full flex-[5]"
              style={{ background: "linear-gradient(90deg, #16165c 0%, #0d0d0d 50%, #4b154b 100%)" }}
            />
            <div className="h-full flex-1 bg-[#050505]" />
            <div className="h-full flex-1 bg-[#0d0d0d]" />
            <div className="h-full flex-1 bg-[#1a1a1a]" />
          </div>
        </div>
      )}

      {/* CRT Scanline and Phosphor Glow Layer */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 2px)",
        }}
      />

      {/* CRT Vignette Curvature Layer */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(circle at center, transparent 55%, rgba(0, 0, 0, 0.85) 100%)",
        }}
      />

      {/* Center Retro OSD Display Box */}
      <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-lg border-2 border-neutral-600/70 bg-black/90 p-6 text-center shadow-[0_0_50px_rgba(0,0,0,0.95)] backdrop-blur-md">
          {/* Status Header */}
          <div className="flex items-center justify-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
            <p className="text-2xl sm:text-3xl font-extrabold uppercase tracking-[0.3em] text-red-500">
              {statusLabel}
            </p>
          </div>

          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">
            {reasonLabel}
          </p>

          {/* Channel Label */}
          {channel && (
            <div className="mt-4 rounded border border-neutral-800 bg-neutral-950/80 px-3 py-1.5 text-xs text-neutral-300">
              <span className="font-bold text-white uppercase tracking-wider">{channel.name}</span>
              <span className="mx-2 text-neutral-600">·</span>
              <span className="text-neutral-500">CH {channel.number}</span>
            </div>
          )}

          {/* Next Program Countdown */}
          {nextProgramTitle && (
            <div className="mt-4 flex flex-col items-center gap-1 border-t border-neutral-800 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">
                Next Scheduled Broadcast
              </p>
              <p className="truncate text-sm font-bold text-neutral-200">{nextProgramTitle}</p>
              {secondsUntilNext !== null && (
                <p className="mt-1 font-mono text-xs font-semibold text-emerald-400">
                  Starts in {formatCountdown(secondsUntilNext)}
                </p>
              )}
            </div>
          )}

          {/* Audio & Visual Controls */}
          <div className="mt-6 flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={toggleAudio}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                isAudioActive
                  ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40"
                  : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-white"
              }`}
            >
              {isAudioActive ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              {isAudioActive ? "Mute Static Audio" : "Play Static Audio"}
            </button>

            <button
              type="button"
              onClick={handleToggleVisualMode}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
            >
              {visualMode === "static-snow" ? <Tv className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
              {visualMode === "static-snow" ? "SMPTE Bars" : "Snow Static"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
