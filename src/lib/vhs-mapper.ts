import { buildImageUrl } from "@/lib/tmdbImage";
import type { VhsMetadata, VhsEpisode, VhsCredits } from "@/types/vhs";

export * from "@/types/vhs";

const TMDB_BASE_URL = "https://api.tmdb.org/3";
const DEFAULT_POSTER_SIZE = "w780";
const FALLBACK_POSTER_SIZE = "w500";

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === "your_tmdb_api_key_here") {
    throw new Error("TMDB_API_KEY is not configured in environment variables.");
  }
  return key;
}

interface RawTmdbMovie {
  id: number;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  runtime?: number | null;
  release_date?: string;
  vote_average?: number;
  credits?: {
    cast?: Array<{ name: string; order?: number }>;
    crew?: Array<{ name: string; job?: string; department?: string }>;
  };
}

interface RawTmdbTvShow {
  id: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  number_of_seasons?: number;
  first_air_date?: string;
  vote_average?: number;
  seasons?: Array<{
    id: number;
    season_number: number;
    name?: string;
    poster_path?: string | null;
    episode_count?: number;
  }>;
  episode_run_time?: number[];
  created_by?: Array<{ name: string }>;
  credits?: {
    cast?: Array<{ name: string }>;
    crew?: Array<{ name: string; job?: string }>;
  };
  aggregate_credits?: {
    cast?: Array<{ name: string }>;
  };
}

interface RawTmdbSeason {
  id: number;
  season_number: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  air_date?: string;
  episodes?: Array<{
    episode_number: number;
    name?: string;
    runtime?: number | null;
    guest_stars?: Array<{ name: string }>;
  }>;
}

const MAX_NETWORK_RETRIES = 2;
const RETRY_BACKOFF_MS = 150;

