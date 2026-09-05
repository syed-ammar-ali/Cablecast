import "server-only";
import { normalizeRuntime } from "@/lib/runtime";
import { buildImageUrl } from "@/lib/tmdbImage";
import type {
  CastMember,
  EpisodeSummary,
  MediaSearchResponse,
  MediaSearchResult,
  MediaType,
  NormalizedRuntime,
  SeasonSummary,
  ShowDetails,
  TmdbCreditsRaw,
  TmdbEpisodeRaw,
  TmdbMovieDetailsRaw,
  TmdbSearchResponseRaw,
  TmdbSearchResultRaw,
  TmdbSeasonDetailsRaw,
  TmdbTvDetailsRaw,
} from "@/types/media";

const TMDB_BASE_URL = "https://api.tmdb.org/3";

const POSTER_SIZE = "w342";
const BACKDROP_SIZE = "w1280";
const STILL_SIZE = "w300";
const PROFILE_SIZE = "w185";

/** Certifications are per-country on TMDB — prefer these, in order, then fall back to the first one with any value at all. */
const PREFERRED_CERTIFICATION_COUNTRIES = ["US", "IN", "GB"];
const MAX_CAST_MEMBERS = 12;
const MAX_CREW_NAMES = 4;

class TmdbApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TmdbApiError";
  }
}

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === "your_tmdb_api_key_here") {
    throw new TmdbApiError(
      "TMDB_API_KEY is not configured. Add a real key to your .env.local file.",
      500,
    );
  }
  return key;
}

const MAX_NETWORK_RETRIES = 2;
const RETRY_BACKOFF_MS = 150;

async function tmdbFetch<T>(
  path: string,
  searchParams: Record<string, string | number | undefined> = {},
  options?: { cache?: RequestCache; revalidate?: number },
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastNetworkError: unknown;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    let res: Response;
    try {
      const fetchInit: RequestInit = {
        headers: {
          Accept: "application/json",
          "User-Agent": "Cablecast/1.0 (Home Theater Console)",
        },
        signal: AbortSignal.timeout(6000),
      };

      if (options?.cache) {
        fetchInit.cache = options.cache;
      } else {
        (fetchInit as any).next = { revalidate: options?.revalidate ?? 60 * 30 };
      }

      res = await fetch(url.toString(), fetchInit);
    } catch (error) {
      // Transient network-level failures (e.g. ECONNRESET) — retry with a
      // short backoff rather than surfacing a 500 for a blip.
      lastNetworkError = error;
      if (attempt < MAX_NETWORK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
      throw new TmdbApiError(
        "Could not reach the media catalog — the connection was reset. Please try again.",
        503,
      );
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TmdbApiError(
        body?.status_message ?? `Media catalog request failed with status ${res.status}`,
        res.status,
      );
    }

    return res.json() as Promise<T>;
  }

  // Fallback if all retry loops exit unexpectedly
  throw new TmdbApiError(
    lastNetworkError instanceof Error
      ? `Catalog network error: ${lastNetworkError.message}`
      : "Failed to reach media catalog.",
    503,
  );
}

// Re-exported for backward compatibility with existing imports from "@/lib/tmdb".
export { normalizeRuntime, buildImageUrl };

