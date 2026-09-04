import type { ScheduleEntry } from "@/types/schedule";

/**
 * Client-side helper used by the player when channel-surfing: asks the
 * schedule API what (if anything) is airing on `channelNumber` right now.
 * Returns `null` when the channel is off-air (no appointment covers the
 * current 30-minute block).
 */
export async function fetchChannelNowPlaying(
  channelNumber: number,
): Promise<ScheduleEntry | null> {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as { appointments: ScheduleEntry[] };
    return (
      data.appointments.find(
        (entry) => entry.channelNumber === channelNumber && entry.isLiveNow,
      ) ?? null
    );
  } catch {
    return null;
  }
}
