import type { MediaType } from "./media";

export interface WatchHistoryItem {
  id: string;
  sessionId: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropUrl: string | null;
  releaseYear: string | null;
  season: number;
  episode: number;
  episodeTitle: string | null;
  progressSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  lastWatchedAt: string;
}

export interface WatchProgressPayload {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropUrl?: string | null;
  releaseYear?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string | null;
  progressSeconds: number;
  durationSeconds?: number | null;
  completed?: boolean;
}
