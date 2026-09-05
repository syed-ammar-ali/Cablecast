import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { getMovieDetails, getShowDetails } from "@/lib/tmdb";
import type { LibraryMediaItem } from "@/types/library";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ owned: [], rented: [], collection: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const now = new Date();

    // Query all three tables concurrently
    const [ownedRecords, rentedRecords, favoriteRecords] = await Promise.all([
      prisma.libraryItem.findMany({
        where: { userId: { in: userKeys } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.rental.findMany({
        where: { userId: { in: userKeys }, expiresAt: { gt: now } },
        orderBy: { expiresAt: "asc" },
      }),
      prisma.userFavorite.findMany({
        where: { sessionId: { in: userKeys } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Quick lookup map for local favorites: key = "movie_123" or "tv_123"
    const favMap = new Map(
      favoriteRecords.map((f) => [`${f.mediaType.toLowerCase()}_${f.tmdbId}`, f]),
    );

    // In-memory cache for TMDB responses to prevent duplicate calls in the same request
    const showDetailsCache = new Map<number, any>();
    const movieDetailsCache = new Map<number, any>();

    async function resolveMetadata(
      mediaId: number,
      mediaType: string,
      seasonNumber: number = 0,
      existing: {
        title?: string | null;
        posterPath?: string | null;
        backdropUrl?: string | null;
        releaseYear?: string | null;
        overview?: string | null;
        voteAverage?: number | null;
      },
      persistCallback?: (data: {
        title: string;
        posterPath: string | null;
        backdropUrl: string | null;
        releaseYear: string | null;
        overview: string | null;
        voteAverage: number | null;
      }) => Promise<void>,
    ) {
      const isTv = mediaType.toLowerCase() === "tv";

      // If title and poster are already present in DB, return immediately (0 external network calls)
      if (existing.title && existing.posterPath) {
        return {
          title: existing.title,
          posterPath: existing.posterPath,
          backdropUrl: existing.backdropUrl ?? null,
          releaseYear: existing.releaseYear ?? null,
          overview: existing.overview ?? null,
          voteAverage: existing.voteAverage ?? null,
        };
      }

      // Check local favorites map before making an outbound request
      const fav = favMap.get(`${mediaType.toLowerCase()}_${mediaId}`);
      if (fav?.title && fav?.posterPath) {
        return {
          title: fav.title,
          posterPath: fav.posterPath,
          backdropUrl: fav.backdropUrl ?? null,
          releaseYear: fav.releaseYear ?? null,
          overview: fav.overview ?? null,
          voteAverage: fav.voteAverage ?? null,
        };
      }

      // Check TMDB for season-specific year and ratings
      try {
        if (isTv) {
          let details = showDetailsCache.get(mediaId);
          if (!details) {
            details = await getShowDetails(mediaId);
            showDetailsCache.set(mediaId, details);
          }

          let seasonYear: string | null = null;
          let seasonPoster: string | null = null;

          if (seasonNumber > 0 && Array.isArray(details?.seasons)) {
            const matchedSeason = details.seasons.find((s: any) => s.seasonNumber === seasonNumber);
            if (matchedSeason?.airDate) {
              seasonYear = String(matchedSeason.airDate).slice(0, 4);
            }
            if (matchedSeason?.posterUrl) {
              seasonPoster = matchedSeason.posterUrl;
            }
          }

          const resolved = {
            title: details?.title ?? existing.title ?? `TV Show #${mediaId}`,
            posterPath: seasonPoster || details?.posterUrl || existing.posterPath || null,
            backdropUrl: details?.backdropUrl || existing.backdropUrl || null,
            releaseYear: seasonYear || details?.releaseYear || existing.releaseYear || null,
            overview: details?.overview || existing.overview || null,
            voteAverage: typeof details?.voteAverage === "number" ? details.voteAverage : (existing.voteAverage ?? null),
          };

          if (persistCallback && resolved.title) {
            void persistCallback(resolved).catch(() => {});
          }

          return resolved;
        } else {
          // Movie
          let details = movieDetailsCache.get(mediaId);
          if (!details) {
            details = await getMovieDetails(mediaId);
            movieDetailsCache.set(mediaId, details);
          }

          const resolved = {
            title: details?.title ?? existing.title ?? `Movie #${mediaId}`,
            posterPath: details?.posterUrl || existing.posterPath || null,
            backdropUrl: details?.backdropUrl || existing.backdropUrl || null,
            releaseYear: details?.releaseYear || existing.releaseYear || null,
            overview: details?.overview || existing.overview || null,
            voteAverage: typeof details?.voteAverage === "number" ? details.voteAverage : (existing.voteAverage ?? null),
          };

          if (persistCallback && resolved.title) {
            void persistCallback(resolved).catch(() => {});
          }

          return resolved;
        }
      } catch (err) {
        console.warn(`[collection] Metadata resolution fallback for ${mediaType}_${mediaId}:`, err);

        const fav = favMap.get(`${mediaType.toLowerCase()}_${mediaId}`);
        return {
          title: existing.title || fav?.title || `${isTv ? "TV Show" : "Movie"} #${mediaId}`,
          posterPath: existing.posterPath || fav?.posterPath || null,
          backdropUrl: existing.backdropUrl || fav?.backdropUrl || null,
          releaseYear: existing.releaseYear || fav?.releaseYear || null,
          overview: existing.overview || fav?.overview || null,
          voteAverage: existing.voteAverage ?? fav?.voteAverage ?? null,
        };
      }
    }

    // Resolve Owned Items in parallel
    const owned: LibraryMediaItem[] = await Promise.all(
      ownedRecords.map(async (item) => {
        const meta = await resolveMetadata(
          item.mediaId,
          item.mediaType,
          item.seasonNumber,
          {
            title: item.title,
            posterPath: item.posterPath,
            backdropUrl: item.backdropUrl,
            releaseYear: item.releaseYear,
            overview: item.overview,
            voteAverage: (item as any).voteAverage ?? null,
          },
          async (data) => {
            await prisma.libraryItem.update({
              where: { id: item.id },
              data: {
                title: data.title,
                posterPath: data.posterPath,
                backdropUrl: data.backdropUrl,
                releaseYear: data.releaseYear,
                overview: data.overview,
              },
            });
          },
        );

        return {
          id: `owned_${item.id}`,
          tmdbId: item.mediaId,
          mediaType: item.mediaType.toLowerCase() as "movie" | "tv",
          title: meta.title,
          posterPath: meta.posterPath,
          backdropUrl: meta.backdropUrl,
          releaseYear: meta.releaseYear,
          overview: meta.overview,
          voteAverage: meta.voteAverage,
          seasonNumber: item.seasonNumber,
          ownershipType: "OWNED" as const,
          expiresAt: null,
          createdAt: item.createdAt.toISOString(),
        };
      }),
    );

    // Resolve Rented Items in parallel
    const rented: LibraryMediaItem[] = await Promise.all(
      rentedRecords.map(async (item) => {
        const meta = await resolveMetadata(
          item.mediaId,
          item.mediaType,
          item.seasonNumber,
          {
            title: item.title,
            posterPath: item.posterPath,
            backdropUrl: item.backdropUrl,
            releaseYear: item.releaseYear,
            overview: item.overview,
            voteAverage: (item as any).voteAverage ?? null,
          },
          async (data) => {
            await prisma.rental.update({
              where: { id: item.id },
              data: {
                title: data.title,
                posterPath: data.posterPath,
                backdropUrl: data.backdropUrl,
                releaseYear: data.releaseYear,
                overview: data.overview,
              },
            });
          },
        );

        return {
          id: `rented_${item.id}`,
          tmdbId: item.mediaId,
          mediaType: item.mediaType.toLowerCase() as "movie" | "tv",
          title: meta.title,
          posterPath: meta.posterPath,
          backdropUrl: meta.backdropUrl,
          releaseYear: meta.releaseYear,
          overview: meta.overview,
          voteAverage: meta.voteAverage,
          seasonNumber: item.seasonNumber,
          ownershipType: "RENTED" as const,
          expiresAt: item.expiresAt.toISOString(),
          createdAt: item.rentedAt.toISOString(),
        };
      }),
    );

    // Saved items from Favorites (excluding those already owned or rented)
    const ownedKeys = new Set(owned.map((o) => `${o.mediaType}_${o.tmdbId}`));
    const rentedKeys = new Set(rented.map((r) => `${r.mediaType}_${r.tmdbId}`));

    const saved: LibraryMediaItem[] = favoriteRecords
      .filter((fav) => {
        const k = `${fav.mediaType.toLowerCase()}_${fav.tmdbId}`;
        return !ownedKeys.has(k) && !rentedKeys.has(k);
      })
      .map((fav) => ({
        id: `saved_${fav.id}`,
        tmdbId: fav.tmdbId,
        mediaType: fav.mediaType as "movie" | "tv",
        title: fav.title,
        posterPath: fav.posterPath,
        backdropUrl: fav.backdropUrl,
        releaseYear: fav.releaseYear,
        overview: fav.overview,
        voteAverage: fav.voteAverage,
        seasonNumber: 0,
        ownershipType: "SAVED" as const,
        expiresAt: null,
        createdAt: fav.createdAt.toISOString(),
      }));

    const collection: LibraryMediaItem[] = [...owned, ...rented, ...saved];

    return NextResponse.json({ owned, rented, collection });
  } catch (error) {
    console.error("[api/library/collection] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load collection", owned: [], rented: [], collection: [] },
      { status: 500 },
    );
  }
}
