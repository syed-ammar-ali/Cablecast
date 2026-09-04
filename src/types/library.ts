import type { MediaType, MediaSearchResult } from "@/types/media";

export type LibraryTabKey = "COLLECTION" | "OWNED" | "RENTED";

export interface LibraryMediaItem {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropUrl?: string | null;
  releaseYear?: string | null;
  overview?: string | null;
  voteAverage?: number | null;
  seasonNumber?: number; // 0 for movies or entire show
  ownershipType: "OWNED" | "RENTED" | "SAVED";
  expiresAt?: string | null;
  createdAt: string;
}

export interface FavoriteItem {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropUrl: string | null;
  releaseYear: string | null;
  overview: string | null;
  voteAverage: number | null;
  createdAt: string;
}

export interface WatchHistoryItem {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropUrl: string | null;
  releaseYear: string | null;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  progressSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  lastWatchedAt: string;
}

export function toMediaSearchResult(item: FavoriteItem | WatchHistoryItem | LibraryMediaItem): MediaSearchResult {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    releaseYear: item.releaseYear ?? null,
    posterPath: item.posterPath ?? null,
    posterUrl: item.posterPath
      ? item.posterPath.startsWith("http")
        ? item.posterPath
        : `https://image.tmdb.org/t/p/w342${item.posterPath}`
      : null,
    backdropUrl: item.backdropUrl ?? null,
    overview: ("overview" in item ? item.overview : "") ?? "",
    voteAverage: ("voteAverage" in item ? item.voteAverage : 0) ?? 0,
  };
}
