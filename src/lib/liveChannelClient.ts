import type { ScheduleEntry } from "@/types/schedule";
import { isAppointmentLiveNow } from "@/lib/schedule";

/**
 * Client-side helper used by the player when channel-surfing: asks the
 * schedule API what (if anything) is airing on `channelNumber` right now.
 * Returns `null` when the channel is off-air (no appointment covers the
 * current 30-minute block). Evaluates both server and client clocks to
 * prevent clock-skew edge cases at block boundaries.
 */
export async function fetchChannelNowPlaying(
  channelNumber: number,
): Promise<ScheduleEntry | null> {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as { appointments: ScheduleEntry[] };
    const now = new Date();
    return (
      data.appointments.find(
        (entry) =>
          entry.channelNumber === channelNumber &&
          (entry.isLiveNow ||
            isAppointmentLiveNow(
              {
                dayOfWeek: entry.dayOfWeek,
                blockStartMinutes: entry.blockStartMinutes,
                blockCount: entry.blockCount,
              },
              now,
            )),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Returns the immediate next scheduled appointment on `channelNumber`
 * that starts later today or in upcoming schedule blocks, or null if none.
 */
export async function fetchChannelNextUpcoming(
  channelNumber: number,
): Promise<ScheduleEntry | null> {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as { appointments: ScheduleEntry[] };
    const now = new Date();
    const currentDay = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Filter appointments for this channel scheduled for later today
    const upcomingToday = data.appointments
      .filter(
        (entry) =>
          entry.channelNumber === channelNumber &&
          entry.dayOfWeek === currentDay &&
          entry.blockStartMinutes > currentMinutes,
      )
      .sort((a, b) => a.blockStartMinutes - b.blockStartMinutes);

    if (upcomingToday.length > 0) return upcomingToday[0];

    // Otherwise find the earliest upcoming appointment on subsequent days
    const upcomingLater = data.appointments
      .filter((entry) => entry.channelNumber === channelNumber)
      .sort((a, b) => {
        const dayDiffA = (a.dayOfWeek - currentDay + 7) % 7;
        const dayDiffB = (b.dayOfWeek - currentDay + 7) % 7;
        if (dayDiffA !== dayDiffB) return dayDiffA - dayDiffB;
        return a.blockStartMinutes - b.blockStartMinutes;
      });

    return upcomingLater[0] ?? null;
  } catch {
    return null;
  }
}

