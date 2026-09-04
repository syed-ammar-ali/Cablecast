import "server-only";
import type { YouTubeMatch } from "@/types/youtube";
import type { MediaType } from "@/types/media";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Title/description substrings that disqualify a candidate outright — these
 * almost always mean the upload is a clip, trailer, or reaction video, not
 * the actual full episode/movie.
 */
const DISQUALIFYING_KEYWORDS = [
  "trailer",
  "teaser",
  "reaction",
  "review",
  "recap",
  "promo",
  "sneak peek",
  "preview",
  "behind the scenes",
  "bloopers",
  "interview",
  "explained",
  "compilation",
  "highlights",
  "shorts",
];

/**
 * Channel name fragments belonging to known official broadcasters /
 * distributors who legitimately post full, free, ad-supported episodes.
 * Matching this list grants a strong trust bonus — it is NOT a hard
 * requirement, since we can't maintain an exhaustive allowlist. Large,
 * well-established channels (see subscriber-count check below) can also
 * clear the trust bar on their own.
 */
const TRUSTED_CHANNEL_FRAGMENTS = [
  "kbs world",
  "kbs drama",
  "sbs drama",
  "sbs walkerhill",
  "mbcdrama",
  "mbc entertainment",
  "tvn drama",
  "jtbc drama",
  "arirang",
  "kocowa",
  "viki",
  "viu",
  "iqiyi",
  "crunchyroll",
  "netflix",
  "youtube movies",
  "pbs",
  "bbc",
];

/** Minimum combined trust score required before we're willing to embed a match. */
const MIN_TRUST_SCORE = 100;

interface RawSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
  };
}

function buildQuery(title: string, mediaType: MediaType, season?: number, episode?: number): string {
  if (mediaType === "movie") return `${title} full movie`;
  if (season != null && episode != null) {
    return `${title} season ${season} episode ${episode} full episode`;
  }
  return `${title} full episode`;
}

function isDisqualified(text: string): boolean {
  const lower = text.toLowerCase();
  return DISQUALIFYING_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function trustScoreForChannel(channelTitle: string): number {
  const lower = channelTitle.toLowerCase();
  return TRUSTED_CHANNEL_FRAGMENTS.some((fragment) => lower.includes(fragment)) ? 100 : 0;
}

async function fetchSubscriberCounts(
  channelIds: string[],
  apiKey: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (channelIds.length === 0) return result;

  const params = new URLSearchParams({
    part: "statistics",
    id: channelIds.join(","),
    key: apiKey,
  });

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/channels?${params.toString()}`);
    if (!res.ok) return result;
    const data = (await res.json()) as {
      items?: { id: string; statistics?: { subscriberCount?: string } }[];
    };
    for (const channel of data.items ?? []) {
      const count = Number(channel.statistics?.subscriberCount ?? "0");
      result.set(channel.id, Number.isFinite(count) ? count : 0);
    }
  } catch (error) {
    console.error("[lib/youtube] channel statistics lookup failed:", error);
  }

  return result;
}

/**
 * Searches YouTube for a legitimate, freely-embeddable upload of the given
 * title/episode. Deliberately conservative: returns `null` (no match) unless
 * a candidate clears a minimum trust bar, rather than guessing and embedding
 * the first search hit. This is intentionally NOT a general-purpose stream
 * finder — only a way to surface genuinely free, official uploads that
 * already exist on YouTube's own Content-ID-enforced platform. Requires
 * `YOUTUBE_API_KEY`; returns `null` immediately if it isn't configured.
 */
export async function searchOfficialUpload(
  title: string,
  mediaType: MediaType,
  season?: number,
  episode?: number,
): Promise<YouTubeMatch | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !title.trim()) return null;

  const query = buildQuery(title, mediaType, season, episode);
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "10",
    videoEmbeddable: "true",
    videoDuration: "long",
    safeSearch: "strict",
    q: query,
    key: apiKey,
  });

  let searchRes: Response;
  try {
    searchRes = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams.toString()}`);
  } catch (error) {
    console.error("[lib/youtube] search request failed:", error);
    return null;
  }

  if (!searchRes.ok) {
    console.error("[lib/youtube] search failed:", searchRes.status, await searchRes.text());
    return null;
  }

  const searchData = (await searchRes.json()) as { items?: RawSearchItem[] };
  const items = searchData.items ?? [];

  const candidates = items.filter(
    (item) =>
      item.id?.videoId &&
      item.snippet &&
      !isDisqualified(item.snippet.title) &&
      !isDisqualified(item.snippet.description),
  );

  if (candidates.length === 0) return null;

  const channelIds = Array.from(new Set(candidates.map((item) => item.snippet.channelId)));
  const subscriberCounts = await fetchSubscriberCounts(channelIds, apiKey);

  let best: { item: RawSearchItem; score: number } | null = null;
  for (const item of candidates) {
    let score = trustScoreForChannel(item.snippet.channelTitle);
    const subscribers = subscriberCounts.get(item.snippet.channelId) ?? 0;
    if (subscribers >= 100_000) score += 100;
    else if (subscribers >= 10_000) score += 30;
    if (item.snippet.title.toLowerCase().includes("official")) score += 10;

    if (!best || score > best.score) best = { item, score };
  }

  if (!best || best.score < MIN_TRUST_SCORE) return null;

  return {
    videoId: best.item.id.videoId,
    title: best.item.snippet.title,
    channelTitle: best.item.snippet.channelTitle,
  };
}