async function fetchFromTmdb<T>(path: string, searchParams: Record<string, string | number | undefined> = {}): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Cablecast/1.0 (Home Theater Console)",
        },
        next: { revalidate: 60 * 60 }, // Cache for 1 hour
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody?.status_message || `TMDB request failed with HTTP ${response.status}`;
        throw new Error(message);
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_NETWORK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to reach TMDB after ${MAX_NETWORK_RETRIES} attempts.`);
}

/**
 * Transforms TMDB movie/TV metadata into structured VHS Sleeve back & front payload.
 *
 * @param mediaId - The TMDB media ID (e.g. 550 for Fight Club, 1399 for Game of Thrones)
 * @param mediaType - 'MOVIE' | 'TV' | 'movie' | 'tv'
 * @param seasonNumber - Season number for TV shows (defaults to 1)
 */
export async function getVhsMetadata(
  mediaId: string | number,
  mediaType: "MOVIE" | "TV" | "movie" | "tv",
  seasonNumber: number = 1
): Promise<VhsMetadata> {
  const numericId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
  if (isNaN(numericId) || numericId <= 0) {
    throw new Error(`Invalid mediaId: ${mediaId}`);
  }

  const isTv = mediaType.toUpperCase() === "TV";
  const normalizedType: "MOVIE" | "TV" = isTv ? "TV" : "MOVIE";
  const validSeason = Number.isInteger(seasonNumber) && seasonNumber > 0 ? seasonNumber : 1;

  if (!isTv) {
    // ── 1. MOVIE METADATA ────────────────────────────────────────────────────────
    const movie = await fetchFromTmdb<RawTmdbMovie>(`/movie/${numericId}`, {
      append_to_response: "credits",
    });

    const frontPosterPath =
      buildImageUrl(movie.poster_path, DEFAULT_POSTER_SIZE) ||
      buildImageUrl(movie.poster_path, FALLBACK_POSTER_SIZE) ||
      "";

    const synopsis = movie.overview?.trim() || "Feature presentation from the Cablecast retro collection.";

    // Directors from crew
    const directCrew = movie.credits?.crew || [];
    const directors = Array.from(
      new Set(
        directCrew
          .filter((c) => c.job === "Director" || c.department === "Directing")
          .map((c) => c.name.trim())
          .filter(Boolean)
      )
    );

    // Fallback creators if no director listed
    const creators = directors.length > 0 ? directors.slice(0, 3) : ["Cablecast Home Video"];

    // Main Cast (Top 5)
    const castList = movie.credits?.cast || [];
    const mainCast = Array.from(new Set(castList.map((c) => c.name.trim()).filter(Boolean))).slice(0, 5);

    // Guest stars / supporting appearances (cast members beyond top 5)
    const guestStars = Array.from(new Set(castList.slice(5, 11).map((c) => c.name.trim()).filter(Boolean)));

    const calculatedRuntime = movie.runtime && movie.runtime > 0 ? movie.runtime : 90;

    const episodes: VhsEpisode[] = [
      {
        episodeNumber: 1,
        name: movie.title || "Feature Presentation",
        runtime: calculatedRuntime,
      },
    ];

    const credits: VhsCredits = {
      creators,
      mainCast: mainCast.length > 0 ? mainCast : ["Ensemble Cast"],
    };

    const releaseYear = movie.release_date ? movie.release_date.slice(0, 4) : undefined;
    const voteAverage = typeof movie.vote_average === "number" ? movie.vote_average : undefined;

    return {
      mediaId: numericId,
      mediaType: "MOVIE",
      frontPosterPath,
      synopsis,
      guestStars,
      episodes,
      credits,
      calculatedRuntime,
      releaseYear,
      voteAverage,
    };
  } else {
    // ── 2. TV SHOW & SEASON METADATA ─────────────────────────────────────────────
    const [show, season] = await Promise.all([
      fetchFromTmdb<RawTmdbTvShow>(`/tv/${numericId}`, {
        append_to_response: "credits,aggregate_credits",
      }),
      fetchFromTmdb<RawTmdbSeason>(`/tv/${numericId}/season/${validSeason}`).catch(() => null),
    ]);

    // Poster: season poster preferred, fallback to show poster
    const posterPathRaw = season?.poster_path || show.poster_path;
    const frontPosterPath =
      buildImageUrl(posterPathRaw, DEFAULT_POSTER_SIZE) ||
      buildImageUrl(posterPathRaw, FALLBACK_POSTER_SIZE) ||
      "";

    // Synopsis: season overview preferred, fallback to show overview
    const synopsis =
      season?.overview?.trim() ||
      show.overview?.trim() ||
      `Season ${validSeason} of ${show.name || "the television series"}.`;

    // Default episode runtime fallback
    const defaultEpisodeRuntime = show.episode_run_time?.[0] && show.episode_run_time[0] > 0
      ? show.episode_run_time[0]
      : 24;

    // Episodes mapping
    const rawEpisodes = season?.episodes || [];
    const episodes: VhsEpisode[] = rawEpisodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      name: ep.name?.trim() || `Episode ${ep.episode_number}`,
      runtime: ep.runtime && ep.runtime > 0 ? ep.runtime : defaultEpisodeRuntime,
    }));

    // If season had no episodes returned, provide a single season placeholder
    if (episodes.length === 0) {
      episodes.push({
        episodeNumber: 1,
        name: `${show.name || "Series"} - Season ${validSeason}`,
        runtime: defaultEpisodeRuntime,
      });
    }

    // Calculated runtime: total minutes of all episodes in this season
    const calculatedRuntime = episodes.reduce((total, ep) => total + ep.runtime, 0);

    // Guest stars: extract top unique guest star names across all episodes in this season (up to 6)
    const guestStarsSet = new Set<string>();
    for (const ep of rawEpisodes) {
      if (ep.guest_stars && Array.isArray(ep.guest_stars)) {
        for (const guest of ep.guest_stars) {
          if (guest?.name && guest.name.trim()) {
            guestStarsSet.add(guest.name.trim());
            if (guestStarsSet.size >= 6) break;
          }
        }
      }
      if (guestStarsSet.size >= 6) break;
    }
    const guestStars = Array.from(guestStarsSet);

    // Creators from show.created_by
    const creators = show.created_by && show.created_by.length > 0
      ? show.created_by.map((c) => c.name.trim()).filter(Boolean)
      : ["Series Producers"];

    // Main Cast: aggregate_credits preferred, fallback to credits.cast
    const rawCast = show.aggregate_credits?.cast || show.credits?.cast || [];
    const mainCast = Array.from(new Set(rawCast.map((c) => c.name.trim()).filter(Boolean))).slice(0, 6);

    const credits: VhsCredits = {
      creators,
      mainCast: mainCast.length > 0 ? mainCast : ["Ensemble Cast"],
    };

    const regularSeasons = (show.seasons || []).filter((s) => s.season_number > 0);
    const totalSeasonsCount = show.number_of_seasons || (regularSeasons.length > 0 ? regularSeasons.length : 1);
    const mappedSeasons = regularSeasons.map((s) => ({
      seasonNumber: s.season_number,
      name: s.name || `Season ${s.season_number}`,
      posterPath: buildImageUrl(s.poster_path, DEFAULT_POSTER_SIZE) || "",
      episodeCount: s.episode_count || 0,
    }));

    const releaseYear = season?.air_date
      ? season.air_date.slice(0, 4)
      : (show.first_air_date ? show.first_air_date.slice(0, 4) : undefined);
    const voteAverage = typeof show.vote_average === "number" ? show.vote_average : undefined;

    return {
      mediaId: numericId,
      mediaType: normalizedType,
      seasonNumber: validSeason,
      totalSeasons: totalSeasonsCount,
      seasons: mappedSeasons,
      frontPosterPath,
      synopsis,
      guestStars,
      episodes,
      credits,
      calculatedRuntime,
      releaseYear,
      voteAverage,
    };
  }
}
