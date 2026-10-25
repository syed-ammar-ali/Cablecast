/**
 * Central registry of third-party embed providers used by the Retro TV
 * Simulation player. Providers are tried in array order (index 0 first);
 * the player engine advances to the next index whenever the current
 * source fails to load or is manually swapped by the user.
 *
 * Configured with the top 5 verified, high-performance embedded providers
 * for Global and US playback with zero intrusive popups and fast initial frame render.
 */

export type MediaKind = "movie" | "tv";

export type StreamRegion =
  | "ALL"
  | "US"
  | "IN"
  | "JP_KR"
  | "GB_CA"
  | "AU_DE_FR";

export interface RegionOption {
  id: StreamRegion;
  label: string;
  flag: string;
}

export const REGION_OPTIONS: RegionOption[] = [
  { id: "ALL", label: "Global", flag: "🌐" },
  { id: "US", label: "United States", flag: "🇺🇸" },
  { id: "IN", label: "India", flag: "🇮🇳" },
  { id: "JP_KR", label: "Japan & Korea", flag: "🇯🇵🇰🇷" },
  { id: "GB_CA", label: "UK & Canada", flag: "🇬🇧🇨🇦" },
  { id: "AU_DE_FR", label: "AU, DE, FR", flag: "🇦🇺🇩🇪🇫🇷" },
];

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
  /** Regional coverage tags for country filtering. */
  regions?: StreamRegion[];
  /** Average measured initial response latency in milliseconds. */
  benchmarkLatencyMs?: number;
  /**
   * Builds the embeddable iframe URL for the given media kind.
   * Movie templates ignore `season`/`episode`.
   */
  buildUrl: (kind: MediaKind, args: ProviderTemplateArgs) => string;
  /**
   * True for providers whose playable URL can't be derived synchronously
   * from a TMDB id alone.
   */
  isDynamic?: boolean;
}

function getStartParam(offset?: number, paramName = "start"): string {
  if (!offset || offset <= 0) return "";
  const sec = Math.floor(offset);
  return `&${paramName}=${sec}&start=${sec}&startAt=${sec}&time=${sec}&t=${sec}`;
}

/**
 * Top 5 verified working embed providers.
 * Filtered to verified lag-free embeds with full coverage for movies and TV series.
 */
