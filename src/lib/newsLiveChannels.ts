import "server-only";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Curated map of TVmaze network display names to the broadcaster's own
 * official YouTube handle — only for networks confirmed to run a genuine,
 * free, 24/7 live news stream on their own channel (not a third-party
 * re-upload). Deliberately small and conservative; anything not listed
 * here falls through to the Internet Archive TV News Archive instead of
 * guessing a source. See `src/lib/newsArchive.ts`.
 */
const OFFICIAL_LIVE_NEWS_HANDLES: Record<string, string> = {
  "ABC News Live": "ABCNews",
  "ABC News": "ABCNews",
  "NBC News": "NBCNews",
  "CBS News": "CBSNews",
  "Sky News": "SkyNews",
  "Al Jazeera English": "aljazeeraenglish",
  "Al Jazeera": "aljazeeraenglish",
  "DW News": "dwnews",
  "DW (English)": "dwnews",
  "France 24": "france24_en",
  "France 24 English": "france24_en",
};

/** In-memory cache: a channel's numeric YouTube ID never changes once resolved. */
const channelIdCache = new Map<string, string | null>();

async function resolveChannelId(handle: string, apiKey: string): Promise<string | null> {
  if (channelIdCache.has(handle)) return channelIdCache.get(handle) ?? null;

  const params = new URLSearchParams({
    part: "id",
    forHandle: handle,
    key: apiKey,
  });

  let channelId: string | null = null;
  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/channels?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { items?: { id: string }[] };
      channelId = data.items?.[0]?.id ?? null;
    }
  } catch (error) {
    console.error("[lib/newsLiveChannels] channel lookup failed:", error);
  }

  channelIdCache.set(handle, channelId);
  return channelId;
}

export interface LiveNewsMatch {
  embedUrl: string;
  label: string;
}

/**
 * Resolves a TVmaze network name to its broadcaster's own official, free,
 * 24/7 YouTube live stream — if we have a curated, trusted entry for it.
 * Uses YouTube's `embed/live_stream?channel=` format, which always plays
 * whatever that channel currently has live (no need to track/rotate a
 * specific video ID). Returns `null` if there's no curated entry, or if
 * `YOUTUBE_API_KEY` isn't configured.
 */
export async function resolveOfficialLiveStream(networkName: string): Promise<LiveNewsMatch | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const handle = OFFICIAL_LIVE_NEWS_HANDLES[networkName];
  if (!handle) return null;

  const channelId = await resolveChannelId(handle, apiKey);
  if (!channelId) return null;

  return {
    embedUrl: `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`,
    label: "Official Live Stream",
  };
}
