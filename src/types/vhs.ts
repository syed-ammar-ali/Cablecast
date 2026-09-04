export interface VhsEpisode {
  episodeNumber: number;
  name: string;
  runtime: number;
}

export interface VhsCredits {
  creators: string[];
  mainCast: string[];
}

export interface VhsSeasonSummary {
  seasonNumber: number;
  name: string;
  posterPath?: string;
  episodeCount?: number;
}

export interface VhsMetadata {
  mediaId: string | number;
  mediaType: "MOVIE" | "TV";
  seasonNumber?: number;
  totalSeasons?: number;
  seasons?: VhsSeasonSummary[];
  frontPosterPath: string; // Full TMDB image URL
  synopsis: string; // Season overview or movie overview
  guestStars: string[]; // Array of top unique guest star names
  episodes: VhsEpisode[]; // Array<{ episodeNumber: number; name: string; runtime: number }>
  credits: VhsCredits; // { creators: string[]; mainCast: string[] }
  calculatedRuntime: number; // Total runtime in minutes
  releaseYear?: string;
  voteAverage?: number;
}
