import { PROVIDER_COUNT, PROVIDERS, type MediaKind } from "@/config/providers";

export interface BuildPlayerUrlArgs {
  providerIndex: number;
  tmdbId: string | number;
  mediaType: MediaKind;
  season?: number;
  episode?: number;
  startOffsetSeconds?: number;
}

export interface PlayerSource {
  providerIndex: number;
  providerId: string;
  providerName: string;
  url: string;
  isLastProvider: boolean;
}

/**
 * Resolves the iframe `src` for the current provider index, appending the
 * `start` offset query param so playback can resume mid-episode.
 * Wraps the index defensively so an out-of-range value never throws.
 */
export function buildPlayerSource({
  providerIndex,
  tmdbId,
  mediaType,
  season,
  episode,
  startOffsetSeconds,
}: BuildPlayerUrlArgs): PlayerSource {
  const safeIndex = Math.min(Math.max(providerIndex, 0), PROVIDER_COUNT - 1);
  const provider = PROVIDERS[safeIndex];

  const baseUrl = provider.buildUrl(mediaType, { tmdbId, season, episode, startOffsetSeconds });
  const url = appendStartOffset(baseUrl, startOffsetSeconds);

  return {
    providerIndex: safeIndex,
    providerId: provider.id,
    providerName: provider.name,
    url,
    isLastProvider: safeIndex === PROVIDER_COUNT - 1,
  };
}

function appendStartOffset(url: string, startOffsetSeconds?: number): string {
  if (!startOffsetSeconds || startOffsetSeconds <= 0) return url;
  const sec = Math.floor(startOffsetSeconds);
  const separator = url.includes("?") ? "&" : "?";
  if (url.includes("vidlink.pro")) {
    if (!url.includes("startAt=")) return `${url}${separator}startAt=${sec}`;
    return url;
  }
  if (!url.includes("start=") && !url.includes("time=") && !url.includes("startAt=")) {
    return `${url}${separator}start=${sec}&time=${sec}`;
  }
  return url;
}

/** Returns the next provider index in the fallback chain, or null if exhausted. */
export function getNextProviderIndex(currentIndex: number): number | null {
  const next = currentIndex + 1;
  return next < PROVIDER_COUNT ? next : null;
}

/**
 * True when the provider at this index can't be turned into a URL
 * synchronously from `buildPlayerSource` alone (currently only YouTube,
 * which needs an async `/api/youtube/search` lookup first).
 */
export function isDynamicProvider(index: number): boolean {
  const safeIndex = Math.min(Math.max(index, 0), PROVIDER_COUNT - 1);
  return Boolean(PROVIDERS[safeIndex]?.isDynamic);
}

export interface ProviderListEntry {
  index: number;
  id: string;
  name: string;
  isDynamic: boolean;
}

/** Flat, ordered list of every provider in the fallback chain — for UI pickers (e.g. the "Swap Channel" dropdown). */
export function listProviders(): ProviderListEntry[] {
  return PROVIDERS.map((provider, index) => ({
    index,
    id: provider.id,
    name: provider.name,
    isDynamic: Boolean(provider.isDynamic),
  }));
}

export { PROVIDER_COUNT };
