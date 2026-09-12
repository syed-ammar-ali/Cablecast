import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { BLOCK_MINUTES, normalizeRuntime } from "@/lib/runtime";
import { formatBlockTime } from "@/types/broadcast";
import { getShowDetails, getMovieDetails } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ entries: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const whereClause: any = {
      sessionId: { in: userKeys },
    };

    if (startDate && endDate) {
      whereClause.scheduledDate = { gte: startDate, lte: endDate };
    } else if (startDate) {
      whereClause.scheduledDate = { gte: startDate };
    }

    const entries = await prisma.calendarEntry.findMany({
      where: whereClause,
      orderBy: [{ scheduledDate: "asc" }, { blockStartMinutes: "asc" }],
    });

    // Also fetch regular weekly schedule to detect conflicts and broadcast overrides
    const weeklySchedule = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
    });

    const enrichedEntries = entries.map((entry) => {
      const [year, month, day] = entry.scheduledDate.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();

      const entryEnd = entry.blockStartMinutes + entry.blockCount * BLOCK_MINUTES;

      // Find any overlapping weekly appointment on that day
      const conflict = weeklySchedule.find((app) => {
        if (app.dayOfWeek !== dayOfWeek) return false;
        const appEnd = app.blockStartMinutes + app.blockCount * BLOCK_MINUTES;
        return entry.blockStartMinutes < appEnd && entryEnd > app.blockStartMinutes;
      });

      return {
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        conflictWarning: conflict
          ? `Overrides weekly broadcast "${conflict.title}" at ${formatBlockTime(conflict.blockStartMinutes)}`
          : null,
      };
    });

    return NextResponse.json({ entries: enrichedEntries });
  } catch (error) {
    console.error("[api/calendar GET] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar appointments." },
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
      tmdbId,
      mediaType,
      title,
      posterPath,
      backdropUrl,
      runtimeMinutes,
      scheduledDate,
      blockStartMinutes,
      startSeason,
      startEpisode,
    } = body;

    if (!tmdbId || !title || !scheduledDate || blockStartMinutes === undefined) {
      return NextResponse.json(
        { error: "Missing required calendar schedule fields." },
        { status: 400 },
      );
    }

    // Calculate block count from runtime dynamically
    let resolvedRuntime = runtimeMinutes ? Number(runtimeMinutes) : null;
    if (!resolvedRuntime || resolvedRuntime <= 0) {
      try {
        if (mediaType === "movie") {
          const movie = await getMovieDetails(Number(tmdbId));
          resolvedRuntime = movie?.defaultRuntime?.exactMinutes && movie.defaultRuntime.exactMinutes > 0 ? movie.defaultRuntime.exactMinutes : 105;
        } else {
          const show = await getShowDetails(Number(tmdbId));
          resolvedRuntime = show?.defaultRuntime?.exactMinutes && show.defaultRuntime.exactMinutes > 0 ? show.defaultRuntime.exactMinutes : 25;
        }
      } catch {
        resolvedRuntime = mediaType === "movie" ? 105 : 25;
      }
    }
    const normRuntime = resolvedRuntime ? normalizeRuntime(resolvedRuntime) : null;
    const blockCount = normRuntime ? normRuntime.blockCount : 1;
    const entryEnd = blockStartMinutes + blockCount * BLOCK_MINUTES;

    // Detect if this overrides any weekly broadcast slot
    const [year, month, day] = scheduledDate.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    const weeklySchedule = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
    });

    const conflictingAppointment = weeklySchedule.find((app) => {
      if (app.dayOfWeek !== dayOfWeek) return false;
      const appEnd = app.blockStartMinutes + app.blockCount * BLOCK_MINUTES;
      return blockStartMinutes < appEnd && entryEnd > app.blockStartMinutes;
    });

    // If there is an overridden broadcast and the calendar entry is for today or upcoming,
    // ensure the overridden broadcast goes to Missed & Reruns queue
    let conflictWarning: string | null = null;
    if (conflictingAppointment) {
      conflictWarning = `Overrides weekly broadcast "${conflictingAppointment.title}" at ${formatBlockTime(
        conflictingAppointment.blockStartMinutes,
      )}`;

      // Automatically add the overridden weekly broadcast into the Missed & Reruns queue
      const existingMissed = await prisma.userMissedBroadcast.findFirst({
        where: {
          sessionId: { in: userKeys },
          scheduleId: conflictingAppointment.id,
          originalAirDate: scheduledDate,
        },
      });

      if (!existingMissed) {
        await prisma.userMissedBroadcast.create({
          data: {
            sessionId: userId,
            scheduleId: conflictingAppointment.id,
            tmdbId: conflictingAppointment.tmdbId,
            mediaType: conflictingAppointment.mediaType,
            title: conflictingAppointment.title,
            posterPath: conflictingAppointment.posterPath,
            backdropUrl: conflictingAppointment.backdropUrl,
            runtimeMinutes: conflictingAppointment.runtimeMinutes,
            blockCount: conflictingAppointment.blockCount,
            season: conflictingAppointment.mediaType === "tv" ? conflictingAppointment.currentSeason : null,
            episode: conflictingAppointment.mediaType === "tv" ? conflictingAppointment.currentEpisode : null,
            episodeTitle: null,
            originalAirDate: scheduledDate,
            originalAirTime: formatBlockTime(conflictingAppointment.blockStartMinutes),
          },
        });
      }
    }

    // Create the CalendarEntry
    const newEntry = await prisma.calendarEntry.create({
      data: {
        sessionId: userId,
        tmdbId: Number(tmdbId),
        mediaType: mediaType || "movie",
        title,
        posterPath: posterPath || null,
        backdropUrl: backdropUrl || null,
        runtimeMinutes: resolvedRuntime ? Number(resolvedRuntime) : null,
        scheduledDate,
        blockStartMinutes: Number(blockStartMinutes),
        blockCount,
        startSeason: startSeason ? Number(startSeason) : null,
        startEpisode: startEpisode ? Number(startEpisode) : null,
      },
    });

    return NextResponse.json({
      entry: {
        ...newEntry,
        createdAt: newEntry.createdAt.toISOString(),
        updatedAt: newEntry.updatedAt.toISOString(),
        conflictWarning,
      },
      conflictWarning,
    });
  } catch (error) {
    console.error("[api/calendar POST] error:", error);
    return NextResponse.json(
      { error: "Failed to schedule calendar appointment." },
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
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing required id parameter." }, { status: 400 });
    }

    await prisma.calendarEntry.deleteMany({
      where: {
        id,
        sessionId: { in: userKeys },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/calendar DELETE] error:", error);
    return NextResponse.json(
      { error: "Failed to delete calendar appointment." },
      { status: 500 },
    );
  }
}
