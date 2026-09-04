import type { MediaSearchResult, MediaType } from "./media";

export interface PersonalScheduleItem {
  id: string;
  sessionId: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropUrl?: string | null;
  runtimeMinutes?: number | null;
  dayOfWeek: number; // 0 (Sunday) - 6 (Saturday)
  blockStartMinutes: number; // 0 - 1410 (30-min increments)
  blockCount: number;
  currentSeason: number;
  currentEpisode: number;
  totalEpisodes?: number | null;
  lastAiredDate?: string | null;
  lastAiredSeason?: number | null;
  lastAiredEpisode?: number | null;
  wasWatched: boolean;
  isRerun?: boolean;
  createdAt?: string;
  updatedAt?: string;

  // Runtime live properties computed by server/client
  isLiveNow?: boolean;
  liveOffsetSeconds?: number | null;
  timeLabel?: string; // e.g. "9:00 PM - 10:30 PM"
  slotStatus?: "OWNED" | "RENTED_VALID" | "RETURNED_EXPIRED";
  rentalExpiresAt?: string | null;
  isExpired?: boolean;
}

export interface MissedBroadcastItem {
  id: string;
  sessionId: string;
  scheduleId?: string | null;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropUrl?: string | null;
  runtimeMinutes?: number | null;
  blockCount?: number;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  originalAirDate: string;
  originalAirTime: string;
  isResolved: boolean;
  createdAt: string;
}

export interface SeasonCompletedAlertItem {
  id: string;
  sessionId: string;
  tmdbId: number;
  title: string;
  posterPath?: string | null;
  backdropUrl?: string | null;
  completedSeason: number;
  nextSeason?: number | null;
  isDismissed: boolean;
  createdAt: string;
}

export interface CreatePersonalScheduleInput {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropUrl?: string | null;
  runtimeMinutes?: number | null;
  daysOfWeek: number[]; // 0-6
  blockStartMinutes: number; // 0-1410
  startSeason?: number;
  startEpisode?: number;
  totalEpisodes?: number;
}

export const DAYS_OF_WEEK = [
  { day: 0, name: "Sunday", short: "Sun" },
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
];

export function formatBlockTime(blockStartMinutes: number): string {
  const hours24 = Math.floor(blockStartMinutes / 60) % 24;
  const minutes = blockStartMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function formatBlockTimeRange(blockStartMinutes: number, blockCount: number = 1): string {
  const startStr = formatBlockTime(blockStartMinutes);
  if (blockCount <= 1) {
    return startStr;
  }
  const endMinutes = blockStartMinutes + blockCount * 30;
  const endStr = formatBlockTime(endMinutes);
  return `${startStr} – ${endStr}`;
}

export function personalScheduleToMediaSearchResult(
  item: PersonalScheduleItem | MissedBroadcastItem | SeasonCompletedAlertItem,
): MediaSearchResult {
  return {
    tmdbId: item.tmdbId,
    mediaType: "mediaType" in item ? item.mediaType : "tv",
    title: item.title,
    posterPath: item.posterPath ?? null,
    posterUrl: item.posterPath ? `https://image.tmdb.org/t/p/w780${item.posterPath}` : null,
    backdropUrl: item.backdropUrl ?? null,
    overview: "",
    releaseYear: null,
    voteAverage: 0,
  };
}
