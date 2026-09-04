import "server-only";
import type { MediaType } from "@/types/media";

export interface CartoonMatch {
  embedUrl: string;
  title: string;
  episodeNumber?: number;
  source: "kimcartoon" | "gogoanime" | "kartoons" | "toonova";
}

/**
 * Cleans the show title for cartoon searches.
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*·\s*S\d+E\d+$/i, "")
    .replace(/\(\d{4}\)$/, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KARTOONS_BASE_URL = (process.env.KARTOONS_BASE_URL || "https://kartoons.me").replace(/\/$/, "");
const KIMCARTOON_BASE_URL = (process.env.KIMCARTOON_BASE_URL || "https://kimcartoon.li").replace(/\/$/, "");
const GOGOANIME_BASE_URL = (process.env.GOGOANIME_BASE_URL || "https://anitaku.to").replace(/\/$/, "");

/**
 * Searches Kartoons.me index for animated series and cartoon episodes.
 */
export async function searchKartoonsMe(
  rawTitle: string,
  mediaType: MediaType,
  season?: number,
  episode = 1,
): Promise<CartoonMatch | null> {
  const query = cleanTitle(rawTitle);
  if (!query) return null;

  try {
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const targetSeason = season ?? 1;
    const targetEpisode = episode ?? 1;

    // Kartoons.me player URL
    const embedUrl = `${KARTOONS_BASE_URL}/watch/${slug}-season-${targetSeason}-episode-${targetEpisode}`;

    return {
      embedUrl,
      title: query,
      episodeNumber: targetEpisode,
      source: "kartoons",
    };
  } catch (error) {
    console.error("[lib/cartoons] Kartoons.me lookup error:", error);
    return null;
  }
}

/**
 * Searches KimCartoon index for Western animated series and classic cartoons.
 */
export async function searchKimCartoon(
  rawTitle: string,
  mediaType: MediaType,
  season?: number,
  episode = 1,
): Promise<CartoonMatch | null> {
  const query = cleanTitle(rawTitle);
  if (!query) return null;

  try {
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const targetSeason = season ?? 1;
    const targetEpisode = episode ?? 1;

    // Standard KimCartoon / Toon streaming embed pattern
    const embedUrl = `${KIMCARTOON_BASE_URL}/Cartoon/${slug}-Season-${targetSeason}/Episode-${String(
      targetEpisode,
    ).padStart(3, "0")}`;

    return {
      embedUrl,
      title: query,
      episodeNumber: targetEpisode,
      source: "kimcartoon",
    };
  } catch (error) {
    console.error("[lib/cartoons] KimCartoon lookup error:", error);
    return null;
  }
}

/**
 * Searches GogoAnime / Anitaku index for anime and animated features.
 */
export async function searchGogoAnime(
  rawTitle: string,
  mediaType: MediaType,
  season?: number,
  episode = 1,
): Promise<CartoonMatch | null> {
  const query = cleanTitle(rawTitle);
  if (!query) return null;

  try {
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const targetEpisode = episode ?? 1;

    // Gogoanime streaming embed structure
    const embedUrl = `${GOGOANIME_BASE_URL}/embed/${slug}-episode-${targetEpisode}`;

    return {
      embedUrl,
      title: query,
      episodeNumber: targetEpisode,
      source: "gogoanime",
    };
  } catch (error) {
    console.error("[lib/cartoons] GogoAnime lookup error:", error);
    return null;
  }
}
