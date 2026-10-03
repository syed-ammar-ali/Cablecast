import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import type { MediaType } from "@/types/media";
import type { WatchHistoryItem } from "@/types/watchHistory";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ history: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];

    // 1. Fetch personal broadcast schedule tmdbIds for this user to strictly exclude them
    const scheduledItems = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
      select: { tmdbId: true },
    });
    const scheduledTmdbIds = scheduledItems.map((s) => s.tmdbId);

    // 2. Fetch watch history, excluding broadcasted titles and completed entries
    const rawHistory = await prisma.userWatchHistory.findMany({
      where: {
        sessionId: { in: userKeys },
        completed: false,
        ...(scheduledTmdbIds.length > 0 ? { tmdbId: { notIn: scheduledTmdbIds } } : {}),
      },
      orderBy: { lastWatchedAt: "desc" },
      take: 30,
    });

    // 3. Deduplicate by (mediaType, tmdbId) so only the most recent episode of a show appears
    const seen = new Set<string>();
    const history: WatchHistoryItem[] = [];

    for (const item of rawHistory) {
      const key = `${item.mediaType}:${item.tmdbId}`;
      if (!seen.has(key)) {
        seen.add(key);
        history.push({
          id: item.id,
          sessionId: item.sessionId,
          tmdbId: item.tmdbId,
          mediaType: item.mediaType as MediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropUrl: item.backdropUrl,
          releaseYear: item.releaseYear,
          season: item.season,
          episode: item.episode,
          episodeTitle: item.episodeTitle,
          progressSeconds: item.progressSeconds,
          durationSeconds: item.durationSeconds,
          completed: item.completed,
          lastWatchedAt: item.lastWatchedAt.toISOString(),
        });
      }
    }

    return NextResponse.json(
      { history },
      {
        headers: {
          "Cache-Control": "private, no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[api/watch-history] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch watch history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const body = await request.json();

    if (!body.tmdbId || !body.mediaType || !body.title) {
      return NextResponse.json({ error: "Missing required watch history fields" }, { status: 400 });
    }

    const tmdbId = Number(body.tmdbId);
    if (isNaN(tmdbId)) {
      return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
    }

    // 1. Strict guard: if this title is scheduled on personal broadcast, do NOT track or keep watch history
    const isBroadcasted = await prisma.userPersonalSchedule.findFirst({
      where: { sessionId: { in: userKeys }, tmdbId },
      select: { id: true },
    });

    if (isBroadcasted) {
      // Clean up any stale records if they exist
      await prisma.userWatchHistory.deleteMany({
        where: { sessionId: { in: userKeys }, tmdbId },
      });
      return NextResponse.json({ success: true, skipped: "Title is on personal broadcast schedule" });
    }

    const mediaType = body.mediaType === "tv" ? "tv" : "movie";
    const season = mediaType === "tv" ? Math.max(1, Number(body.season) || 1) : 0;
    const episode = mediaType === "tv" ? Math.max(1, Number(body.episode) || 1) : 0;
    const progressSeconds = Math.max(0, Math.floor(Number(body.progressSeconds) || 0));
    const durationSeconds = body.durationSeconds ? Math.floor(Number(body.durationSeconds)) : null;
    const completed = Boolean(
      body.completed || (durationSeconds && progressSeconds >= durationSeconds * 0.92)
    );

    const record = await prisma.userWatchHistory.upsert({
      where: {
        sessionId_tmdbId_mediaType_season_episode: {
          sessionId: userId,
          tmdbId,
          mediaType,
          season,
          episode,
        },
      },
      create: {
        sessionId: userId,
        tmdbId,
        mediaType,
        title: body.title,
        posterPath: body.posterPath ?? null,
        backdropUrl: body.backdropUrl ?? null,
        releaseYear: body.releaseYear ? String(body.releaseYear) : null,
        season,
        episode,
        episodeTitle: body.episodeTitle ?? null,
        progressSeconds,
        durationSeconds,
        completed,
        lastWatchedAt: new Date(),
      },
      update: {
        title: body.title,
        ...(body.posterPath !== undefined ? { posterPath: body.posterPath } : {}),
        ...(body.backdropUrl !== undefined ? { backdropUrl: body.backdropUrl } : {}),
        ...(body.releaseYear !== undefined ? { releaseYear: String(body.releaseYear) } : {}),
        ...(body.episodeTitle !== undefined ? { episodeTitle: body.episodeTitle } : {}),
        progressSeconds,
        ...(durationSeconds !== null ? { durationSeconds } : {}),
        completed,
        lastWatchedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, item: record });
  } catch (error) {
    console.error("[api/watch-history] POST error:", error);
    return NextResponse.json({ error: "Failed to update watch history" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const tmdbId = searchParams.get("tmdbId");

    if (id) {
      await prisma.userWatchHistory.deleteMany({
        where: { id, sessionId: { in: userKeys } },
      });
      return NextResponse.json({ success: true, deletedId: id });
    }

    if (tmdbId) {
      const numTmdbId = Number(tmdbId);
      const deleted = await prisma.userWatchHistory.deleteMany({
        where: { tmdbId: numTmdbId, sessionId: { in: userKeys } },
      });
      return NextResponse.json({ success: true, count: deleted.count });
    }

    return NextResponse.json({ error: "Provide id or tmdbId to delete" }, { status: 400 });
  } catch (error) {
    console.error("[api/watch-history] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete watch history" }, { status: 500 });
  }
}
