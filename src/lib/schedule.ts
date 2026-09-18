import { BLOCK_MINUTES, normalizeRuntime } from "@/lib/runtime";
import type { TimeSlot } from "@/types/schedule";

/**
 * Scheduling math for the "Appointment Matrix" EPG grid. Deliberately
 * isomorphic (no `server-only`, no fetch/env access) so it can run both in
 * API routes (validating/creating appointments) and in client components
 * (the live-ticking "On Air Now" grid).
 */

function formatSlotLabel(blockStartMinutes: number): string {
  const hours24 = Math.floor(blockStartMinutes / 60) % 24;
  const minutes = blockStartMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** Rounds a Date down to the start of its containing 30-minute block. */
function floorToBlock(date: Date): Date {
  const minutesSinceMidnight = date.getHours() * 60 + date.getMinutes();
  const blockStartMinutes = Math.floor(minutesSinceMidnight / BLOCK_MINUTES) * BLOCK_MINUTES;
  const floored = new Date(date);
  floored.setHours(Math.floor(blockStartMinutes / 60), blockStartMinutes % 60, 0, 0);
  return floored;
}

/** Returns the 30-minute time slot containing `referenceDate` (defaults to now). */
export function getCurrentTimeSlot(referenceDate: Date = new Date()): TimeSlot {
  const slotDate = floorToBlock(referenceDate);
  const blockStartMinutes = slotDate.getHours() * 60 + slotDate.getMinutes();

  return {
    dayOfWeek: slotDate.getDay(),
    blockStartMinutes,
    date: slotDate,
    label: formatSlotLabel(blockStartMinutes),
  };
}

/**
 * Returns `count` consecutive 30-minute time slots starting at the current
 * slot (inclusive), correctly rolling over day/week boundaries.
 * Supports optional `tzOffset` (in minutes from UTC) for server-side calculations.
 */
export function getUpcomingTimeSlots(
  count: number,
  referenceDate: Date = new Date(),
  tzOffset?: number,
): TimeSlot[] {
  if (tzOffset !== undefined) {
    const localMs = referenceDate.getTime() - tzOffset * 60 * 1000;
    const local = new Date(localMs);
    const totalMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const flooredMinutes = Math.floor(totalMinutes / BLOCK_MINUTES) * BLOCK_MINUTES;
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    const firstUtcMs = Date.UTC(y, m, d, 0, flooredMinutes, 0) + tzOffset * 60 * 1000;

    const slots: TimeSlot[] = [];
    for (let i = 0; i < count; i++) {
      const slotUtc = new Date(firstUtcMs + i * BLOCK_MINUTES * 60_000);
      const slotLocal = new Date(slotUtc.getTime() - tzOffset * 60 * 1000);
      const blockStartMinutes = slotLocal.getUTCHours() * 60 + slotLocal.getUTCMinutes();
      slots.push({
        dayOfWeek: slotLocal.getUTCDay(),
        blockStartMinutes,
        date: slotUtc,
        label: formatSlotLabel(blockStartMinutes),
      });
    }
    return slots;
  }

  const first = getCurrentTimeSlot(referenceDate);
  const slots: TimeSlot[] = [];

  for (let i = 0; i < count; i++) {
    const slotDate = new Date(first.date.getTime() + i * BLOCK_MINUTES * 60_000);
    const blockStartMinutes = slotDate.getHours() * 60 + slotDate.getMinutes();
    slots.push({
      dayOfWeek: slotDate.getDay(),
      blockStartMinutes,
      date: slotDate,
      label: formatSlotLabel(blockStartMinutes),
    });
  }

  return slots;
}

/**
 * Returns how many seconds into a broadcast `startTime` (which airs for
 * `durationMinutes`) the given `now` currently falls, or `null` if `now` is
 * before the start or after the broadcast has ended.
 */
export function calculateLiveOffset(
  startTime: Date,
  durationMinutes: number,
  now: Date = new Date(),
): number | null {
  const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
  const durationSeconds = durationMinutes * 60;

  if (elapsedSeconds < 0 || elapsedSeconds >= durationSeconds) return null;
  return elapsedSeconds;
}



interface AppointmentTiming {
  dayOfWeek: number;
  blockStartMinutes: number;
  blockCount: number;
}

/**
 * Whether an appointment (recurring weekly at dayOfWeek/blockStartMinutes) is airing right now.
 * Accepts an optional `tzOffset` (minutes from UTC, e.g. -330 for IST) for server environments.
 */
export function isAppointmentLiveNow(
  appointment: AppointmentTiming,
  now: Date = new Date(),
  tzOffset?: number,
): boolean {
  if (tzOffset !== undefined) {
    const localMs = now.getTime() - tzOffset * 60 * 1000;
    const local = new Date(localMs);
    if (appointment.dayOfWeek !== local.getUTCDay()) return false;

    const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();
    const start = appointment.blockStartMinutes;
    const end = start + appointment.blockCount * BLOCK_MINUTES;

    return minutesNow >= start && minutesNow < end;
  }

  if (appointment.dayOfWeek !== now.getDay()) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const start = appointment.blockStartMinutes;
  const end = start + appointment.blockCount * BLOCK_MINUTES;

  return minutesNow >= start && minutesNow < end;
}

/** Builds a concrete Date for "today" at the appointment's block start time. */
export function getAppointmentStartDate(
  appointment: Pick<AppointmentTiming, "blockStartMinutes">,
  now: Date = new Date(),
  tzOffset?: number,
): Date {
  if (tzOffset !== undefined) {
    const localMs = now.getTime() - tzOffset * 60 * 1000;
    const local = new Date(localMs);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    return new Date(
      Date.UTC(y, m, d, 0, appointment.blockStartMinutes, 0) + tzOffset * 60 * 1000,
    );
  }

  const startDate = new Date(now);
  startDate.setHours(
    Math.floor(appointment.blockStartMinutes / 60),
    appointment.blockStartMinutes % 60,
    0,
    0,
  );
  return startDate;
}

/** Builds a concrete Date for "today" at the moment the appointment's reserved block ends. */
export function getAppointmentEndDate(
  appointment: Pick<AppointmentTiming, "blockStartMinutes" | "blockCount">,
  now: Date = new Date(),
  tzOffset?: number,
): Date {
  const start = getAppointmentStartDate(appointment, now, tzOffset);
  return new Date(start.getTime() + appointment.blockCount * BLOCK_MINUTES * 60_000);
}

/** Milliseconds from `now` until the top of the next 30-minute block. */
export function msUntilNextBlockBoundary(now: Date = new Date()): number {
  const current = getCurrentTimeSlot(now);
  const nextBoundary = current.date.getTime() + BLOCK_MINUTES * 60_000;
  return Math.max(0, nextBoundary - now.getTime());
}

/**
 * Convenience combining the two helpers above: if the appointment is airing
 * right now, returns the live offset in seconds; otherwise returns null.
 */
export function getLiveOffsetForAppointment(
  appointment: AppointmentTiming,
  now: Date = new Date(),
  tzOffset?: number,
): number | null {
  if (!isAppointmentLiveNow(appointment, now, tzOffset)) return null;

  if (tzOffset !== undefined) {
    const localMs = now.getTime() - tzOffset * 60 * 1000;
    const local = new Date(localMs);
    const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();
    const elapsedMinutes = minutesNow - appointment.blockStartMinutes;
    return elapsedMinutes * 60 + local.getUTCSeconds();
  }

  return calculateLiveOffset(
    getAppointmentStartDate(appointment, now),
    appointment.blockCount * BLOCK_MINUTES,
    now,
  );
}

/** Formats a Date's exact wall-clock time, e.g. "8:30 PM" (not floored to a block). */
export function formatClockTime(date: Date = new Date()): string {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Calculates the next UTC Date when a slot (defined by dayOfWeek 0-6 and blockStartMinutes)
 * will air, properly taking timezone offset into account.
 */
export function getNextAirDate(
  dayOfWeek: number,
  blockStartMinutes: number,
  now: Date = new Date(),
  tzOffset: number = 0,
): Date {
  const localMs = now.getTime() - tzOffset * 60 * 1000;
  const local = new Date(localMs);
  const currentDay = local.getUTCDay();
  const currentMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  let daysUntil = (dayOfWeek - currentDay + 7) % 7;
  if (daysUntil === 0 && currentMinutes > blockStartMinutes) {
    daysUntil = 7;
  }

  const targetLocalMs = localMs + daysUntil * 24 * 60 * 60 * 1000;
  const targetLocal = new Date(targetLocalMs);
  const [y, m, d] = targetLocal.toISOString().slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, blockStartMinutes, 0) + tzOffset * 60 * 1000);
}

export { formatSlotLabel };
