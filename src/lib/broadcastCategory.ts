/**
 * Classifies a TVmaze broadcast item's `show.type` into a playback
 * category, so the World Guide can route News/Sports broadcasts to
 * dedicated, category-appropriate sources instead of the on-demand
 * TMDB/embed-provider chain — which only makes sense for scripted movies
 * and TV episodes that actually have a TMDB entry to look up.
 */
export type BroadcastCategory = "news" | "sports" | "standard";

const NEWS_TYPES = new Set(["News"]);
const SPORTS_TYPES = new Set(["Sports"]);

export function classifyBroadcast(showType: string): BroadcastCategory {
  if (NEWS_TYPES.has(showType)) return "news";
  if (SPORTS_TYPES.has(showType)) return "sports";
  return "standard";
}
