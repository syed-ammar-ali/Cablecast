"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { RotateCw, ArrowDown, Radio } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 68;
const MAX_PULL = 110;

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const isTrackingRef = useRef(false);
  const pullDistanceRef = useRef(0);

  pullDistanceRef.current = pullDistance;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only track if user is scrolled to the very top of the window
    if (window.scrollY > 5 || isRefreshing) return;
    startYRef.current = e.touches[0].clientY;
    isTrackingRef.current = true;
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTrackingRef.current || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0 && window.scrollY <= 0) {
      // Apply quadratic dampening for natural tactile resistance
      const dampened = Math.min(MAX_PULL, Math.pow(diff, 0.85) * 1.5);
      setPullDistance(dampened);

      // Light haptic tick when crossing threshold
      if (dampened >= PULL_THRESHOLD && pullDistanceRef.current < PULL_THRESHOLD) {
        triggerHaptic(10);
      }
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isTrackingRef.current) return;
    isTrackingRef.current = false;

    if (pullDistanceRef.current >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(48); // Hold at active position
      triggerHaptic(18);

      try {
        await Promise.resolve(onRefresh());
      } catch (err) {
        console.error("[PullToRefresh] refresh failed:", err);
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 400);
      }
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing, onRefresh]);

  useEffect(() => {
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const isTriggerReady = pullDistance >= PULL_THRESHOLD;

  return (
    <div className="relative w-full">
      {/* Retro Pull Indicator */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex items-center justify-center transition-transform duration-200 ease-out"
        style={{
          transform: `translateY(${Math.max(0, pullDistance - 44)}px)`,
          opacity: pullDistance > 8 ? Math.min(1, pullDistance / 40) : 0,
        }}
      >
        <div
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 shadow-2xl backdrop-blur-md font-mono text-[10px] uppercase tracking-wider transition-colors ${
            isRefreshing
              ? "border-amber-500/80 bg-neutral-950/95 text-amber-300 shadow-amber-950/60"
              : isTriggerReady
                ? "border-amber-400 bg-neutral-900/95 text-white shadow-amber-950/40"
                : "border-neutral-800 bg-neutral-950/90 text-neutral-400"
          }`}
        >
          {isRefreshing ? (
            <>
              <RotateCw className="h-3 w-3 animate-spin text-amber-400" />
              <span>Tuning Frequencies...</span>
            </>
          ) : isTriggerReady ? (
            <>
              <Radio className="h-3 w-3 animate-pulse text-amber-400" />
              <span className="font-bold text-amber-300">Release to Refresh</span>
            </>
          ) : (
            <>
              <ArrowDown className="h-3 w-3 text-neutral-400" />
              <span>Pull to Refresh Archive</span>
            </>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