export const PROVIDERS: Provider[] = [
  {
    id: "cinesrc-primary",
    name: "CineSrc (Smart Relay)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 380,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&t=${Math.floor(startOffsetSeconds)}&continueprompt=false`
          : "";
      if (isMovie) {
        return `https://cinesrc.st/embed/movie/${tmdbId}?color=%236366f1&autoplay=true${offsetParam}`;
      }
      return `https://cinesrc.st/embed/tv/${tmdbId}?s=${season ?? 1}&e=${episode ?? 1}&color=%236366f1&autoplay=true&autoskip=true${offsetParam}`;
    },
  },
  {
    id: "vixsrc-relay",
    name: "VixSrc (Player Events Relay)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 340,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&startAt=${Math.floor(startOffsetSeconds)}`
          : "";
      const cleanParams = `primaryColor=6366f1&secondaryColor=a855f7&autoplay=true${offsetParam}`;
      if (isMovie) {
        return `https://vixsrc.to/movie/${tmdbId}?${cleanParams}`;
      }
      return `https://vixsrc.to/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?${cleanParams}`;
    },
  },
  {
    id: "vidlink-primary",
    name: "VidLink Pro (Primary Relay)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 360,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&startAt=${Math.floor(startOffsetSeconds)}`
          : "";
      const cleanParams = `primaryColor=6366f1&secondaryColor=a855f7&iconColor=ffffff&autoplay=true&nextbutton=false${offsetParam}`;
      if (isMovie) {
        return `https://vidlink.pro/movie/${tmdbId}?${cleanParams}`;
      }
      return `https://vidlink.pro/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?${cleanParams}`;
    },
  },
  {
    id: "vidcore-edge",
    name: "VidCore Edge (4K HLS)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 270,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://vidcore.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidcore.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "anyembed-matrix",
    name: "AnyEmbed Matrix (Direct HLS)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 110,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://anyembed.xyz/embed/tmdb-movie-${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://anyembed.xyz/embed/tmdb-tv-${tmdbId}-${season ?? 1}-${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-pm",
    name: "VidSrc PM Global",
    regions: ["ALL", "US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 420,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://vidsrc.pm/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.pm/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidfast-vc",
    name: "VidFast (High-Speed Mirror)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 370,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&startAt=${Math.floor(startOffsetSeconds)}`
          : "";
      if (isMovie) {
        return `https://vidfast.vc/movie/${tmdbId}?autoPlay=true${offsetParam}`;
      }
      return `https://vidfast.vc/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoPlay=true${offsetParam}`;
    },
  },
  {
    id: "embedwave-ultra",
    name: "EmbedWave Ultra (Failover Relay)",
    regions: ["ALL", "US", "IN", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 440,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://embedwave.cc/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://embedwave.cc/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "nontongo-asian",
    name: "NontonGo (Asian Drama & Anime)",
    regions: ["ALL", "JP_KR", "IN"],
    benchmarkLatencyMs: 1010,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://www.nontongo.win/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://www.nontongo.win/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "2embed-skin",
    name: "2Embed Skin (Classic & Rare Titles)",
    regions: ["ALL", "US", "IN", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 620,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://www.2embed.skin/embed/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://www.2embed.skin/embedtv/${tmdbId}&s=${season ?? 1}&e=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
];

export const US_PROVIDERS: Provider[] = [
  {
    id: "vidlove-express",
    name: "VidLove Express",
    regions: ["US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 260,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://player.vidlove.cc/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.vidlove.cc/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "anyembed-matrix",
    name: "AnyEmbed Matrix (Direct HLS)",
    regions: ["ALL", "IN", "US", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 110,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://anyembed.xyz/embed/tmdb-movie-${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://anyembed.xyz/embed/tmdb-tv-${tmdbId}-${season ?? 1}-${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "zxcstream-direct",
    name: "ZXCStream (Turbopack Engine)",
    regions: ["IN", "US", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 380,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://player.zxcstream.xyz/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.zxcstream.xyz/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidfast-direct",
    name: "VidFast Direct",
    regions: ["US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 348,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://vidfast.vc/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidfast.vc/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "videasy-hd",
    name: "Videasy HD (Multi-Sub)",
    regions: ["IN", "US", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 440,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://player.videasy.to/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.videasy.to/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidlink-primary",
    name: "VidLink Pro (Primary Relay)",
    regions: ["ALL", "IN", "US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 360,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&startAt=${Math.floor(startOffsetSeconds)}`
          : "";
      const cleanParams = `primaryColor=6366f1&secondaryColor=a855f7&iconColor=ffffff&autoplay=true&nextbutton=false${offsetParam}`;
      if (isMovie) {
        return `https://vidlink.pro/movie/${tmdbId}?${cleanParams}`;
      }
      return `https://vidlink.pro/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?${cleanParams}`;
    },
  },
  {
    id: "vidcore-adaptive",
    name: "VidCore Adaptive",
    regions: ["US"],
    benchmarkLatencyMs: 680,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://vidcore.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidcore.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-to",
    name: "VidSrc TO Global",
    regions: ["US", "GB_CA"],
    benchmarkLatencyMs: 622,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.to/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-pm",
    name: "VidSrc PM Archive",
    regions: ["ALL", "US"],
    benchmarkLatencyMs: 420,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const isMovie = String(kind).toLowerCase() === "movie";
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (isMovie) {
        return `https://vidsrc.pm/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.pm/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "kartoons-direct",
    name: "Vintage Cartoons",
    regions: ["US"],
    benchmarkLatencyMs: 150,
    isDynamic: true,
    buildUrl: () => "",
  },
];

export const ALL_PROVIDERS: Provider[] = [
  ...PROVIDERS,
  ...US_PROVIDERS.filter((u) => !PROVIDERS.some((p) => p.id === u.id)),
];

export function getProviderById(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export function getProvider(index: number): Provider | undefined {
  return PROVIDERS[index];
}

export function getProvidersForRegion(region: StreamRegion): Provider[] {
  if (region === "ALL") {
    return PROVIDERS;
  }

  if (region === "US") {
    return US_PROVIDERS;
  }

  if (region === "JP_KR") {
    // For Japan & South Korea: Dedicated Asian drama & anime specialists come first,
    // backed by low-latency direct engines:
    const jpKrPriority = [
      "nontongo-asian",
      "anyembed-matrix",
      "vidcore-edge",
      "cinesrc-primary",
      "vixsrc-relay",
      "vidlink-primary",
      "vidfast-vc",
      "2embed-skin",
    ];
    const matched = PROVIDERS.filter((p) => p.regions?.includes("JP_KR"));
    return matched.sort((a, b) => {
      const idxA = jpKrPriority.indexOf(a.id);
      const idxB = jpKrPriority.indexOf(b.id);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  if (region === "IN") {
    // For India: Highest-speed direct engines with full Bollywood & regional catalog
    const inPriority = [
      "anyembed-matrix",
      "vidcore-edge",
      "vixsrc-relay",
      "vidlink-primary",
      "cinesrc-primary",
      "vidfast-vc",
      "embedwave-ultra",
      "nontongo-asian",
      "2embed-skin",
    ];
    const matched = PROVIDERS.filter((p) => p.regions?.includes("IN"));
    return matched.sort((a, b) => {
      const idxA = inPriority.indexOf(a.id);
      const idxB = inPriority.indexOf(b.id);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  return PROVIDERS.filter((p) => p.regions?.includes(region));
}

export const PROVIDER_COUNT = PROVIDERS.length;

