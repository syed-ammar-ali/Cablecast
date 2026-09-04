import type { MediaType } from "@/types/media";

/** A single 30-minute column on the EPG grid's X-axis. */
export interface TimeSlot {
  /** 0 (Sunday) - 6 (Saturday), matches JS Date#getDay(). */
  dayOfWeek: number;
  /** Minutes from midnight, snapped to the 30-minute grid. */
  blockStartMinutes: number;
  /** Concrete Date instance this slot represents (today/this week). */
  date: Date;
  /** Human-readable label, e.g. "8:00 PM". */
  label: string;
}

/** Raw appointment row as persisted in SQLite via Prisma. */
export interface ScheduledAppointmentRecord {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  season: number | null;
  episode: number | null;
  channelNumber: number;
  dayOfWeek: number;
  blockStartMinutes: number;
  blockCount: number;
  /** Exact TMDB runtime in minutes, if known (used for bumper filler timing). */
  runtimeMinutes: number | null;
  posterPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Client-facing appointment, enriched with channel + live-status info. */
export interface ScheduleEntry extends ScheduledAppointmentRecord {
  channelName: string;
  channelGenre: string;
  channelAccentColor: string;
  isLiveNow: boolean;
  /** Seconds into the broadcast right now, or null if not currently airing. */
  liveOffsetSeconds: number | null;
}

export interface CreateAppointmentInput {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  season?: number | null;
  episode?: number | null;
  channelNumber: number;
  dayOfWeek: number;
  blockStartMinutes: number;
  blockCount?: number;
  runtimeMinutes?: number | null;
  posterPath?: string | null;
}
