export interface BlockStateParams {
  /** Scheduled start of the broadcast block (epoch ms, Date, or ISO string) */
  blockStartTime: number | string | Date;
  /** Duration of the main show in seconds (e.g., 22 minutes = 1320 seconds) */
  mainShowDurationSeconds: number;
  /** Total block duration in seconds (default: 30 minutes = 1800 seconds) */
  blockTotalSeconds?: number;
  /** Current system time for calculation (defaults to Date.now()) */
  currentTime?: number | string | Date;
}

export type BlockPhase = "main-show" | "bumper-gap" | "block-ended";

export interface BlockState {
  /** Whether the current live head is inside the main show, bumper gap, or past block */
  phase: BlockPhase;
  /** Total seconds elapsed since the scheduled block start time */
  elapsedTimeSeconds: number;
  /** Total configured main show duration in seconds */
  mainShowDurationSeconds: number;
  /** Total block duration in seconds (e.g., 1800s for a 30m block) */
  blockTotalSeconds: number;
  /** Calculated playback offset to apply to the active stream */
  streamOffsetSeconds: number;
  /** Seconds remaining in the current phase (main show or bumper) */
  remainingInPhaseSeconds: number;
  /** Seconds remaining in the entire 30-minute broadcast block */
  remainingInBlockSeconds: number;
  /** Percentage of the entire block completed (0 to 100) */
  blockProgressPercent: number;
}

export const DEFAULT_BLOCK_SECONDS = 30 * 60; // 1800 seconds (30 minutes)
export const DEFAULT_BUMPER_STREAM_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

/**
 * Requirement 1: Block State Calculation
 * Accepts a blockStartTime, a mainShowDuration (e.g., 22 minutes), and the current system time.
 * Determines if the current live head is inside the main show or inside the commercial/bumper gap.
 */
export function calculateBlockState(params: BlockStateParams): BlockState {
  const {
    blockStartTime,
    mainShowDurationSeconds,
    blockTotalSeconds = DEFAULT_BLOCK_SECONDS,
    currentTime = Date.now(),
  } = params;

  const startMs = typeof blockStartTime === "number"
    ? blockStartTime
    : new Date(blockStartTime).getTime();

  const currentMs = typeof currentTime === "number"
    ? currentTime
    : new Date(currentTime).getTime();

  const elapsedTimeSeconds = Math.max(0, (currentMs - startMs) / 1000);
  const safeShowDuration = Math.max(1, mainShowDurationSeconds);
  const safeBlockTotal = Math.max(safeShowDuration, blockTotalSeconds);

  let phase: BlockPhase = "main-show";
  let streamOffsetSeconds = 0;
  let remainingInPhaseSeconds = 0;

  if (elapsedTimeSeconds < safeShowDuration) {
    // 2. Main Show Phase
    phase = "main-show";
    streamOffsetSeconds = elapsedTimeSeconds;
    remainingInPhaseSeconds = safeShowDuration - elapsedTimeSeconds;
  } else if (elapsedTimeSeconds < safeBlockTotal) {
    // 3. Commercial / Bumper Gap Phase
    phase = "bumper-gap";
    streamOffsetSeconds = elapsedTimeSeconds - safeShowDuration;
    remainingInPhaseSeconds = safeBlockTotal - elapsedTimeSeconds;
  } else {
    // Block has concluded
    phase = "block-ended";
    streamOffsetSeconds = 0;
    remainingInPhaseSeconds = 0;
  }

  const remainingInBlockSeconds = Math.max(0, safeBlockTotal - elapsedTimeSeconds);
  const blockProgressPercent = Math.min(100, (elapsedTimeSeconds / safeBlockTotal) * 100);

  return {
    phase,
    elapsedTimeSeconds,
    mainShowDurationSeconds: safeShowDuration,
    blockTotalSeconds: safeBlockTotal,
    streamOffsetSeconds,
    remainingInPhaseSeconds,
    remainingInBlockSeconds,
    blockProgressPercent,
  };
}
