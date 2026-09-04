/**
 * TypeScript definitions for TVmaze's public, keyless `/schedule` endpoint
 * (https://api.tvmaze.com/schedule) — real-world broadcast listings by
 * country + date, used by the "World Guide" (`TvGrid`) view.
 */

export interface TvMazeNetworkRaw {
  id: number;
  name: string;
  country: { name: string; code: string; timezone: string } | null;
}

export interface TvMazeExternalsRaw {
  tvrage: number | null;
  thetvdb: number | null;
  imdb: string | null;
}

export interface TvMazeShowRaw {
  id: number;
  name: string;
  type: string;
  image: { medium: string; original: string } | null;
  summary: string | null;
  network: TvMazeNetworkRaw | null;
  webChannel: TvMazeNetworkRaw | null;
  externals?: TvMazeExternalsRaw;
}

export interface TvMazeEpisodeRaw {
  id: number;
  name: string;
  season: number;
  number: number | null;
  airdate: string;
  airtime: string;
  airstamp: string;
  runtime: number | null;
  image: { medium: string; original: string } | null;
  summary: string | null;
  show: TvMazeShowRaw;
}

/** Normalized, UI-friendly broadcast slot for the World Guide grid. */
export interface BroadcastScheduleItem {
  id: number;
  airtime: string;
  airdate: string;
  /** UTC ISO-8601 timestamp from TVmaze (e.g. "2026-08-30T17:30:00+00:00"). Use this for all live/offset math — airdate+airtime are in the network's local timezone and are ambiguous for non-US users. */
  airstamp: string;
  showName: string;
  episodeName: string | null;
  season: number | null;
  episodeNumber: number | null;
  network: string;
  countryCode: string | null;
  imageUrl: string | null;
  summary: string | null;
  /** IMDb ID (e.g. "tt0903747"), used to cross-reference a TMDB ID for playback. */
  imdbId: string | null;
  /**
   * TVmaze's own show classification (e.g. "News", "Sports", "Scripted",
   * "Animation", "Talk Show", "Documentary", "Reality", "Variety",
   * "Award Show", "Game Show"). Used to route News/Sports broadcasts to
   * dedicated, category-appropriate sources instead of the on-demand
   * TMDB/embed-provider chain built for scripted movies and TV episodes.
   * See `src/lib/broadcastCategory.ts`.
   */
  showType: string;
  /** Runtime in minutes, if TVmaze reports one — sizes the guide card's width and the live-offset window. */
  runtime: number | null;
}
