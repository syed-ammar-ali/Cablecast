import type { BroadcastScheduleItem } from "@/types/tvmaze";

/**
 * "Live" math for the World Guide grid.
 *
 * DESIGN PRINCIPLE: Everything is relative to the USER'S LOCAL WALL CLOCK.
 * If the user's clock says 8:00 PM, then shows with airtime "20:00" are live —
 * regardless of network timezone, country, or what date is selected.
 *
 * `airstamp` (UTC) is NOT used for live detection — it would cause US shows to
 * appear live at different local times depending on the user's location, which
 * is the opposite of what we want.
 *
 * Deliberately isomorphic — no `server-only`, no fetch/env access.
 */

/** Default assumed length (minutes) for broadcasts TVmaze doesn't report a runtime for. */
const DEFAULT_RUNTIME_MINUTES = 30;

/** Formats a Date object to "YYYY-MM-DD" using local calendar components (not UTC). */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Effective duration in minutes used for sizing/positioning a guide card. */
export function getBroadcastRuntimeMinutes(item: Pick<BroadcastScheduleItem, "runtime">): number {
  return item.runtime && item.runtime > 0 ? item.runtime : DEFAULT_RUNTIME_MINUTES;
}

/**
 * Minutes-from-midnight the broadcast starts at, parsed from its `airtime` ("HH:MM").
 * Used for both horizontal pixel positioning AND local-clock live detection.
 */
export function getBroadcastStartMinutes(item: Pick<BroadcastScheduleItem, "airtime">): number {
  const [hours, minutes] = (item.airtime || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Whether a broadcast is airing right now according to the USER'S LOCAL CLOCK.
 * `airtime` is treated as a wall-clock label — if your clock says 8 PM,
 * a show with airtime "20:00" is live, wherever you are.
 *
 * NOTE: Only call this when you already know the airdate matches today's local
 * date — this function checks time only, not date.
 */
export function isBroadcastLiveNow(
  item: Pick<BroadcastScheduleItem, "airtime" | "runtime">,
  now: Date = new Date(),
): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = getBroadcastStartMinutes(item);
  const endMinutes = startMinutes + getBroadcastRuntimeMinutes(item);
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

/**
 * Seconds into the broadcast the user's local clock currently falls.
 * Used to jump the player to the correct live position.
 * Returns null if the broadcast is not currently airing.
 */
export function getBroadcastLiveOffsetSeconds(
  item: Pick<BroadcastScheduleItem, "airtime" | "runtime">,
  now: Date = new Date(),
): number | null {
  if (!isBroadcastLiveNow(item, now)) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = getBroadcastStartMinutes(item);
  return Math.max(0, (nowMinutes - startMinutes) * 60 + now.getSeconds());
}

// ── Legacy shape kept for useBroadcastResolver (offset-from-airstamp fallback) ──

/** @deprecated Use getBroadcastLiveOffsetSeconds instead. */
export function getBroadcastStartDate(item: Pick<BroadcastScheduleItem, "airstamp">): Date {
  return new Date(item.airstamp);
}

/** @deprecated Use getBroadcastLiveOffsetSeconds instead. */
export function getBroadcastEndDate(
  item: Pick<BroadcastScheduleItem, "airstamp" | "runtime">,
): Date {
  const start = new Date(item.airstamp);
  const minutes = item.runtime && item.runtime > 0 ? item.runtime : DEFAULT_RUNTIME_MINUTES;
  return new Date(start.getTime() + minutes * 60_000);
}