function extractYear(dateString: string | undefined | null): string | null {
  if (!dateString) return null;
  const year = dateString.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function normalizeSearchResult(raw: TmdbSearchResultRaw): MediaSearchResult | null {
  const mediaType = raw.media_type;
  if (mediaType !== "movie" && mediaType !== "tv") {
    // Skip "person" results and anything else /search/multi returns.
    return null;
  }

  const title = mediaType === "movie" ? raw.title : raw.name;
  if (!title) return null;

  return {
    tmdbId: raw.id,
    mediaType,
    title,
    releaseYear: extractYear(
      mediaType === "movie" ? raw.release_date : raw.first_air_date,
    ),
    posterPath: raw.poster_path,
    posterUrl: buildImageUrl(raw.poster_path, POSTER_SIZE),
    backdropUrl: buildImageUrl(raw.backdrop_path, BACKDROP_SIZE),
    overview: raw.overview ?? "",
    voteAverage: raw.vote_average ?? 0,
  };
}

/**
 * Searches movies and TV shows in a single call via TMDB's /search/multi
 * endpoint, then normalizes + filters out non-media (e.g. "person") hits.
 */
export async function searchMedia(
  query: string,
  page = 1,
): Promise<MediaSearchResponse> {
  if (!query.trim()) {
    return { page: 1, results: [], totalPages: 0, totalResults: 0 };
  }

  const raw = await tmdbFetch<TmdbSearchResponseRaw>(
    "/search/multi",
    {
      query,
      page,
      include_adult: "false",
    },
    { cache: "no-store" },
  );

  const results = raw.results
    .map(normalizeSearchResult)
    .filter((item): item is MediaSearchResult => item !== null);

  return {
    page: raw.page,
    results,
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
  };
}

/** Fetches today's trending movies/TV shows, for the guide's hero banner. */
export async function getTrendingMedia(): Promise<MediaSearchResult[]> {
  const raw = await tmdbFetch<TmdbSearchResponseRaw>("/trending/all/day");
  return raw.results
    .map(normalizeSearchResult)
    .filter((item): item is MediaSearchResult => item !== null);
}

function dedupeNames(names: string[]): string[] {
  return Array.from(new Set(names.filter(Boolean)));
}

function normalizeCredits(credits: TmdbCreditsRaw | undefined): {
  cast: CastMember[];
  producers: string[];
} {
  const cast: CastMember[] = (credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_CAST_MEMBERS)
    .map((member) => ({
      id: member.id,
      name: member.name,
      character: member.character ?? "",
      profileUrl: buildImageUrl(member.profile_path, PROFILE_SIZE),
    }));

  const producers = dedupeNames(
    (credits?.crew ?? [])
      .filter((member) => member.job === "Producer" || member.job === "Executive Producer")
      .map((member) => member.name),
  ).slice(0, MAX_CREW_NAMES);

  return { cast, producers };
}

/** Movies: TMDB's `/movie/{id}/credits` crew includes a "Director" job. */
function extractMovieDirectors(credits: TmdbCreditsRaw | undefined): string[] {
  return dedupeNames(
    (credits?.crew ?? []).filter((member) => member.job === "Director").map((member) => member.name),
  ).slice(0, MAX_CREW_NAMES);
}

/** Best-effort certification lookup — TMDB reports these per-country, so we try a short preference list before giving up. */
function extractMovieCertification(raw: TmdbMovieDetailsRaw): string | null {
  const results = raw.release_dates?.results ?? [];
  for (const country of PREFERRED_CERTIFICATION_COUNTRIES) {
    const match = results.find((entry) => entry.iso_3166_1 === country);
    const certification = match?.release_dates?.find((entry) => entry.certification)?.certification;
    if (certification) return certification;
  }
  const anyMatch = results
    .flatMap((entry) => entry.release_dates ?? [])
    .find((entry) => entry.certification);
  return anyMatch?.certification ?? null;
}

function extractTvCertification(raw: TmdbTvDetailsRaw): string | null {
  const results = raw.content_ratings?.results ?? [];
  for (const country of PREFERRED_CERTIFICATION_COUNTRIES) {
    const match = results.find((entry) => entry.iso_3166_1 === country && entry.rating);
    if (match?.rating) return match.rating;
  }
  return results.find((entry) => entry.rating)?.rating ?? null;
}

function normalizeSpokenLanguages(raw: TmdbTvDetailsRaw["spoken_languages"]): string[] {
  return dedupeNames((raw ?? []).map((lang) => lang.english_name ?? lang.name ?? ""));
}

function normalizeSeasonSummary(raw: TmdbTvDetailsRaw["seasons"][number]): SeasonSummary {
  return {
    seasonNumber: raw.season_number,
    name: raw.name,
    episodeCount: raw.episode_count,
    airDate: raw.air_date,
    posterUrl: buildImageUrl(raw.poster_path, POSTER_SIZE),
    overview: raw.overview ?? "",
  };
}

/** Fetches full details + season list + credits/content ratings for a TV show. */
export async function getShowDetails(tmdbId: number | string): Promise<ShowDetails> {
  const raw = await tmdbFetch<TmdbTvDetailsRaw>(`/tv/${tmdbId}`, {
    append_to_response: "credits,content_ratings",
  });

  const defaultMinutes = raw.episode_run_time?.[0] ?? 0;
  const { cast, producers } = normalizeCredits(raw.credits);
  const creators = dedupeNames((raw.created_by ?? []).map((person) => person.name));

  return {
    tmdbId: raw.id,
    mediaType: "tv",
    title: raw.name,
    overview: raw.overview ?? "",
    posterUrl: buildImageUrl(raw.poster_path, POSTER_SIZE),
    backdropUrl: buildImageUrl(raw.backdrop_path, BACKDROP_SIZE),
    releaseYear: extractYear(raw.first_air_date),
    seasons: (raw.seasons ?? [])
      .filter((season) => season.season_number > 0)
      .map(normalizeSeasonSummary),
    numberOfSeasons: raw.number_of_seasons ?? 0,
    numberOfEpisodes: raw.number_of_episodes ?? 0,
    defaultRuntime: defaultMinutes ? normalizeRuntime(defaultMinutes) : null,
    voteAverage: raw.vote_average ?? 0,
    genres: dedupeNames((raw.genres ?? []).map((genre) => genre.name)),
    spokenLanguages: normalizeSpokenLanguages(raw.spoken_languages),
    certification: extractTvCertification(raw),
    cast,
    directors: creators,
    producers,
  };
}

/** Fetches full details + credits/release certification for a movie, normalized into the shared ShowDetails shape. */
export async function getMovieDetails(tmdbId: number | string): Promise<ShowDetails> {
  const raw = await tmdbFetch<TmdbMovieDetailsRaw>(`/movie/${tmdbId}`, {
    append_to_response: "credits,release_dates",
  });

  const { cast, producers } = normalizeCredits(raw.credits);

  return {
    tmdbId: raw.id,
    mediaType: "movie",
    title: raw.title,
    overview: raw.overview ?? "",
    posterUrl: buildImageUrl(raw.poster_path, POSTER_SIZE),
    backdropUrl: buildImageUrl(raw.backdrop_path, BACKDROP_SIZE),
    releaseYear: extractYear(raw.release_date),
    seasons: [],
    numberOfSeasons: 0,
    numberOfEpisodes: 1,
    defaultRuntime: raw.runtime ? normalizeRuntime(raw.runtime) : null,
    voteAverage: raw.vote_average ?? 0,
    genres: dedupeNames((raw.genres ?? []).map((genre) => genre.name)),
    spokenLanguages: normalizeSpokenLanguages(raw.spoken_languages),
    certification: extractMovieCertification(raw),
    cast,
    directors: extractMovieDirectors(raw.credits),
    producers,
  };
}

export async function getMediaDetails(
  tmdbId: number | string,
  mediaType: MediaType,
): Promise<ShowDetails> {
  return mediaType === "movie" ? getMovieDetails(tmdbId) : getShowDetails(tmdbId);
}

function normalizeEpisode(raw: TmdbEpisodeRaw): EpisodeSummary {
  return {
    tmdbId: raw.id,
    seasonNumber: raw.season_number,
    episodeNumber: raw.episode_number,
    name: raw.name,
    overview: raw.overview ?? "",
    stillUrl: buildImageUrl(raw.still_path, STILL_SIZE),
    airDate: raw.air_date,
    runtime: raw.runtime ? normalizeRuntime(raw.runtime) : null,
  };
}

/** Fetches the episode list (with per-episode runtimes) for a single season. */
export async function getSeasonEpisodes(
  tmdbId: number | string,
  seasonNumber: number,
): Promise<EpisodeSummary[]> {
  const raw = await tmdbFetch<TmdbSeasonDetailsRaw>(
    `/tv/${tmdbId}/season/${seasonNumber}`,
  );
  return (raw.episodes ?? []).map(normalizeEpisode);
}

/** Fetches the exact runtime for a single episode, pre-normalized to the 30-min grid. */
export async function getEpisodeRuntime(
  tmdbId: number | string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<NormalizedRuntime | null> {
  const raw = await tmdbFetch<TmdbEpisodeRaw>(
    `/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`,
  );
  return raw.runtime ? normalizeRuntime(raw.runtime) : null;
}

interface TmdbDiscoverMovieRaw {
  id: number;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  vote_average: number | null;
}

interface TmdbDiscoverMovieResponseRaw {
  page: number;
  results: TmdbDiscoverMovieRaw[];
  total_pages: number;
  total_results: number;
}

/**
 * Fetches popular movies for a single TMDB genre ID via /discover/movie —
 * used by the schedule auto-filler to seed unassigned 30-minute blocks with
 * content that matches a channel's declared genre.
 */
export async function discoverMoviesByGenre(
  genreId: number,
  page = 1,
): Promise<MediaSearchResult[]> {
  const raw = await tmdbFetch<TmdbDiscoverMovieResponseRaw>("/discover/movie", {
    with_genres: genreId,
    sort_by: "popularity.desc",
    include_adult: "false",
    page,
  });

  return raw.results.map((item) => ({
    tmdbId: item.id,
    mediaType: "movie" as const,
    title: item.title,
    releaseYear: extractYear(item.release_date),
    posterPath: item.poster_path,
    posterUrl: buildImageUrl(item.poster_path, POSTER_SIZE),
    backdropUrl: buildImageUrl(item.backdrop_path, BACKDROP_SIZE),
    overview: item.overview ?? "",
    voteAverage: item.vote_average ?? 0,
  }));
}

interface TmdbFindResultRaw {
  id: number;
  title?: string;
  name?: string;
}

interface TmdbFindResponseRaw {
  movie_results: TmdbFindResultRaw[];
  tv_results: TmdbFindResultRaw[];
}

export interface FindByExternalIdResult {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
}

/**
 * Cross-references an external ID (e.g. an IMDb ID from TVmaze) to a TMDB
 * ID via TMDB's `/find` endpoint. Used to resolve real-world broadcast
 * listings (World Guide) to something our player pipeline understands.
 */
export async function findByImdbId(imdbId: string): Promise<FindByExternalIdResult | null> {
  const raw = await tmdbFetch<TmdbFindResponseRaw>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const tvMatch = raw.tv_results?.[0];
  if (tvMatch) {
    return { tmdbId: tvMatch.id, mediaType: "tv", title: tvMatch.name ?? "" };
  }

  const movieMatch = raw.movie_results?.[0];
  if (movieMatch) {
    return { tmdbId: movieMatch.id, mediaType: "movie", title: movieMatch.title ?? "" };
  }

  return null;
}

export { TmdbApiError };
