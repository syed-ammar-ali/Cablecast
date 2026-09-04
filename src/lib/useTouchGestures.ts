import { useRef, useCallback } from "react";

interface TouchGestureHandlers {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onDoubleTap?: () => void;
  onTap?: () => void;
  minSwipeDistance?: number;
  maxSwipeTimeMs?: number;
}

export function useTouchGestures({
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  onDoubleTap,
  onTap,
  minSwipeDistance = 45,
  maxSwipeTimeMs = 600,
}: TouchGestureHandlers) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const now = Date.now();

      // Check double tap
      if (onDoubleTap && now - lastTapTimeRef.current < 300) {
        onDoubleTap();
        lastTapTimeRef.current = 0;
        touchStartRef.current = null;
        return;
      }
      lastTapTimeRef.current = now;

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: now,
      };
    },
    [onDoubleTap],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const start = touchStartRef.current;
      touchStartRef.current = null;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const deltaTime = Date.now() - start.time;

      if (deltaTime > maxSwipeTimeMs) return;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (Math.max(absX, absY) < minSwipeDistance) {
        onTap?.();
        return;
      }

      // Vertical Swipes (Channel Surfing)
      if (absY > absX) {
        if (deltaY < 0) {
          onSwipeUp?.();
        } else {
          onSwipeDown?.();
        }
      } else {
        // Horizontal Swipes (Volume / OSD)
        if (deltaX < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      }
    },
    [maxSwipeTimeMs, minSwipeDistance, onTap, onSwipeDown, onSwipeLeft, onSwipeRight, onSwipeUp],
  );

  return {
    handleTouchStart,
    handleTouchEnd,
  };
}
