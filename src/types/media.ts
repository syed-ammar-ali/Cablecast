/**
 * TypeScript definitions for TMDB API responses and the normalized
 * media shapes used throughout the app.
 */

export type MediaType = "movie" | "tv";

/** Raw shape returned by TMDB's /search/multi, /search/movie, /search/tv endpoints. */
export interface TmdbSearchResultRaw {
  id: number;
  media_type?: MediaType;
  title?: string; // movies
  name?: string; // tv
  release_date?: string; // movies
  first_air_date?: string; // tv
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  popularity: number;
}

export interface TmdbSearchResponseRaw {
  page: number;
  results: TmdbSearchResultRaw[];
  total_pages: number;
  total_results: number;
}

/** Normalized, UI-friendly media search result. */
export interface MediaSearchResult {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseYear: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
  voteAverage: number;
}

export interface MediaSearchResponse {
  page: number;
  results: MediaSearchResult[];
  totalPages: number;
  totalResults: number;
}

/** Raw shape returned by TMDB's /tv/{id}?append_to_response=credits,content_ratings endpoint (subset used by this app). */
export interface TmdbTvDetailsRaw {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  seasons: TmdbSeasonSummaryRaw[];
  vote_average?: number;
  genres?: TmdbGenreRaw[];
  spoken_languages?: TmdbSpokenLanguageRaw[];
  created_by?: TmdbCreatedByRaw[];
  credits?: TmdbCreditsRaw;
  content_ratings?: TmdbContentRatingsRaw;
}

export interface TmdbGenreRaw {
  id: number;
  name: string;
}

export interface TmdbSpokenLanguageRaw {
  english_name?: string;
  name?: string;
}

export interface TmdbCreatedByRaw {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface TmdbCastMemberRaw {
  id: number;
  name: string;
  character?: string;
  order?: number;
  profile_path: string | null;
}

export interface TmdbCrewMemberRaw {
  id: number;
  name: string;
  job: string;
  department?: string;
}

export interface TmdbCreditsRaw {
  cast?: TmdbCastMemberRaw[];
  crew?: TmdbCrewMemberRaw[];
}

export interface TmdbContentRatingResultRaw {
  iso_3166_1: string;
  rating: string;
}

export interface TmdbContentRatingsRaw {
  results?: TmdbContentRatingResultRaw[];
}

export interface TmdbReleaseDateEntryRaw {
  certification: string;
}

export interface TmdbReleaseDatesResultRaw {
  iso_3166_1: string;
  release_dates?: TmdbReleaseDateEntryRaw[];
}

export interface TmdbReleaseDatesRaw {
  results?: TmdbReleaseDatesResultRaw[];
}

export interface TmdbSeasonSummaryRaw {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

/** Raw shape returned by TMDB's /movie/{id}?append_to_response=credits,release_dates endpoint (subset used by this app). */
export interface TmdbMovieDetailsRaw {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  vote_average?: number;
  genres?: TmdbGenreRaw[];
  spoken_languages?: TmdbSpokenLanguageRaw[];
  credits?: TmdbCreditsRaw;
  release_dates?: TmdbReleaseDatesRaw;
}

/** Raw shape returned by TMDB's /tv/{id}/season/{season_number} endpoint. */
export interface TmdbSeasonDetailsRaw {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  episodes: TmdbEpisodeRaw[];
}

export interface TmdbEpisodeRaw {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

/** Normalized episode runtime, pre-computed for the 30-minute "channel block" grid. */
export interface NormalizedRuntime {
  /** Exact runtime as reported by TMDB, in minutes. */
  exactMinutes: number;
  /** Exact runtime converted to seconds, used for player seek math. */
  exactSeconds: number;
  /** Runtime rounded UP to the nearest 30-minute block (minimum of 1 block). */
  blockMinutes: number;
  /** Number of 30-minute blocks this runtime occupies. */
  blockCount: number;
}

export interface EpisodeSummary {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  airDate: string | null;
  runtime: NormalizedRuntime | null;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterUrl: string | null;
  overview: string;
}

/** A single cast member, normalized for display in the details view. */
export interface CastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface ShowDetails {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseYear: string | null;
  seasons: SeasonSummary[];
  numberOfSeasons: number;
  numberOfEpisodes: number;
  defaultRuntime: NormalizedRuntime | null;
  voteAverage: number;
  genres: string[];
  spokenLanguages: string[];
  /** e.g. "PG-13", "TV-MA", "U/A 16+" — best-effort, may be null if TMDB has no rating on file. */
  certification: string | null;
  cast: CastMember[];
  /** Directors for a movie, creators for a TV show — label depends on `mediaType`. */
  directors: string[];
  /** Producers / executive producers. */
  producers: string[];
}

/** Item currently loaded into the retro player. */
export interface NowPlayingItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  season: number;
  episode: number;
  startOffsetSeconds: number;
}
