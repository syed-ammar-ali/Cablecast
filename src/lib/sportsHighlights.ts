import "server-only";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** Only accept results that actually look like highlight/recap footage, not a full live broadcast. */
const REQUIRED_KEYWORDS = ["highlight", "recap", "condensed game", "top plays", "in 10 minutes"];

/** Disqualify clips that are clearly unrelated commentary rather than footage of the game itself. */
const DISQUALIFYING_KEYWORDS = ["reaction", "review", "interview", "podcast", "explained"];

/**
 * Official league/team/broadcaster channel name fragments — the only
 * sources we're willing to trust for sports footage. Deliberately narrow:
 * we're never trying to surface a full live game (no free/legal source
 * exists for that), only official post-game highlight uploads.
 */
const TRUSTED_CHANNEL_FRAGMENTS = [
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "espn",
  "wwe",
  "fifa",
  "uefa",
  "premier league",
  "olympics",
  "ncaa",
  "formula 1",
  "iihf",
  "world rugby",
];

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

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function trustScoreForChannel(channelTitle: string): number {
  const lower = channelTitle.toLowerCase();
  return TRUSTED_CHANNEL_FRAGMENTS.some((fragment) => lower.includes(fragment)) ? 100 : 0;
}

export interface SportsHighlightMatch {
  videoId: string;
  title: string;
  channelTitle: string;
}

/**
 * Searches YouTube for an official highlights/recap upload of a sports
 * broadcast — the mirror image of `searchOfficialUpload` in
 * `src/lib/youtube.ts`, which explicitly *disqualifies* highlight/recap
 * clips because it's hunting for full episodes. There is no free, legal
 * source for an actual live game, so this only ever surfaces highlights —
 * callers must label the result as such. Returns `null` if nothing trusted
 * clears the bar, or if `YOUTUBE_API_KEY` isn't configured.
 */
export async function searchHighlightUpload(
  showName: string,
  networkName: string,
): Promise<SportsHighlightMatch | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !showName.trim()) return null;

  const query = `${showName} ${networkName} highlights`;
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "10",
    videoEmbeddable: "true",
    safeSearch: "strict",
    order: "relevance",
    q: query,
    key: apiKey,
  });

  let searchRes: Response;
  try {
    searchRes = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams.toString()}`);
  } catch (error) {
    console.error("[lib/sportsHighlights] search request failed:", error);
    return null;
  }

  if (!searchRes.ok) {
    console.error("[lib/sportsHighlights] search failed:", searchRes.status, await searchRes.text());
    return null;
  }

  const searchData = (await searchRes.json()) as { items?: RawSearchItem[] };
  const items = searchData.items ?? [];

  const candidates = items.filter((item) => {
    if (!item.id?.videoId || !item.snippet) return false;
    const text = `${item.snippet.title} ${item.snippet.description}`;
    if (containsAny(text, DISQUALIFYING_KEYWORDS)) return false;
    return containsAny(text, REQUIRED_KEYWORDS);
  });

  if (candidates.length === 0) return null;

  let best: { item: RawSearchItem; score: number } | null = null;
  for (const item of candidates) {
    const score = trustScoreForChannel(item.snippet.channelTitle);
    if (!best || score > best.score) best = { item, score };
  }

  if (!best || best.score < MIN_TRUST_SCORE) return null;

  return {
    videoId: best.item.id.videoId,
    title: best.item.snippet.title,
    channelTitle: best.item.snippet.channelTitle,
  };
}
