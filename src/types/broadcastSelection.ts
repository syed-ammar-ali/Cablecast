import type { MediaSearchResult } from "@/types/media";

/** Resolved outcome of tapping a real-world broadcast slot — used by both the World Guide grid and the hero's "Live Now" panel. */
export interface BroadcastSelection {
  media: MediaSearchResult;
  season?: number;
  episode?: number;
  /** Set when this program is airing right now — syncs playback to the live broadcast offset. */
  startOffsetSeconds?: number;
  /** Scheduled start time of the program (ISO string, epoch ms, or Date) for exact real-time live clock sync. */
  startTime?: number | string | Date;
}
