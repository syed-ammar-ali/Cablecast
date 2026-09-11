import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { getShowDetails, getSeasonEpisodes, TmdbApiError } from "@/lib/tmdb";
import {
  generateNostalgiaSchedule,
  type NostalgiaSeasonInput,
  type NostalgiaScheduleConfig,
} from "@/lib/nostalgiaScheduler";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ campaigns: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    // Fetch all TV calendar entries for this user
    const entries = await prisma.calendarEntry.findMany({
      where: {
        sessionId: { in: userKeys },
        mediaType: "tv",
      },
      orderBy: [{ scheduledDate: "asc" }, { blockStartMinutes: "asc" }],
    });

    if (entries.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    // Group by tmdbId
    const grouped = new Map<number, typeof entries>();
    for (const entry of entries) {
      const list = grouped.get(entry.tmdbId) || [];
      list.push(entry);
      grouped.set(entry.tmdbId, list);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const campaigns = [];

    for (const [tmdbId, showEntries] of grouped.entries()) {
      // Only treat as a "series run" if there are multiple scheduled episodes (e.g. >= 3)
      // or if it spans seasons, distinguishing it from an isolated single-episode screening
      if (showEntries.length < 2) continue;

      const firstEntry = showEntries[0];
      const lastEntry = showEntries[showEntries.length - 1];

      const seasonSet = new Set<number>();
      for (const e of showEntries) {
        if (e.startSeason) seasonSet.add(e.startSeason);
      }

      // Determine day of week from first entry
      const [y, m, d] = firstEntry.scheduledDate.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();

      // Find next upcoming episode
      const nextEntry = showEntries.find((e) => e.scheduledDate >= todayStr) || null;

      campaigns.push({
        tmdbId,
        title: firstEntry.title,
        posterPath: firstEntry.posterPath,
        backdropUrl: firstEntry.backdropUrl,
        dayOfWeek,
        blockStartMinutes: firstEntry.blockStartMinutes,
        totalSeasons: seasonSet.size,
        totalEpisodes: showEntries.length,
        firstAirDate: firstEntry.scheduledDate,
        lastAirDate: lastEntry.scheduledDate,
        nextAiring: nextEntry
          ? {
              scheduledDate: nextEntry.scheduledDate,
              blockStartMinutes: nextEntry.blockStartMinutes,
              season: nextEntry.startSeason,
              episode: nextEntry.startEpisode,
            }
          : null,
      });
    }

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("[api/calendar/nostalgia GET] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch nostalgia campaigns." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    const body = await request.json();
    const {
      action = "preview",
      tmdbId,
      targetDayOfWeek = 4, // default Thursday
      blockStartMinutes = 1200, // default 8:00 PM
      startYear = new Date().getFullYear(),
      seasonOverrides = {},
    } = body;

    if (!tmdbId || !Number.isFinite(Number(tmdbId))) {
      return NextResponse.json(
        { error: "Missing or invalid `tmdbId`." },
        { status: 400 },
      );
    }

    // 1. Fetch TV show details from TMDB
    const show = await getShowDetails(tmdbId);
    if (!show || show.mediaType !== "tv") {
      return NextResponse.json(
        { error: "Show not found or is not a TV series." },
        { status: 404 },
      );
    }

    // 2. Fetch episodes for each valid season
    const validSeasons = show.seasons.filter((s) => s.seasonNumber > 0);
    const seasonInputs: NostalgiaSeasonInput[] = [];

    // Fetch season details in parallel
    const seasonEpisodePromises = validSeasons.map(async (s) => {
      try {
        const episodes = await getSeasonEpisodes(tmdbId, s.seasonNumber);
        return {
          seasonNumber: s.seasonNumber,
          name: s.name,
          airDate: s.airDate,
          episodes: episodes.map((ep) => ({
            episodeNumber: ep.episodeNumber,
            name: ep.name,
            airDate: ep.airDate,
            runtimeMinutes: ep.runtime?.exactMinutes ?? show.defaultRuntime?.exactMinutes ?? 30,
            stillUrl: ep.stillUrl,
          })),
        };
      } catch (err) {
        console.warn(`[api/calendar/nostalgia] Failed to load season ${s.seasonNumber}:`, err);
        return null;
      }
    });

    const resolvedSeasons = await Promise.all(seasonEpisodePromises);
    for (const s of resolvedSeasons) {
      if (s) seasonInputs.push(s);
    }

    if (seasonInputs.length === 0) {
      return NextResponse.json(
        { error: "Could not find any seasons or episodes for this show." },
        { status: 400 },
      );
    }

    // 3. Run Nostalgia Scheduling Algorithm
    const scheduleConfig: NostalgiaScheduleConfig = {
      tmdbId: Number(tmdbId),
      showTitle: show.title,
      posterPath: show.posterUrl,
      backdropUrl: show.backdropUrl,
      targetDayOfWeek: Number(targetDayOfWeek),
      blockStartMinutes: Number(blockStartMinutes),
      startYear: Number(startYear),
      seasons: seasonInputs,
      seasonOverrides,
    };

    const scheduleResult = generateNostalgiaSchedule(scheduleConfig);

    // If only preview was requested, return the calculated roadmap
    if (action === "preview") {
      return NextResponse.json({ preview: scheduleResult });
    }

    // If commit was requested: Write entries to CalendarEntry
    if (action === "commit") {
      // 1. Remove existing entries for this show and user to prevent duplicates
      await prisma.calendarEntry.deleteMany({
        where: {
          sessionId: { in: userKeys },
          tmdbId: Number(tmdbId),
          mediaType: "tv",
        },
      });

      // 2. Prepare bulk insert data
      const entriesToInsert = scheduleResult.allEntries.map((ep) => ({
        sessionId: userId,
        tmdbId: Number(tmdbId),
        mediaType: "tv",
        title: show.title,
        posterPath: show.posterUrl,
        backdropUrl: show.backdropUrl,
        runtimeMinutes: ep.runtimeMinutes ?? 30,
        scheduledDate: ep.scheduledDate,
        blockStartMinutes: ep.blockStartMinutes,
        blockCount: ep.blockCount,
        startSeason: ep.seasonNumber,
        startEpisode: ep.episodeNumber,
      }));

      // In Postgres/Prisma createMany supports bulk creation
      await prisma.calendarEntry.createMany({
        data: entriesToInsert,
      });

      return NextResponse.json({
        success: true,
        count: entriesToInsert.length,
        campaign: {
          tmdbId: Number(tmdbId),
          title: show.title,
          posterPath: show.posterUrl,
          backdropUrl: show.backdropUrl,
          dayOfWeek: Number(targetDayOfWeek),
          blockStartMinutes: Number(blockStartMinutes),
          totalSeasons: scheduleResult.totalSeasons,
          totalEpisodes: scheduleResult.totalEpisodes,
          firstAirDate: scheduleResult.firstAirDate,
          lastAirDate: scheduleResult.lastAirDate,
        },
      });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/calendar/nostalgia POST] unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to generate nostalgia schedule." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");

    if (!tmdbId || !Number.isFinite(Number(tmdbId))) {
      return NextResponse.json(
        { error: "Missing or invalid `tmdbId`." },
        { status: 400 },
      );
    }

    const deleted = await prisma.calendarEntry.deleteMany({
      where: {
        sessionId: { in: userKeys },
        tmdbId: Number(tmdbId),
        mediaType: "tv",
      },
    });

    return NextResponse.json({ success: true, count: deleted.count });
  } catch (error) {
    console.error("[api/calendar/nostalgia DELETE] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel nostalgia campaign." },
      { status: 500 },
    );
  }
}
