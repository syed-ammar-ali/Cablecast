import { prisma } from "@/lib/prisma";

export type MediaType = "MOVIE" | "TV";
export type BroadcastSlotStatus = "OWNED" | "RENTED_VALID" | "RETURNED_EXPIRED";

export interface MediaOwnershipResult {
  isOwned: boolean;
  isRented: boolean;
  isValid: boolean;
  status: "OWNED" | "RENTED" | "EXPIRED" | "NONE";
  expiresAt: Date | null;
  libraryItem?: {
    id: string;
    userId: string;
    mediaId: number;
    mediaType: string;
    seasonNumber: number;
    createdAt: Date;
  };
  rental?: {
    id: string;
    userId: string;
    mediaId: number;
    mediaType: string;
    seasonNumber: number;
    rentedAt: Date;
    expiresAt: Date;
  };
}

/**
 * Checks whether a user permanently owns or currently holds a valid (unexpired) rental for a media item.
 *
 * @param userId - The ID of the user or session.
 * @param mediaId - TMDB media ID (number or string).
 * @param seasonNumber - Optional season number for TV shows (0 for movies/entire shows).
 * @param now - Reference timestamp (defaults to current time).
 */
export async function checkMediaOwnership(
  userId: string,
  mediaId: number | string,
  seasonNumber?: number | null,
  now: Date = new Date()
): Promise<MediaOwnershipResult> {
  const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
  if (isNaN(numericMediaId) || numericMediaId <= 0) {
    return { isOwned: false, isRented: false, isValid: false, status: "NONE", expiresAt: null };
  }

  const whereFilter: { userId: string; mediaId: number; seasonNumber?: number } = {
    userId,
    mediaId: numericMediaId,
  };
  if (seasonNumber !== undefined && seasonNumber !== null) {
    whereFilter.seasonNumber = Number(seasonNumber);
  }

  // 1. Permanent collection check in LibraryItem
  const libraryItem = await prisma.libraryItem.findFirst({
    where: whereFilter,
  });

  if (libraryItem) {
    return {
      isOwned: true,
      isRented: false,
      isValid: true,
      status: "OWNED",
      expiresAt: null,
      libraryItem,
    };
  }

  // 2. Active Rental check (unexpired)
  const activeRental = await prisma.rental.findFirst({
    where: {
      ...whereFilter,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
  });

  if (activeRental) {
    return {
      isOwned: false,
      isRented: true,
      isValid: true,
      status: "RENTED",
      expiresAt: activeRental.expiresAt,
      rental: activeRental,
    };
  }

  // 3. Expired rental check (if any existed in the past)
  const expiredRental = await prisma.rental.findFirst({
    where: whereFilter,
    orderBy: { expiresAt: "desc" },
  });

  return {
    isOwned: false,
    isRented: false,
    isValid: false,
    status: expiredRental ? "EXPIRED" : "NONE",
    expiresAt: expiredRental?.expiresAt ?? null,
    rental: expiredRental ?? undefined,
  };
}

/**
 * Evaluates the broadcast slot status for a scheduled airing time against the user's permanent collection and rental passes.
 *
 * Returns:
 * - 'OWNED': User owns the item permanently in LibraryItem.
 * - 'RENTED_VALID': Item is in Rental and scheduledTime <= expiresAt.
 * - 'RETURNED_EXPIRED': Item is in Rental but scheduledTime > expiresAt (or no active pass exists).
 *
 * @param userId - The ID of the user or session.
 * @param mediaId - TMDB media ID (number or string).
 * @param seasonNumber - Optional season number for TV shows.
 * @param scheduledTime - Timestamp when the slot airs (Date, ISO string, or timestamp).
 */
export async function getBroadcastSlotStatus(
  userId: string,
  mediaId: number | string,
  seasonNumber?: number | null,
  scheduledTime: Date | string | number = new Date()
): Promise<BroadcastSlotStatus> {
  const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
  if (isNaN(numericMediaId) || numericMediaId <= 0) {
    return "RETURNED_EXPIRED";
  }

  const targetDate =
    scheduledTime instanceof Date
      ? scheduledTime
      : typeof scheduledTime === "string" || typeof scheduledTime === "number"
      ? new Date(scheduledTime)
      : new Date();

  const whereFilter: { userId: string; mediaId: number; seasonNumber?: number } = {
    userId,
    mediaId: numericMediaId,
  };
  if (seasonNumber !== undefined && seasonNumber !== null) {
    whereFilter.seasonNumber = Number(seasonNumber);
  }

  // 1. Permanent collection check in LibraryItem
  const libraryItem = await prisma.libraryItem.findFirst({
    where: whereFilter,
  });

  if (libraryItem) {
    return "OWNED";
  }

  // 2. Rental check: find the latest rental for this media
  const latestRental = await prisma.rental.findFirst({
    where: whereFilter,
    orderBy: { expiresAt: "desc" },
  });

  if (latestRental && targetDate.getTime() <= latestRental.expiresAt.getTime()) {
    return "RENTED_VALID";
  }

  return "RETURNED_EXPIRED";
}

/**
 * Issues or extends a temporary VHS rental access pass for a user.
 * If an active unexpired rental exists, it extends the duration from the current expiration date.
 */
export async function createOrRenewRental(
  userId: string,
  mediaId: number | string,
  mediaType: "movie" | "tv" | "MOVIE" | "TV" | string,
  durationHours: number = 48,
  seasonNumber?: number | null,
  meta?: { title?: string; posterPath?: string; backdropUrl?: string; releaseYear?: string; overview?: string; voteAverage?: number },
) {
  const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
  const normalizedMediaType: "MOVIE" | "TV" =
    String(mediaType).toUpperCase() === "TV" ? "TV" : "MOVIE";
  const normalizedSeason = seasonNumber !== undefined && seasonNumber !== null ? Number(seasonNumber) : 0;
  const now = new Date();

  // Check for existing active rental to extend seamlessly
  const existingRental = await prisma.rental.findFirst({
    where: {
      userId,
      mediaId: numericMediaId,
      seasonNumber: normalizedSeason,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
  });

  if (existingRental) {
    const newExpiresAt = new Date(existingRental.expiresAt.getTime() + durationHours * 60 * 60 * 1000);
    return prisma.rental.update({
      where: { id: existingRental.id },
      data: {
        expiresAt: newExpiresAt,
        mediaType: normalizedMediaType,
        ...(meta?.title && { title: meta.title }),
        ...(meta?.posterPath && { posterPath: meta.posterPath }),
        ...(meta?.backdropUrl && { backdropUrl: meta.backdropUrl }),
        ...(meta?.releaseYear && { releaseYear: meta.releaseYear }),
        ...(meta?.overview && { overview: meta.overview }),
      },
    });
  }

  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  return prisma.rental.create({
    data: {
      userId,
      mediaId: numericMediaId,
      mediaType: normalizedMediaType,
      seasonNumber: normalizedSeason,
      rentedAt: now,
      expiresAt,
      title: meta?.title ?? null,
      posterPath: meta?.posterPath ?? null,
      backdropUrl: meta?.backdropUrl ?? null,
      releaseYear: meta?.releaseYear ?? null,
      overview: meta?.overview ?? null,
    },
  });
}

/**
 * Adds a media item to the user's permanent collection in LibraryItem.
 */
export async function addLibraryItem(
  userId: string,
  mediaId: number | string,
  mediaType: "movie" | "tv" | "MOVIE" | "TV" | string,
  seasonNumber?: number | null,
  meta?: { title?: string; posterPath?: string; backdropUrl?: string; releaseYear?: string; overview?: string; voteAverage?: number },
) {
  const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
  const normalizedMediaType: "MOVIE" | "TV" =
    String(mediaType).toUpperCase() === "TV" ? "TV" : "MOVIE";
  const normalizedSeason = seasonNumber !== undefined && seasonNumber !== null ? Number(seasonNumber) : 0;

  return prisma.libraryItem.upsert({
    where: {
      userId_mediaId_seasonNumber: {
        userId,
        mediaId: numericMediaId,
        seasonNumber: normalizedSeason,
      },
    },
    update: {
      mediaType: normalizedMediaType,
      ...(meta?.title && { title: meta.title }),
      ...(meta?.posterPath && { posterPath: meta.posterPath }),
      ...(meta?.backdropUrl && { backdropUrl: meta.backdropUrl }),
      ...(meta?.releaseYear && { releaseYear: meta.releaseYear }),
      ...(meta?.overview && { overview: meta.overview }),
    },
    create: {
      userId,
      mediaId: numericMediaId,
      mediaType: normalizedMediaType,
      seasonNumber: normalizedSeason,
      title: meta?.title ?? null,
      posterPath: meta?.posterPath ?? null,
      backdropUrl: meta?.backdropUrl ?? null,
      releaseYear: meta?.releaseYear ?? null,
      overview: meta?.overview ?? null,
    },
  });
}

/**
 * Removes an item from the user's permanent collection in LibraryItem, active Rentals,
 * and cascades the deletion to their Personal Broadcast Schedule and alerts.
 * If seasonNumber is provided, deletes only that season; if omitted or null, deletes all seasons for that media.
 */
export async function removeLibraryItem(
  userId: string,
  mediaId: number | string,
  seasonNumber?: number | null
) {
  const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;

  const libraryWhere: { userId: string; mediaId: number; seasonNumber?: number } = {
    userId,
    mediaId: numericMediaId,
  };
  const rentalWhere: { userId: string; mediaId: number; seasonNumber?: number } = {
    userId,
    mediaId: numericMediaId,
  };
  const scheduleWhere: { sessionId: string; tmdbId: number; currentSeason?: number } = {
    sessionId: userId,
    tmdbId: numericMediaId,
  };
  const missedWhere: { sessionId: string; tmdbId: number; season?: number } = {
    sessionId: userId,
    tmdbId: numericMediaId,
  };
  const alertWhere: { sessionId: string; tmdbId: number; completedSeason?: number } = {
    sessionId: userId,
    tmdbId: numericMediaId,
  };

  if (seasonNumber !== undefined && seasonNumber !== null && Number(seasonNumber) > 0) {
    const numSeason = Number(seasonNumber);
    libraryWhere.seasonNumber = numSeason;
    rentalWhere.seasonNumber = numSeason;
    scheduleWhere.currentSeason = numSeason;
    missedWhere.season = numSeason;
    alertWhere.completedSeason = numSeason;
  }

  await prisma.$transaction([
    prisma.libraryItem.deleteMany({ where: libraryWhere }),
    prisma.rental.deleteMany({ where: rentalWhere }),
    prisma.userPersonalSchedule.deleteMany({ where: scheduleWhere }),
    prisma.userMissedBroadcast.deleteMany({ where: missedWhere }),
    prisma.userSeasonCompletedAlert.deleteMany({ where: alertWhere }),
  ]);

  return { success: true };
}
