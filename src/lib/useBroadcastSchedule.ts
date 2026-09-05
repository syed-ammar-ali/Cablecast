import { useEffect, useState } from "react";
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
 */
export function useBroadcastSchedule(
  date: string,
  country: string,
  enabled: boolean = true,
): UseBroadcastScheduleResult {
  const [schedule, setSchedule] = useState<BroadcastScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/tvmaze/schedule?country=${country}&date=${date}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load the schedule.");
        return data as { schedule: BroadcastScheduleItem[] };
      })
      .then((data) => {
        if (!cancelled) setSchedule(data.schedule);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setSchedule([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, country]);

  return { schedule, isLoading, error };
}
