import "server-only";
import { searchKissKh, searchDramaCool } from "@/lib/asianDrama";
import { searchKartoonsMe, searchKimCartoon, searchGogoAnime } from "@/lib/cartoons";
import type { MediaType } from "@/types/media";

export type StreamCategory = "general" | "anime" | "kdrama" | "cartoon";

export interface StreamResolverParams {
  tmdbId: string | number;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  category?: StreamCategory;
}

export interface SubtitleTrack {
  url: string;
  lang: string;
  label?: string;
}

export interface ResolvedStream {
  url: string;
  type: "hls" | "embed";
  provider: string;
  subtitles: SubtitleTrack[];
  quality?: string;
}
function cleanSearchTitle(title?: string): string {
  if (!title) return "";
  return title
    .replace(/\s*·\s*S\d+E\d+$/i, "")
    .replace(/\(\d{4}\)$/, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tier 1: Niche Search (GogoAnime, KissKH, DramaCool, Internet Archive)
 */
async function tryNicheSearch(params: StreamResolverParams): Promise<ResolvedStream | null> {
  const { title, category, type, season = 1, episode = 1 } = params;
  if (!title) return null;
  const mediaType: MediaType = type;

  // 1. Anime Category -> GogoAnime / Consumet Anime
  if (category === "anime") {
    try {
      const animeMatch = await searchGogoAnime(title, mediaType, episode);
      if (animeMatch?.embedUrl) {
        return {
          url: animeMatch.embedUrl,
          type: animeMatch.embedUrl.includes(".m3u8") ? "hls" : "embed",
          provider: "GogoAnime",
          subtitles: [],
        };
      }
    } catch {
      // Continue to next niche search
    }
  }

  // 2. K-Drama / Asian Category -> KissKH / DramaCool
  if (category === "kdrama") {
    try {
      const kissMatch = await searchKissKh(title, mediaType, season, episode);
      if (kissMatch?.embedUrl) {
        return {
          url: kissMatch.embedUrl,
          type: kissMatch.embedUrl.includes(".m3u8") ? "hls" : "embed",
          provider: "KissKH Asian",
          subtitles: [],
        };
      }

      const dramaMatch = await searchDramaCool(title, mediaType, season, episode);
      if (dramaMatch?.embedUrl) {
        return {
          url: dramaMatch.embedUrl,
          type: dramaMatch.embedUrl.includes(".m3u8") ? "hls" : "embed",
          provider: "DramaCool Asian",
          subtitles: [],
        };
      }
    } catch {
      // Continue to next niche search
    }
  }

  // 3. Vintage Cartoons Category -> Internet Archive API & Cartoon index
  if (category === "cartoon") {
    try {
      // Internet Archive metadata API lookup for vintage/classic public domain animation
      const clean = cleanSearchTitle(title);
      const iaUrl = `https://archive.org/advancedsearch.php?q=title%3A%28${encodeURIComponent(clean)}%29+AND+mediatype%3A%28movies%29&fl%5B%5D=identifier,title&sort%5B%5D=downloads+desc&rows=3&output=json`;

      const iaRes = await fetch(iaUrl, { signal: AbortSignal.timeout(3000) });
      if (iaRes.ok) {
        const iaData = await iaRes.json() as {
          response?: { docs?: Array<{ identifier: string; title: string }> };
        };
        const doc = iaData.response?.docs?.[0];
        if (doc?.identifier) {
          const directStreamUrl = `https://archive.org/download/${doc.identifier}/${doc.identifier}.mp4`;
          return {
            url: directStreamUrl,
            type: "hls",
            provider: "Internet Archive",
            subtitles: [],
          };
        }
      }

      // Fallback to KimCartoon / Kartoons.me
      const kartoonMatch = await searchKartoonsMe(title, mediaType, season, episode);
      if (kartoonMatch?.embedUrl) {
        return {
          url: kartoonMatch.embedUrl,
          type: "embed",
          provider: "Kartoons.me",
          subtitles: [],
        };
      }

      const kimMatch = await searchKimCartoon(title, mediaType, season, episode);
      if (kimMatch?.embedUrl) {
        return {
          url: kimMatch.embedUrl,
          type: "embed",
          provider: "KimCartoon",
          subtitles: [],
        };
      }
    } catch {
      // Continue to meta-router
    }
  }

  return null;
}

/**
 * Tier 3: Meta-Router Fallback Embeds (SmashyStream, AutoEmbed, SuperEmbed/VidLink)
 */
function getMetaRouterEmbed(params: StreamResolverParams): ResolvedStream {
  const { tmdbId, type, season = 1, episode = 1 } = params;

  // Primary Meta-Router: SmashyStream (Multi-Server)
  const smashyUrl =
    type === "movie"
      ? `https://player.smashy.stream/movie/${tmdbId}?autoplay=1`
      : `https://player.smashy.stream/tv/${tmdbId}?s=${season}&e=${episode}&autoplay=1`;

  // Secondary Meta-Router: AutoEmbed
  const autoEmbedUrl =
    type === "movie"
      ? `https://player.autoembed.cc/embed/movie/${tmdbId}?autoplay=1`
      : `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}?autoplay=1`;

  // Tertiary Meta-Router: VidLink / SuperEmbed
  const vidLinkUrl =
    type === "movie"
      ? `https://vidlink.pro/movie/${tmdbId}?primaryColor=6366f1&autoplay=true`
      : `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?primaryColor=6366f1&autoplay=true`;

  return {
    url: smashyUrl || autoEmbedUrl || vidLinkUrl,
    type: "embed",
    provider: "SmashyStream Meta-Router",
    subtitles: [],
  };
}

/**
 * Unified Stream Resolver
 *
 * Tier 1: Niche Search via GogoAnime, KissKH, DramaCool, Internet Archive (for anime/kdrama/cartoons)
 * Tier 2: High-Speed Meta-Router (SmashyStream, AutoEmbed, VidLink) with 0ms delay
 */
export async function resolveStreamPipeline(
  params: StreamResolverParams,
): Promise<ResolvedStream> {
  // Tier 1: Niche Category Search (Anime, KDrama, Vintage Cartoons)
  if (params.category && params.category !== "general") {
    const niche = await tryNicheSearch(params);
    if (niche) return niche;
  }

  // Tier 2: Instant Meta-Router Embeds (SmashyStream, AutoEmbed, VidLink)
  return getMetaRouterEmbed(params);
}

export interface ResolveStreamArgs {
  tmdbId: string | number;
  mediaType: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  category?: StreamCategory;
}

export type ResolveStreamResult = {
  success: true;
  streamUrl: string;
  type: "hls" | "embed";
  provider: string;
  subtitles: SubtitleTrack[];
};

export type ResolveStreamFailure = {
  success: false;
  error: string;
};

export async function resolveStream(
  args: ResolveStreamArgs,
): Promise<ResolveStreamResult | ResolveStreamFailure> {
  try {
    const stream = await resolveStreamPipeline({
      tmdbId: args.tmdbId,
      type: args.mediaType,
      season: args.season,
      episode: args.episode,
      title: args.title,
      category: args.category,
    });
    return {
      success: true,
      streamUrl: stream.url,
      type: stream.type,
      provider: stream.provider,
      subtitles: stream.subtitles,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to resolve stream",
    };
  }
}
