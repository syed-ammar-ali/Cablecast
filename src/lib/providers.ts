import {
  PROVIDER_COUNT,
  PROVIDERS,
  getProvidersForRegion,
  type MediaKind,
  type StreamRegion,
  type Provider,
} from "@/config/providers";

export interface BuildPlayerUrlArgs {
  providerIndex?: number;
  providerId?: string;
  provider?: Provider;
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
 * Resolves the iframe `src` for the current provider or index, appending the
 * `start` offset query param so playback can resume mid-episode.
 * Wraps the index defensively so an out-of-range value never throws.
 */
export function buildPlayerSource({
  provider,
  providerId,
  providerIndex = 0,
  tmdbId,
  mediaType,
  season,
  episode,
  startOffsetSeconds,
}: BuildPlayerUrlArgs): PlayerSource {
  const resolvedProvider =
    provider ??
    (providerId ? PROVIDERS.find((p) => p.id === providerId) : undefined) ??
    PROVIDERS[Math.min(Math.max(providerIndex, 0), PROVIDER_COUNT - 1)];

  const safeIndex = PROVIDERS.findIndex((p) => p.id === resolvedProvider.id);
  const effectiveIndex = safeIndex >= 0 ? safeIndex : 0;

  const baseUrl = resolvedProvider.buildUrl(mediaType, { tmdbId, season, episode, startOffsetSeconds });
  const url = appendStartOffset(baseUrl, startOffsetSeconds);

  return {
    providerIndex: effectiveIndex,
    providerId: resolvedProvider.id,
    providerName: resolvedProvider.name,
    url,
    isLastProvider: effectiveIndex === PROVIDER_COUNT - 1,
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
  if (!url.includes("start=") && !url.includes("time=") && !url.includes("startAt=") && !url.includes("&t=")) {
    return `${url}${separator}start=${sec}&time=${sec}&startAt=${sec}&t=${sec}`;
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
 * synchronously from `buildPlayerSource` alone (e.g. YouTube, KissKH, DramaCool,
 * which need an async search lookup first).
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
  regions?: StreamRegion[];
  benchmarkLatencyMs?: number;
}

export function listProviders(region?: StreamRegion): ProviderListEntry[] {
  const providers = getProvidersForRegion(region ?? "ALL");
  return providers.map((provider) => {
    const globalIndex = PROVIDERS.findIndex((p) => p.id === provider.id);
    return {
      index: globalIndex >= 0 ? globalIndex : 0,
      id: provider.id,
      name: provider.name,
      isDynamic: Boolean(provider.isDynamic),
      regions: provider.regions,
      benchmarkLatencyMs: provider.benchmarkLatencyMs,
    };
  });
}

/**
 * Maps standard ISO country code (from TMDB origin_country or TV guide metadata)
 * to one of the 5 regional stream tiers.
 */
export function inferRegionFromCountry(countryCode?: string): StreamRegion {
  if (!countryCode) return "ALL";
  const code = countryCode.toUpperCase();
  if (code === "IN") return "IN";
  if (code === "US") return "US";
  if (code === "JP" || code === "KR") return "JP_KR";
  if (code === "GB" || code === "UK" || code === "CA") return "GB_CA";
  if (code === "AU" || code === "DE" || code === "FR") return "AU_DE_FR";
  return "ALL";
}

export { PROVIDER_COUNT };
