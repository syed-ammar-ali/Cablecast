"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WatchHistoryItem, WatchProgressPayload } from "@/types/watchHistory";
import {
  CABLECAST_WATCH_HISTORY_MUTATION,
  notifyWatchHistoryMutation,
} from "./syncEvents";

const LOCAL_WATCH_HISTORY_KEY = "cablecast_continue_watching";

function safeSetStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[Storage] Failed to cache key "${key}":`, err);
  }
}

export function useWatchHistory() {
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isFetchingRef = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const res = await fetch("/api/watch-history", { signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.history)) {
          setContinueWatching(data.history);
          safeSetStorage(LOCAL_WATCH_HISTORY_KEY, data.history);
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      console.debug?.("[WatchHistory] Fetch error:", e);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Hydrate local cache on mount and setup sync listeners
  useEffect(() => {
    try {
      const cached = localStorage.getItem(LOCAL_WATCH_HISTORY_KEY);
      if (cached) {
        setContinueWatching(JSON.parse(cached));
      }
    } catch {
      // Ignore invalid JSON
    }

    const controller = new AbortController();
    void refresh(controller.signal);

    const handleMutation = () => {
      void refresh();
    };

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener(CABLECAST_WATCH_HISTORY_MUTATION, handleMutation);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      controller.abort();
      window.removeEventListener(CABLECAST_WATCH_HISTORY_MUTATION, handleMutation);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refresh]);

  const reportProgress = useCallback(
    async (payload: WatchProgressPayload) => {
      try {
        const res = await fetch("/api/watch-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          // If title was skipped because it's broadcasted, don't re-fetch
          if (!data.skipped) {
            notifyWatchHistoryMutation();
          }
        }
      } catch (err) {
        console.warn("[WatchHistory] Failed to report watch progress:", err);
      }
    },
    []
  );

  const removeEntry = useCallback(
    async (target: { id?: string; tmdbId?: number }) => {
      // Optimistic state update
      setContinueWatching((prev) =>
        prev.filter((item) => {
          if (target.id && item.id === target.id) return false;
          if (target.tmdbId && item.tmdbId === target.tmdbId) return false;
          return true;
        })
      );

      try {
        const params = new URLSearchParams();
        if (target.id) params.set("id", target.id);
        else if (target.tmdbId) params.set("tmdbId", String(target.tmdbId));

        const res = await fetch(`/api/watch-history?${params.toString()}`, {
          method: "DELETE",
        });

        if (res.ok) {
          notifyWatchHistoryMutation();
        } else {
          void refresh();
        }
      } catch (err) {
        console.warn("[WatchHistory] Failed to remove entry:", err);
        void refresh();
      }
    },
    [refresh]
  );

  return {
    continueWatching,
    isLoading,
    refresh,
    reportProgress,
    removeEntry,
  };
}
