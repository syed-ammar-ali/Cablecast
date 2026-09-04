import type { NormalizedRuntime } from "@/types/media";

/** 30-minute "channel block" used for the retro appointment grid. */
export const BLOCK_MINUTES = 30;

/**
 * Converts an exact runtime (in minutes) into the normalized shape used by
 * the retro "channel block" scheduling grid. Runtimes are rounded UP to the
 * nearest 30-minute block so a 42-minute episode reserves a full hour slot,
 * matching how broadcast TV schedules always aired in fixed increments.
 *
 * Deliberately isomorphic (no `server-only` import, no TMDB fetch) so both
 * server routes and client components (e.g. the live-ticking EPG grid) can
 * import it directly.
 */
export function normalizeRuntime(minutes: number): NormalizedRuntime {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const blockCount = Math.max(1, Math.ceil(safeMinutes / BLOCK_MINUTES));
  const blockMinutes = blockCount * BLOCK_MINUTES;

  return {
    exactMinutes: safeMinutes,
    exactSeconds: Math.round(safeMinutes * 60),
    blockMinutes,
    blockCount,
  };
}
