"use client";

import { useCallback, useState } from "react";
import { classifyBroadcast } from "@/lib/broadcastCategory";
import { getBroadcastLiveOffsetSeconds } from "@/lib/broadcastLive";
import type { BroadcastScheduleItem } from "@/types/tvmaze";
import type { MediaSearchResult, MediaSearchResponse, MediaType } from "@/types/media";
import type { BroadcastSelection } from "@/types/broadcastSelection";
import type { DirectBroadcast } from "@/components/player/PlayerModal";

interface UseBroadcastResolverOptions {
  onSelectBroadcast: (selection: BroadcastSelection) => void;
  onSelectDirectBroadcast: (broadcast: DirectBroadcast) => void;
}

/**
 * Resolves a real-world TVmaze broadcast slot to something playable —
 * shared by the World Guide grid and the hero's "Live Now" panel so both
 * surfaces tune into the same show the same way (and share the resulting
 * resolving/unavailable state, so a slot marked unavailable from one place
 * shows as unavailable everywhere else too).
 */
export function useBroadcastResolver({ onSelectBroadcast, onSelectDirectBroadcast }: UseBroadcastResolverOptions) {
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveMessage, setResolveMessage] = useState<string | null>(null);
  // Slots we've already tried (IMDb lookup + title-search fallback) and
  // confirmed have no TMDB match — greyed out and disabled so a second
  // click doesn't repeat a lookup we already know will fail.
  const [unavailableIds, setUnavailableIds] = useState<Set<number>>(new Set());

  const clearUnavailable = useCallback(() => {
    setUnavailableIds(new Set());
  }, []);

  const flashResolveMessage = useCallback((message: string) => {
    setResolveMessage(message);
    setTimeout(() => setResolveMessage((current) => (current === message ? null : current)), 3000);
  }, []);

  /**
   * Falls back to a plain TMDB title search (`/search/multi`) when there's
   * no IMDb ID to look up, or the IMDb ID didn't resolve to anything on
   * TMDB. TVmaze's `/schedule` only ever lists TV episodes, so we only
   * consider `tv` results, preferring an exact (case-insensitive) title
   * match and otherwise taking TMDB's top (most popular) hit.
   */
  const searchByTitle = useCallback(
    async (showName: string): Promise<{ tmdbId: number; mediaType: MediaType } | null> => {
      const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(showName)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as MediaSearchResponse;

      const tvResults = data.results?.filter((result) => result.mediaType === "tv") ?? [];
      if (tvResults.length === 0) return null;

      const normalizedName = showName.trim().toLowerCase();
      const exactMatch = tvResults.find(
        (result) => result.title.trim().toLowerCase() === normalizedName,
      );
      const best = exactMatch ?? tvResults[0];
      return { tmdbId: best.tmdbId, mediaType: best.mediaType };
    },
    [],
  );

  /**
   * News/Sports broadcasts don't have a TMDB episode to look up — they're
   * routed to a dedicated, category-appropriate source (an official live
   * stream, a news archive recording, or an official highlights upload)
   * instead. See `src/lib/broadcastCategory.ts`.
   */
  const resolveDirectBroadcast = useCallback(
    async (item: BroadcastScheduleItem, category: "news" | "sports"): Promise<DirectBroadcast | null> => {
      if (category === "news") {
        const params = new URLSearchParams({ network: item.network, airdate: item.airdate });
        const res = await fetch(`/api/broadcast/news?${params.toString()}`);
        if (!res.ok) return null;
        const data = (await res.json()) as { embedUrl: string | null; label?: string };
        if (!data.embedUrl) return null;
        return { embedUrl: data.embedUrl, label: data.label ?? "Live", title: item.showName };
      }

      const params = new URLSearchParams({ title: item.showName, network: item.network });
      const res = await fetch(`/api/broadcast/sports?${params.toString()}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { embedUrl: string | null; label?: string };
      if (!data.embedUrl) return null;
      return { embedUrl: data.embedUrl, label: data.label ?? "Highlights", title: item.showName };
    },
    [],
  );

  const resolveBroadcast = useCallback(
    async (item: BroadcastScheduleItem, now: Date) => {
      if (unavailableIds.has(item.id) || resolvingId === item.id) return;

      const category = classifyBroadcast(item.showType);

      setResolvingId(item.id);
      try {
        if (category === "news" || category === "sports") {
          const direct = await resolveDirectBroadcast(item, category);
          if (!direct) {
            setUnavailableIds((prev) => new Set(prev).add(item.id));
            flashResolveMessage(
              category === "news"
                ? `No live stream or news archive recording found for "${item.showName}".`
                : `No official highlights found for "${item.showName}".`,
            );
            return;
          }
          onSelectDirectBroadcast(direct);
          return;
        }

        let match: { tmdbId: number; mediaType: MediaType } | null = null;

        if (item.imdbId) {
          const res = await fetch(`/api/tmdb/find?imdbId=${encodeURIComponent(item.imdbId)}`);
          const data = await res.json();
          if (res.ok && data.result) {
            match = { tmdbId: data.result.tmdbId, mediaType: data.result.mediaType };
          }
        }

        // No IMDb ID at all, or the IMDb ID didn't resolve on TMDB — try a
        // best-effort title search before giving up on this slot.
        if (!match) {
          match = await searchByTitle(item.showName);
        }

        if (!match) {
          setUnavailableIds((prev) => new Set(prev).add(item.id));
          flashResolveMessage(`No TMDB match found for "${item.showName}".`);
          return;
        }

        const media: MediaSearchResult = {
          tmdbId: match.tmdbId,
          mediaType: match.mediaType,
          title: item.showName,
          releaseYear: item.airdate ? item.airdate.slice(0, 4) : null,
          posterPath: null,
          posterUrl: item.imageUrl,
          backdropUrl: null,
          overview: item.summary ?? "",
          voteAverage: 0,
        };

        const resolvedSeason = item.season != null && item.season > 0 && item.season < 100 ? item.season : undefined;

        onSelectBroadcast({
          media,
          season: resolvedSeason,
          episode: item.episodeNumber ?? undefined,
          startOffsetSeconds: getBroadcastLiveOffsetSeconds(item, now) ?? undefined,
          startTime: item.airstamp ?? undefined,
        });
      } catch {
        setUnavailableIds((prev) => new Set(prev).add(item.id));
        flashResolveMessage(`No match found for "${item.showName}".`);
      } finally {
        setResolvingId(null);
      }
    },
    [
      flashResolveMessage,
      onSelectBroadcast,
      onSelectDirectBroadcast,
      resolveDirectBroadcast,
      resolvingId,
      searchByTitle,
      unavailableIds,
    ],
  );

  return { resolvingId, resolveMessage, unavailableIds, resolveBroadcast, clearUnavailable };
}
