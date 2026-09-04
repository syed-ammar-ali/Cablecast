"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreatePersonalScheduleInput,
  MissedBroadcastItem,
  PersonalScheduleItem,
  SeasonCompletedAlertItem,
} from "@/types/broadcast";
import { CABLECAST_BROADCAST_MUTATION, notifyBroadcastMutation } from "./syncEvents";

const LOCAL_SCHEDULE_KEY = "cablecast_personal_schedule_cache";
const LOCAL_MISSED_KEY = "cablecast_personal_missed_cache";
const LOCAL_CHANNEL_NAME_KEY = "cablecast_personal_channel_name_cache";

function getInitialSchedule(): PersonalScheduleItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_SCHEDULE_KEY);
    return raw ? (JSON.parse(raw) as PersonalScheduleItem[]) : [];
  } catch {
    return [];
  }
}

function getInitialMissed(): MissedBroadcastItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_MISSED_KEY);
    return raw ? (JSON.parse(raw) as MissedBroadcastItem[]) : [];
  } catch {
    return [];
  }
}

function getInitialChannelName(): string {
  if (typeof window === "undefined") return "My Lineup";
  try {
    const raw = localStorage.getItem(LOCAL_CHANNEL_NAME_KEY);
    return raw ? (JSON.parse(raw) as string) : "My Lineup";
  } catch {
    return "My Lineup";
  }
}

function safeSetStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[Storage] Failed to cache key "${key}":`, err);
  }
}

export function usePersonalBroadcast() {
  const [schedule, setSchedule] = useState<PersonalScheduleItem[]>([]);
  const [missed, setMissed] = useState<MissedBroadcastItem[]>([]);
  const [channelName, setChannelName] = useState<string>("My Lineup");
  const [seasonAlerts, setSeasonAlerts] = useState<SeasonCompletedAlertItem[]>([]);
  const [liveNow, setLiveNow] = useState<PersonalScheduleItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize broadcast schedule quietly from server
  const syncFromServer = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/broadcast/personal", { signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.schedule)) {
          setSchedule(data.schedule);
          safeSetStorage(LOCAL_SCHEDULE_KEY, data.schedule);
        }
        if (Array.isArray(data.missed)) {
          setMissed(data.missed);
          safeSetStorage(LOCAL_MISSED_KEY, data.missed);
        }
        if (Array.isArray(data.seasonAlerts)) {
          setSeasonAlerts(data.seasonAlerts);
        }
        if (typeof data.channelName === "string") {
          setChannelName(data.channelName);
          safeSetStorage(LOCAL_CHANNEL_NAME_KEY, data.channelName);
        }
        setLiveNow(data.liveNow ?? null);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      console.debug?.("[PersonalBroadcast] Sync error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch once on mount, and re-fetch ONLY on mutation events or tab focus
  useEffect(() => {
    // Hydrate local cache on client mount (prevents SSR hydration mismatches)
    try {
      const cachedSchedule = localStorage.getItem(LOCAL_SCHEDULE_KEY);
      if (cachedSchedule) setSchedule(JSON.parse(cachedSchedule));
      const cachedMissed = localStorage.getItem(LOCAL_MISSED_KEY);
      if (cachedMissed) setMissed(JSON.parse(cachedMissed));
      const cachedName = localStorage.getItem(LOCAL_CHANNEL_NAME_KEY);
      if (cachedName) setChannelName(JSON.parse(cachedName));
    } catch {
      // ignore
    }

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncFromServer(controller.signal);

    const handleMutation = () => {
      void syncFromServer();
    };

    window.addEventListener(CABLECAST_BROADCAST_MUTATION, handleMutation);

    return () => {
      controller.abort();
      window.removeEventListener(CABLECAST_BROADCAST_MUTATION, handleMutation);
    };
  }, [syncFromServer]);

  const updateChannelName = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim() || "My Lineup";
      setChannelName(trimmed);
      safeSetStorage(LOCAL_CHANNEL_NAME_KEY, trimmed);
      notifyBroadcastMutation();

      try {
        await fetch("/api/broadcast/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "updateChannelName", channelName: trimmed }),
        });
      } catch (e) {
        console.error("Failed to update channel name:", e);
      }
    },
    [],
  );

  const dismissSeasonAlert = useCallback(
    async (alertId: string) => {
      setSeasonAlerts((prev) => prev.filter((a) => a.id !== alertId));
      notifyBroadcastMutation();
      try {
        await fetch("/api/broadcast/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismissSeasonAlert", alertId }),
        });
      } catch (e) {
        console.error("Failed to dismiss season alert:", e);
      }
    },
    [],
  );

  const addSchedule = useCallback(
    async (input: CreatePersonalScheduleInput): Promise<{ success: boolean; error?: string }> => {
      setError(null);
      try {
        const res = await fetch("/api/broadcast/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        const data = await res.json();

        if (!res.ok) {
          const errMsg = data.error || "Failed to schedule broadcast.";
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        notifyBroadcastMutation();
        void syncFromServer();
        return { success: true };
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : "Network error";
        setError(errMsg);
        return { success: false, error: errMsg };
      }
    },
    [syncFromServer],
  );

  const removeSchedule = useCallback(
    async (id: string) => {
      setSchedule((prev) => prev.filter((item) => item.id !== id));
      notifyBroadcastMutation();

      try {
        await fetch(`/api/broadcast/personal?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        void syncFromServer();
      } catch (e) {
        console.error("Failed to delete schedule item:", e);
      }
    },
    [syncFromServer],
  );

  const removeShowSchedule = useCallback(
    async (tmdbId: number) => {
      setSchedule((prev) => prev.filter((item) => item.tmdbId !== tmdbId));
      notifyBroadcastMutation();

      try {
        await fetch(`/api/broadcast/personal?tmdbId=${tmdbId}`, {
          method: "DELETE",
        });
        void syncFromServer();
      } catch (e) {
        console.error("Failed to delete show schedule:", e);
      }
    },
    [syncFromServer],
  );

  const rescheduleMissed = useCallback(
    async (
      missedId: string,
      targetDayOfWeek: number,
      targetBlockStartMinutes: number,
      mode: "move" | "one_off" = "move",
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/broadcast/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            missedId,
            action: "reschedule",
            mode,
            targetDayOfWeek,
            targetBlockStartMinutes,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.error || "Slot conflict or error" };
        }

        notifyBroadcastMutation();
        void syncFromServer();
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : "Network error" };
      }
    },
    [syncFromServer],
  );

  const dismissMissed = useCallback(
    async (missedId: string) => {
      setMissed((prev) => prev.filter((m) => m.id !== missedId));
      notifyBroadcastMutation();

      try {
        await fetch("/api/broadcast/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missedId, action: "dismiss" }),
        });
        void syncFromServer();
      } catch (e) {
        console.error("Failed to dismiss missed broadcast:", e);
      }
    },
    [syncFromServer],
  );

  const isScheduled = useCallback(
    (tmdbId: number | string, seasonNumber?: number) => {
      const numId = Number(tmdbId);
      return schedule.some(
        (item) =>
          item.tmdbId === numId &&
          (seasonNumber == null || item.mediaType !== "tv" || item.currentSeason === seasonNumber),
      );
    },
    [schedule],
  );

  const getScheduledDays = useCallback(
    (tmdbId: number | string): number[] => {
      const numId = Number(tmdbId);
      return schedule.filter((item) => item.tmdbId === numId).map((item) => item.dayOfWeek);
    },
    [schedule],
  );

  return {
    schedule,
    missed,
    seasonAlerts,
    channelName,
    liveNow,
    isLoading,
    error,
    addSchedule,
    removeSchedule,
    removeShowSchedule,
    rescheduleMissed,
    dismissMissed,
    dismissSeasonAlert,
    updateChannelName,
    isScheduled,
    getScheduledDays,
    refresh: syncFromServer,
  };
}
