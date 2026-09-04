/**
 * Central registry of third-party embed providers used by the Retro TV
 * Simulation player. Providers are tried in array order (index 0 first);
 * the player engine advances to the next index whenever the current
 * source fails to load or is manually swapped by the user.
 *
 * Updated for 2025–2026 verified active domains with live-offset deep linking.
 */

export type MediaKind = "movie" | "tv";

export interface ProviderTemplateArgs {
  tmdbId: string | number;
  season?: number;
  episode?: number;
  startOffsetSeconds?: number;
}

export interface Provider {
  /** Stable identifier, used for logging / analytics / React keys. */
  id: string;
  /** Human readable label shown in the "Swap Channel" UI. */
  name: string;
  /**
   * Builds the embeddable iframe URL for the given media kind.
   * Movie templates ignore `season`/`episode`.
   */
  buildUrl: (kind: MediaKind, args: ProviderTemplateArgs) => string;
  /**
   * True for providers whose playable URL can't be derived synchronously
   * from a TMDB id alone (e.g. YouTube, KissKH, DramaCool, Cartoons, which need
   * a server-side search first). `buildUrl` is unused for these — the
   * player resolves them via dynamic API routes instead.
   */
  isDynamic?: boolean;
}

function getStartParam(offset?: number, paramName = "start"): string {
  if (!offset || offset <= 0) return "";
  const sec = Math.floor(offset);
  return `&${paramName}=${sec}&start=${sec}&startAt=${sec}&time=${sec}&t=${sec}`;
}

/**
 * Ordered fallback chain of verified working 2025–2026 embed providers.
 * Covers global cinema, Western TV, K-Dramas, C-Dramas, Anime, Bollywood, and OTT series.
 */
export const PROVIDERS: Provider[] = [
  {
    id: "vidlink-primary",
    name: "VidLink (Fast)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&startAt=${Math.floor(startOffsetSeconds)}`
          : "";
      const cleanParams = `primaryColor=6366f1&autoplay=true&nextbutton=false${offsetParam}`;
      if (kind === "movie") {
        return `https://vidlink.pro/movie/${tmdbId}?${cleanParams}`;
      }
      return `https://vidlink.pro/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?${cleanParams}`;
    },
  },
  {
    id: "smashystream",
    name: "SmashyStream (Multi-Server)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://player.smashy.stream/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.smashy.stream/tv/${tmdbId}?s=${season ?? 1}&e=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
  {
    id: "autoembed-clean",
    name: "AutoEmbed Clean Player",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "time");
      if (kind === "movie") {
        return `https://player.autoembed.cc/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.autoembed.cc/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidfast",
    name: "VidFast",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidfast.pro/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidfast.pro/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidcore",
    name: "VidCore",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidcore.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidcore.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "multiembed-asian",
    name: "MultiEmbed (Asian / Global)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&autoplay=1${offsetParam}`;
      }
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season ?? 1}&e=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
  {
    id: "embedsu-fast",
    name: "EmbedSu (Global / Anime)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://embed.su/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://embed.su/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-cc",
    name: "VidSrc CC (V2)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidsrc.cc/v2/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-icu",
    name: "VidSrc VIP (ICU)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidsrc.icu/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.icu/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidzen",
    name: "VidZen",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidzen.online/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidzen.online/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidlove",
    name: "Vidlove",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidlove.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidlove.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidzee",
    name: "Vidzee",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://player.vidzee.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.vidzee.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "moviesap",
    name: "MovieSap",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://moviesap.xyz/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://moviesap.xyz/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "cinesrc",
    name: "CineSrc",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://cinesrc.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://cinesrc.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "moviesapi-intl",
    name: "MoviesAPI (International)",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://moviesapi.club/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://moviesapi.club/tv/${tmdbId}-${season ?? 1}-${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "rivestream",
    name: "RiveStream",
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://rivestream.live/embed?type=movie&id=${tmdbId}&autoplay=1${offsetParam}`;
      }
      return `https://rivestream.live/embed?type=series&id=${tmdbId}&season=${season ?? 1}&episode=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
  {
    id: "kisskh-asian",
    name: "KissKH (K-Drama / Asian)",
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "dramacool-asian",
    name: "DramaCool (Asian Series)",
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "kartoons-me",
    name: "Kartoons.me (Cartoons & Kids)",
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "kimcartoon",
    name: "KimCartoon (Cartoons & Animation)",
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "gogoanime",
    name: "GogoAnime (Anime & Cartoons)",
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "youtube-official",
    name: "YouTube",
    isDynamic: true,
    buildUrl: () => "",
  },
];

export function getProvider(index: number): Provider | undefined {
  return PROVIDERS[index];
}

export const PROVIDER_COUNT = PROVIDERS.length;
