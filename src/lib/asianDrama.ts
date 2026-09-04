import "server-only";
import type { AsianDramaMatch } from "@/types/asianDrama";
import type { MediaType } from "@/types/media";

const KISSKH_BASE_URL = (process.env.KISSKH_BASE_URL || "https://kisskh.co").replace(/\/$/, "");
const DRAMACOOL_BASE_URL = (process.env.DRAMACOOL_BASE_URL || "https://asianembed.io").replace(/\/$/, "");

interface KissKhSearchItem {
  id: number;
  title: string;
  thumbnail?: string;
  episodesCount?: number;
}

interface KissKhEpisode {
  id: number;
  number: number;
  sub?: number;
}

interface KissKhDramaDetail {
  id: number;
  title: string;
  episodes?: KissKhEpisode[];
}

/**
 * Normalizes title for cleaner search matching.
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*·\s*S\d+E\d+$/i, "")
    .replace(/\(\d{4}\)$/, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds the closest/best matching drama candidate from KissKH search results.
 */
function findBestDramaMatch(candidates: KissKhSearchItem[], targetTitle: string): KissKhSearchItem | null {
  if (!candidates || candidates.length === 0) return null;

  const cleanTarget = targetTitle.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Exact match (ignoring spaces, case, and punctuation)
  const exact = candidates.find((item) => {
    const cleanItem = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleanItem === cleanTarget;
  });
  if (exact) return exact;

  // 2. Starts-with or full prefix match
  const startsWith = candidates.find((item) => {
    const cleanItem = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleanItem.startsWith(cleanTarget) || cleanTarget.startsWith(cleanItem);
  });
  if (startsWith) return startsWith;

  // 3. Substring match
  const contains = candidates.find((item) => {
    const cleanItem = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleanItem.includes(cleanTarget) || cleanTarget.includes(cleanItem);
  });
  if (contains) return contains;

  // 4. Default to first candidate
  return candidates[0] ?? null;
}

/**
 * Searches KissKH for drama and resolves the episode embed URL.
 */
export async function searchKissKh(
  rawTitle: string,
  mediaType: MediaType,
  season?: number,
  episode = 1,
): Promise<AsianDramaMatch | null> {
  const query = cleanTitle(rawTitle);
  if (!query) return null;

  try {
    const searchUrl = `${KISSKH_BASE_URL}/api/DramaList/Search?q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as KissKhSearchItem[];
    if (!Array.isArray(searchData) || searchData.length === 0) return null;

    // Pick best matching candidate (exact title match prioritized)
    const candidate = findBestDramaMatch(searchData, query);
    if (!candidate?.id) return null;

    // Fetch drama detail for episode IDs
    const detailUrl = `${KISSKH_BASE_URL}/api/DramaList/Drama/${candidate.id}`;
    const detailRes = await fetch(detailUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!detailRes.ok) return null;
    const detailData = (await detailRes.json()) as KissKhDramaDetail;
    const episodes = detailData.episodes ?? [];

    // Find requested episode number, fallback to first available
    const targetEpNumber = mediaType === "movie" ? 1 : (episode ?? 1);
    const targetEpisode =
      episodes.find((ep) => ep.number === targetEpNumber) ??
      episodes.find((ep) => Math.floor(ep.number) === targetEpNumber) ??
      episodes[0];

    if (!targetEpisode?.id) return null;

    const slug = candidate.title.trim().replace(/[^a-zA-Z0-9]+/g, "-");
    const embedUrl = `${KISSKH_BASE_URL}/Drama/${slug}/Episode-${targetEpisode.number}?id=${candidate.id}&ep=${targetEpisode.id}`;

    return {
      embedUrl,
      title: candidate.title,
      episodeNumber: targetEpisode.number,
      source: "kisskh",
    };
  } catch (error) {
    console.error("[lib/asianDrama] KissKH lookup error:", error);
    return null;
  }
}

/**
 * Resolves DramaCool / AsianEmbed player embed.
 */
export async function searchDramaCool(
  rawTitle: string,
  mediaType: MediaType,
  season?: number,
  episode = 1,
): Promise<AsianDramaMatch | null> {
  const query = cleanTitle(rawTitle);
  if (!query) return null;

  try {
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const targetEpNumber = mediaType === "movie" ? 1 : (episode ?? 1);

    // Standard AsianEmbed / DramaCool embed format
    const embedUrl = `${DRAMACOOL_BASE_URL}/streaming.php?id=${slug}-episode-${targetEpNumber}`;

    return {
      embedUrl,
      title: query,
      episodeNumber: targetEpNumber,
      source: "dramacool",
    };
  } catch (error) {
    console.error("[lib/asianDrama] DramaCool lookup error:", error);
    return null;
  }
}
