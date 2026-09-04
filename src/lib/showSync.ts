import { prisma } from "@/lib/prisma";
import { getSeasonEpisodes, getShowDetails } from "@/lib/tmdb";

/**
 * Fetches all seasons & episodes from TMDB for a registered show,
 * formats codes as [PREFIX][SS][EE], and bulk-stores them in the database.
 */
export async function syncShowCodes(showId: string): Promise<{
  success: boolean;
  codesGenerated: number;
  seasonsProcessed: number;
}> {
  const show = await prisma.registeredShow.findUnique({ where: { id: showId } });
  if (!show) {
    throw new Error("Show not found.");
  }

  // Fetch full show details from TMDB to get the season list
  const details = await getShowDetails(show.tmdbId);
  const seasons = details.seasons.filter((s) => s.seasonNumber > 0);

  const codesToUpsert: {
    code: string;
    showId: string;
    season: number;
    episode: number;
    airDate: string | null;
    episodeTitle: string | null;
  }[] = [];

  // Fetch each season's episodes sequentially with pacing to avoid socket resets
  for (const season of seasons) {
    let episodes;
    try {
      episodes = await getSeasonEpisodes(show.tmdbId, season.seasonNumber);
      // Small 100ms pacing between seasons to avoid TMDB rate limit / ECONNRESET
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Retry once before skipping
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        episodes = await getSeasonEpisodes(show.tmdbId, season.seasonNumber);
      } catch {
        console.warn(`[syncShowCodes] Skipping S${season.seasonNumber} for ${show.title}`);
        continue;
      }
    }

    for (const ep of episodes) {
      const seasonStr = String(ep.seasonNumber).padStart(2, "0");
      const episodeStr = String(ep.episodeNumber).padStart(2, "0");
      const code = `${show.prefix}${seasonStr}${episodeStr}`;

      codesToUpsert.push({
        code,
        showId: show.id,
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        airDate: ep.airDate ?? null,
        episodeTitle: ep.name ?? null,
      });
    }
  }

  // Upsert in one transaction: replace existing codes with fresh list
  await prisma.$transaction([
    prisma.episodeCode.deleteMany({ where: { showId: show.id } }),
    prisma.episodeCode.createMany({ data: codesToUpsert }),
    prisma.registeredShow.update({
      where: { id: show.id },
      data: {
        totalSeasons: seasons.length,
        totalCodes: codesToUpsert.length,
      },
    }),
  ]);

  return {
    success: true,
    codesGenerated: codesToUpsert.length,
    seasonsProcessed: seasons.length,
  };
}
