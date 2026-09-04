"use client";

import { useCallback, useEffect, useState } from "react";
import type { FavoriteItem, LibraryMediaItem } from "@/types/library";
import type { MediaSearchResult, MediaType } from "@/types/media";
import {
  CABLECAST_LIBRARY_MUTATION,
  notifyLibraryMutation,
  notifyBroadcastMutation,
} from "./syncEvents";

const LOCAL_FAVORITES_KEY = "cablecast_user_favorites";

function getInitialFavorites(): FavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

function safeSetStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[Storage] Failed to cache key "${key}":`, err);
  }
}

export function useLibrary() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [owned, setOwned] = useState<LibraryMediaItem[]>([]);
  const [rented, setRented] = useState<LibraryMediaItem[]>([]);
  const [collection, setCollection] = useState<LibraryMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Synchronize favorites and collection items from server quietly
  const refreshCollection = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const [favRes, colRes] = await Promise.all([
        fetch("/api/library/favorites", { signal }),
        fetch("/api/library/collection", { signal }),
      ]);

      if (favRes.ok) {
        const favData = await favRes.json();
        if (Array.isArray(favData.favorites)) {
          setFavorites(favData.favorites);
          safeSetStorage(LOCAL_FAVORITES_KEY, favData.favorites);
        }
      }

      if (colRes.ok) {
        const colData = await colRes.json();
        setOwned(colData.owned || []);
        setRented(colData.rented || []);
        setCollection(colData.collection || []);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      console.debug?.("[Library] Collection fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch once on mount, and re-fetch ONLY on user mutation events or tab focus
  useEffect(() => {
    // Hydrate local cache on client mount (prevents SSR hydration mismatches)
    try {
      const cachedFav = localStorage.getItem(LOCAL_FAVORITES_KEY);
      if (cachedFav) setFavorites(JSON.parse(cachedFav));
    } catch {
      // ignore
    }

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCollection(controller.signal);

    const handleMutation = () => {
      void refreshCollection();
    };

    window.addEventListener(CABLECAST_LIBRARY_MUTATION, handleMutation);

    return () => {
      controller.abort();
      window.removeEventListener(CABLECAST_LIBRARY_MUTATION, handleMutation);
    };
  }, [refreshCollection]);

  const isFavorite = useCallback(
    (tmdbId: number | string, mediaType: MediaType = "movie") => {
      const numId = Number(tmdbId);
      return favorites.some((f) => f.tmdbId === numId && f.mediaType === mediaType);
    },
    [favorites],
  );

  const toggleFavorite = useCallback(
    async (media: MediaSearchResult) => {
      const tmdbId = Number(media.tmdbId);
      const mediaType = media.mediaType;
      const exists = favorites.some((f) => f.tmdbId === tmdbId && f.mediaType === mediaType);

      if (exists) {
        const next = favorites.filter((f) => !(f.tmdbId === tmdbId && f.mediaType === mediaType));
        setFavorites(next);
        safeSetStorage(LOCAL_FAVORITES_KEY, next);
        notifyLibraryMutation();

        fetch(`/api/library/favorites?tmdbId=${tmdbId}&mediaType=${mediaType}`, {
          method: "DELETE",
        }).catch(console.error);
      } else {
        const newFav: FavoriteItem = {
          id: `fav_${tmdbId}_${mediaType}_${Date.now()}`,
          tmdbId,
          mediaType,
          title: media.title,
          posterPath: media.posterPath ?? null,
          backdropUrl: media.backdropUrl ?? null,
          releaseYear: media.releaseYear ?? null,
          overview: media.overview ?? null,
          voteAverage: media.voteAverage ?? null,
          createdAt: new Date().toISOString(),
        };

        const next = [newFav, ...favorites.filter((f) => !(f.tmdbId === tmdbId && f.mediaType === mediaType))];
        setFavorites(next);
        safeSetStorage(LOCAL_FAVORITES_KEY, next);
        notifyLibraryMutation();

        fetch("/api/library/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newFav),
        }).catch(console.error);
      }
    },
    [favorites],
  );

  const removeItem = useCallback(
    async (mediaId: number | string, seasonNumber?: number | null): Promise<boolean> => {
      const numId = Number(mediaId);
      const parsedSeason = seasonNumber !== undefined && seasonNumber !== null ? Number(seasonNumber) : 0;

      // Optimistic state update
      setCollection((prev) =>
        prev.filter((item) => !(item.tmdbId === numId && (item.seasonNumber ?? 0) === parsedSeason))
      );
      setOwned((prev) =>
        prev.filter((item) => !(item.tmdbId === numId && (item.seasonNumber ?? 0) === parsedSeason))
      );
      setRented((prev) =>
        prev.filter((item) => !(item.tmdbId === numId && (item.seasonNumber ?? 0) === parsedSeason))
      );

      notifyLibraryMutation();
      notifyBroadcastMutation();

      try {
        const res = await fetch("/api/vhs/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REMOVE",
            mediaId: numId,
            mediaType: "movie",
            seasonNumber: parsedSeason,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to remove item.");
        }

        void refreshCollection();
        return true;
      } catch (err) {
        console.error("[useLibrary] removeItem error:", err);
        void refreshCollection();
        return false;
      }
    },
    [refreshCollection]
  );

  return {
    favorites,
    owned,
    rented,
    collection,
    isLoading,
    isFavorite,
    toggleFavorite,
    removeItem,
    refreshCollection,
  };
}
