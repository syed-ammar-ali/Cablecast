import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

export async function GET() {
  try {
    const session = await getSession();
    // Proxy gates this route so a missing session is theoretically impossible,
    // but we guard explicitly so a session ID can never collapse to "anonymous".
    if (!session) {
      return NextResponse.json({ history: [], continueWatching: [], completed: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];

    const history = await prisma.userWatchHistory.findMany({
      where: { sessionId: { in: userKeys } },
      orderBy: { lastWatchedAt: "desc" },
    });

    const continueWatching = history.filter(
      (item) => !item.completed && item.progressSeconds > 20,
    );
    const completed = history.filter((item) => item.completed);

    return NextResponse.json({
      history,
      continueWatching,
      completed,
    });
  } catch (error) {
    console.error("[api/library/history] GET error:", error);
    return NextResponse.json({ history: [], continueWatching: [], completed: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const body = await req.json();

    const {
      tmdbId,
      mediaType,
      title,
      posterPath,
      backdropUrl,
      releaseYear,
      season,
      episode,
      episodeTitle,
      progressSeconds = 0,
      durationSeconds = null,
      completed = false,
    } = body;

    if (!tmdbId || !mediaType || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedTmdbId = Number(tmdbId);
    const parsedSeason = season != null ? Number(season) : 0;
    const parsedEpisode = episode != null ? Number(episode) : 0;

    // Auto-mark completed if progress is >= 80% of total duration
    const isCompleted =
      completed ||
      (durationSeconds && durationSeconds > 0 && progressSeconds / durationSeconds >= 0.8) ||
      false;

    const entry = await prisma.userWatchHistory.upsert({
      where: {
        sessionId_tmdbId_mediaType_season_episode: {
          sessionId: userId,
          tmdbId: parsedTmdbId,
          mediaType,
          season: parsedSeason,
          episode: parsedEpisode,
        },
      },
      update: {
        title,
        posterPath: posterPath ?? null,
        backdropUrl: backdropUrl ?? null,
        releaseYear: releaseYear ?? null,
        episodeTitle: episodeTitle ?? null,
        progressSeconds: Math.floor(progressSeconds),
        durationSeconds: durationSeconds ? Math.floor(durationSeconds) : null,
        completed: Boolean(isCompleted),
        lastWatchedAt: new Date(),
      },
      create: {
        sessionId: userId,
        tmdbId: parsedTmdbId,
        mediaType,
        title,
        posterPath: posterPath ?? null,
        backdropUrl: backdropUrl ?? null,
        releaseYear: releaseYear ?? null,
        season: parsedSeason,
        episode: parsedEpisode,
        episodeTitle: episodeTitle ?? null,
        progressSeconds: Math.floor(progressSeconds),
        durationSeconds: durationSeconds ? Math.floor(durationSeconds) : null,
        completed: Boolean(isCompleted),
        lastWatchedAt: new Date(),
      },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[api/library/history] POST error:", error);
    return NextResponse.json({ error: "Failed to save watch history" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get("tmdbId");
    const mediaType = searchParams.get("mediaType");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");
    const clearAll = searchParams.get("all") === "true";

    if (clearAll) {
      await prisma.userWatchHistory.deleteMany({
        where: { sessionId: { in: userKeys } },
      });
      return NextResponse.json({ ok: true });
    }

    if (!tmdbId || !mediaType) {
      return NextResponse.json({ error: "Missing tmdbId or mediaType" }, { status: 400 });
    }

    const parsedTmdbId = Number(tmdbId);
    const where: Record<string, unknown> = {
      sessionId: { in: userKeys },
      tmdbId: parsedTmdbId,
      mediaType,
    };
    if (season !== null && season !== undefined) where.season = Number(season);
    if (episode !== null && episode !== undefined) where.episode = Number(episode);

    await prisma.userWatchHistory.deleteMany({ where });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/library/history] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete watch history" }, { status: 500 });
  }
}
