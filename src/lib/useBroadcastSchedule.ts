import { useEffect, useState, useRef } from "react";
import type { BroadcastScheduleItem } from "@/types/tvmaze";

interface UseBroadcastScheduleResult {
  schedule: BroadcastScheduleItem[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches the real-world broadcast schedule for a country + date, shared by
 * the hero banner (to find what's live right now) and the World Guide grid
 * (to render it) so both read from one fetch instead of two.
 *
 * Employs an AbortController alongside a monotonically increasing fetchIdRef counter
 * to prevent out-of-order race conditions when date or country changes rapidly.
 */
export function useBroadcastSchedule(
  date: string,
  country: string,
  enabled: boolean = true,
): UseBroadcastScheduleResult {
  const [schedule, setSchedule] = useState<BroadcastScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const currentFetchId = ++fetchIdRef.current;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch(`/api/tvmaze/schedule?country=${country}&date=${date}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load the schedule.");
        return data as { schedule: BroadcastScheduleItem[] };
      })
      .then((data) => {
        if (currentFetchId === fetchIdRef.current) {
          setSchedule(data.schedule);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load the schedule.");
          setSchedule([]);
        }
      })
      .finally(() => {
        if (currentFetchId === fetchIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [date, country, enabled]);

  return { schedule, isLoading, error };
}
