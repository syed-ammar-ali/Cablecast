"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreatePersonalScheduleInput,
  MissedBroadcastItem,
  PersonalScheduleItem,
  SeasonCompletedAlertItem,
  SubscribedChannel,
} from "@/types/broadcast";
import { CABLECAST_BROADCAST_MUTATION, notifyBroadcastMutation } from "./syncEvents";

const LOCAL_SCHEDULE_KEY = "cablecast_personal_schedule_cache";
const LOCAL_MISSED_KEY = "cablecast_personal_missed_cache";
const LOCAL_CHANNEL_NAME_KEY = "cablecast_personal_channel_name_cache";
const LOCAL_SUBSCRIBED_CHANNELS_KEY = "cablecast_subscribed_channels_cache";

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

function getInitialSubscribedChannels(): SubscribedChannel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_SUBSCRIBED_CHANNELS_KEY);
    return raw ? (JSON.parse(raw) as SubscribedChannel[]) : [];
  } catch {
    return [];
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
  const [subscribedChannels, setSubscribedChannels] = useState<SubscribedChannel[]>([]);
  const [seasonAlerts, setSeasonAlerts] = useState<SeasonCompletedAlertItem[]>([]);
  const [liveNow, setLiveNow] = useState<PersonalScheduleItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side hydration from localStorage after mount to ensure SSR & client render consistency
  useEffect(() => {
    try {
      const cachedSchedule = getInitialSchedule();
      if (cachedSchedule.length > 0) setSchedule(cachedSchedule);
      const cachedMissed = getInitialMissed();
      if (cachedMissed.length > 0) setMissed(cachedMissed);
      const cachedName = getInitialChannelName();
      if (cachedName && cachedName !== "My Lineup") setChannelName(cachedName);
      const cachedSub = getInitialSubscribedChannels();
      if (cachedSub.length > 0) setSubscribedChannels(cachedSub);
    } catch {
      // ignore
    }
  }, []);

  // Synchronize broadcast schedule quietly from server
  const syncFromServer = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const tzOffset = typeof window !== "undefined" ? new Date().getTimezoneOffset() : 0;
      const res = await fetch(`/api/broadcast/personal?tzOffset=${tzOffset}`, { signal });
      if (res.ok) {
        setError(null);
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
        if (Array.isArray(data.subscribedChannels)) {
          setSubscribedChannels(data.subscribedChannels);
          safeSetStorage(LOCAL_SUBSCRIBED_CHANNELS_KEY, data.subscribedChannels);
        }
        setLiveNow(data.liveNow ?? null);
      } else {
        setError("Failed to sync personal broadcast lineup");
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Network error syncing broadcast lineup");
      console.debug?.("[PersonalBroadcast] Sync error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch once on mount, and re-fetch ONLY on mutation events or tab focus
  useEffect(() => {

    const controller = new AbortController();
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
      let previousAlerts: typeof seasonAlerts = [];
      setSeasonAlerts((prev) => {
        previousAlerts = prev;
        return prev.filter((a) => a.id !== alertId);
      });

      try {
        const res = await fetch("/api/broadcast/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismissSeasonAlert", alertId }),
        });
        if (!res.ok) {
          setSeasonAlerts(previousAlerts);
        }
      } catch (e) {
        console.error("Failed to dismiss season alert:", e);
        setSeasonAlerts(previousAlerts);
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

  const rescheduleActiveSlot = useCallback(
    async (
      scheduleId: string,
      targetDayOfWeek: number,
      targetBlockStartMinutes: number,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/broadcast/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId,
            action: "reschedule",
            targetDayOfWeek,
            targetBlockStartMinutes,
            timezoneOffset: new Date().getTimezoneOffset(),
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
      return (schedule || []).some(
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
      return (schedule || []).filter((item) => item.tmdbId === numId).map((item) => item.dayOfWeek);
    },
    [schedule],
  );

  const removeSubscribedChannel = useCallback(
    async (channelId: string) => {
      setSubscribedChannels((prev) => prev.filter((c) => c.id !== channelId));
      notifyBroadcastMutation();

      try {
        await fetch(`/api/channels/subscribed?id=${encodeURIComponent(channelId)}`, {
          method: "DELETE",
        });
        void syncFromServer();
      } catch (e) {
        console.error("Failed to delete subscribed channel:", e);
      }
    },
    [syncFromServer],
  );

  const markAsWatched = useCallback(
    async (scheduleId?: string, tmdbId?: number) => {
      if (!scheduleId && !tmdbId) return;
      setSchedule((prev) =>
        prev.map((item) => {
          if ((scheduleId && item.id === scheduleId) || (tmdbId && item.tmdbId === tmdbId)) {
            return { ...item, wasWatched: true };
          }
          return item;
        })
      );

      try {
        await fetch("/api/broadcast/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markWatched", scheduleId, tmdbId }),
        });
      } catch (e) {
        console.error("Failed to mark slot as watched:", e);
      }
    },
    [],
  );

  return {
    schedule,
    missed,
    seasonAlerts,
    channelName,
    subscribedChannels,
    liveNow,
    isLoading,
    error,
    addSchedule,
    removeSchedule,
    removeShowSchedule,
    removeSubscribedChannel,
    rescheduleActiveSlot,
    rescheduleMissed,
    dismissMissed,
    dismissSeasonAlert,
    updateChannelName,
    markAsWatched,
    isScheduled,
    getScheduledDays,
    refresh: syncFromServer,
  };
}

