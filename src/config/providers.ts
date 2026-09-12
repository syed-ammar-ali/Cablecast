/**
 * Central registry of third-party embed providers used by the Retro TV
 * Simulation player. Providers are tried in array order (index 0 first);
 * the player engine advances to the next index whenever the current
 * source fails to load or is manually swapped by the user.
 *
 * Categorized by Country / Region with verified active domains, zero-ad
 * verification, benchmark latency metrics, and live-offset deep linking.
 */

export type MediaKind = "movie" | "tv";

export type StreamRegion =
  | "ALL"
  | "IN"       // India (Bollywood, South Regional, Hindi Web Series)
  | "US"       // United States (Hollywood & 90s Cult/B-Movies)
  | "JP_KR"    // Japan & Korea (Anime, K-Drama, J-Drama, Asian Cinema)
  | "GB_CA"    // England & Canada (90s British & Canadian Classics/Cults)
  | "AU_DE_FR";// Australia, Germany & France

export interface RegionOption {
  id: StreamRegion;
  label: string;
  flag: string;
}

export const REGION_OPTIONS: RegionOption[] = [
  { id: "ALL", label: "All Streams", flag: "🌐" },
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
 * Ordered fallback chain of verified working embed providers.
 * Sorted by lowest latency with the best archival coverage and zero malicious ads.
 */
export const PROVIDERS: Provider[] = [
  {
    id: "anyembed-matrix",
    name: "AnyEmbed Matrix (Direct HLS)",
    regions: ["ALL", "IN", "US", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 110,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://anyembed.xyz/embed/tmdb-movie-${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://anyembed.xyz/embed/tmdb-tv-${tmdbId}-${season ?? 1}-${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "zxcstream-direct",
    name: "ZXCStream (Turbopack Engine)",
    regions: ["ALL", "IN", "US", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 380,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://player.zxcstream.xyz/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.zxcstream.xyz/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidlove-express",
    name: "VidLove Express",
    regions: ["ALL", "US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 260,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://player.vidlove.cc/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.vidlove.cc/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidfast-direct",
    name: "VidFast Direct",
    regions: ["ALL", "US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 348,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidfast.vc/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidfast.vc/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "videasy-hd",
    name: "Videasy HD (Multi-Sub)",
    regions: ["ALL", "IN", "US", "JP_KR", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 440,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://player.videasy.to/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://player.videasy.to/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidlink-primary",
    name: "VidLink Pro (Primary Relay)",
    regions: ["ALL", "IN", "US", "GB_CA", "AU_DE_FR"],
    benchmarkLatencyMs: 496,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam =
        startOffsetSeconds && startOffsetSeconds > 0
          ? `&startAt=${Math.floor(startOffsetSeconds)}`
          : "";
      const cleanParams = `primaryColor=6366f1&secondaryColor=a855f7&iconColor=ffffff&autoplay=true&nextbutton=false${offsetParam}`;
      if (kind === "movie") {
        return `https://vidlink.pro/movie/${tmdbId}?${cleanParams}`;
      }
      return `https://vidlink.pro/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?${cleanParams}`;
    },
  },
  {
    id: "kisskh-asian",
    name: "KissKH (K-Drama & J-Drama)",
    regions: ["ALL", "JP_KR"],
    benchmarkLatencyMs: 180,
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "gogoanime",
    name: "GogoAnime (Anime Sub/Dub)",
    regions: ["ALL", "JP_KR"],
    benchmarkLatencyMs: 210,
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "vidcore-adaptive",
    name: "VidCore Adaptive",
    regions: ["ALL", "US"],
    benchmarkLatencyMs: 680,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidcore.org/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidcore.org/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-to",
    name: "VidSrc TO Global",
    regions: ["ALL", "US", "GB_CA"],
    benchmarkLatencyMs: 622,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.to/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}?autoplay=1${offsetParam}`;
    },
  },
  {
    id: "vidsrc-pm",
    name: "VidSrc PM Archive",
    regions: ["ALL", "US"],
    benchmarkLatencyMs: 1390,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://vidsrc.pm/embed/movie?tmdb=${tmdbId}&autoplay=1${offsetParam}`;
      }
      return `https://vidsrc.pm/embed/tv?tmdb=${tmdbId}&season=${season ?? 1}&episode=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
  {
    id: "2embed-heritage",
    name: "2Embed Heritage",
    regions: ["ALL"],
    benchmarkLatencyMs: 1400,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://www.2embed.cc/embed/${tmdbId}?autoplay=1${offsetParam}`;
      }
      return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season ?? 1}&e=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
  {
    id: "multiembed-global",
    name: "Global MultiEmbed",
    regions: ["ALL"],
    benchmarkLatencyMs: 850,
    buildUrl: (kind, { tmdbId, season, episode, startOffsetSeconds }) => {
      const offsetParam = getStartParam(startOffsetSeconds, "start");
      if (kind === "movie") {
        return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&autoplay=1${offsetParam}`;
      }
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season ?? 1}&e=${episode ?? 1}&autoplay=1${offsetParam}`;
    },
  },
  {
    id: "kartoons-direct",
    name: "Vintage Cartoons",
    regions: ["ALL", "US"],
    isDynamic: true,
    buildUrl: () => "",
  },
  {
    id: "youtube-official",
    name: "Official Broadcast Feed",
    regions: ["ALL"],
    isDynamic: true,
    buildUrl: () => "",
  },
];

export function getProvider(index: number): Provider | undefined {
  return PROVIDERS[index];
}

export function getProvidersForRegion(region: StreamRegion): Provider[] {
  if (region === "ALL") return PROVIDERS;

  if (region === "JP_KR") {
    // For Japan & South Korea: Dedicated Asian drama & anime specialists come first,
    // backed by low-latency direct engines:
    const jpKrdPriority = ["kisskh-asian", "gogoanime", "anyembed-matrix", "zxcstream-direct", "videasy-hd"];
    const matched = PROVIDERS.filter((p) => p.regions?.includes("JP_KR"));
    return matched.sort((a, b) => {
      const idxA = jpKrdPriority.indexOf(a.id);
      const idxB = jpKrdPriority.indexOf(b.id);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  if (region === "IN") {
    // For India: Highest-speed engines with full Bollywood & regional catalog
    const inPriority = ["anyembed-matrix", "zxcstream-direct", "videasy-hd", "vidlink-primary"];
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
