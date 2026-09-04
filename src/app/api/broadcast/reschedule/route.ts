import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { DAYS_OF_WEEK, formatBlockTimeRange } from "@/types/broadcast";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }
    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const body = (await request.json()) as {
      missedId: string;
      action: "reschedule" | "dismiss" | "skip";
      mode?: "move" | "one_off";
      targetDayOfWeek?: number;
      targetBlockStartMinutes?: number;
    };

    if (!body.missedId) {
      return NextResponse.json({ error: "missedId is required." }, { status: 400 });
    }

    const missedItem = await prisma.userMissedBroadcast.findFirst({
      where: { id: body.missedId, sessionId: { in: userKeys } },
    });

    if (!missedItem) {
      return NextResponse.json({ error: "Missed broadcast not found." }, { status: 404 });
    }

    if (body.action === "dismiss" || body.action === "skip") {
      await prisma.userMissedBroadcast.update({
        where: { id: missedItem.id },
        data: { isResolved: true },
      });

      return NextResponse.json({ success: true, action: body.action });
    }

    if (body.action === "reschedule") {
      if (
        typeof body.targetDayOfWeek !== "number" ||
        typeof body.targetBlockStartMinutes !== "number"
      ) {
        return NextResponse.json(
          { error: "targetDayOfWeek and targetBlockStartMinutes are required to reschedule." },
          { status: 400 },
        );
      }

      const day = body.targetDayOfWeek;
      const startMin = body.targetBlockStartMinutes;
      const mode = body.mode ?? "move";

      // 1. Retrieve original schedule if available
      let originalSchedule = missedItem.scheduleId
        ? await prisma.userPersonalSchedule.findFirst({
            where: { id: missedItem.scheduleId, sessionId: { in: userKeys } },
          })
        : null;

      if (!originalSchedule) {
        originalSchedule = await prisma.userPersonalSchedule.findFirst({
          where: { sessionId: { in: userKeys }, tmdbId: missedItem.tmdbId, isRerun: false },
        });
      }

      // 2. Accurately determine runtime and blockCount (e.g. 120m / 4 blocks for movies)
      const runtimeMinutes =
        missedItem.runtimeMinutes ??
        originalSchedule?.runtimeMinutes ??
        (missedItem.mediaType === "movie" ? 120 : 30);

      const blockCount =
        missedItem.blockCount && missedItem.blockCount > 0
          ? missedItem.blockCount
          : originalSchedule?.blockCount && originalSchedule.blockCount > 0
            ? originalSchedule.blockCount
            : Math.max(1, Math.ceil(runtimeMinutes / BLOCK_MINUTES));

      const requestedEnd = startMin + blockCount * BLOCK_MINUTES;

      // 3. Slot conflict verification covering the FULL duration
      const existing = await prisma.userPersonalSchedule.findMany({
        where: { sessionId: { in: userKeys }, dayOfWeek: day },
      });

      for (const item of existing) {
        // If moving the existing schedule, it does not conflict with its old self
        if (mode === "move" && originalSchedule && item.id === originalSchedule.id) {
          continue;
        }

        const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
        const overlaps = startMin < itemEnd && requestedEnd > item.blockStartMinutes;

        if (overlaps) {
          const dayName = DAYS_OF_WEEK.find((d) => d.day === day)?.name ?? `Day ${day}`;
          const itemTime = formatBlockTimeRange(item.blockStartMinutes, item.blockCount);
          return NextResponse.json(
            {
              error: `Slot conflict on ${dayName} (${itemTime}): Already occupied by "${item.title}". Choose an open slot.`,
            },
            { status: 409 },
          );
        }
      }

      // Clean title without redundant "(Rerun)" tags
      const cleanTitle = missedItem.title.replace(/\s*\(Rerun\)\s*$/i, "").trim();

      if (mode === "move") {
        // Move weekly broadcast: Update the existing slot, rewind sequence, NO duplicates in lineup!
        if (originalSchedule) {
          await prisma.userPersonalSchedule.update({
            where: { id: originalSchedule.id },
            data: {
              title: cleanTitle,
              dayOfWeek: day,
              blockStartMinutes: startMin,
              blockCount,
              runtimeMinutes,
              currentSeason: missedItem.season ?? originalSchedule.currentSeason,
              currentEpisode: missedItem.episode ?? originalSchedule.currentEpisode,
              lastAiredDate: null,
              wasWatched: false,
              isRerun: false,
            },
          });
        } else {
          await prisma.userPersonalSchedule.create({
            data: {
              sessionId: userId,
              tmdbId: missedItem.tmdbId,
              mediaType: missedItem.mediaType,
              title: cleanTitle,
              posterPath: missedItem.posterPath,
              backdropUrl: missedItem.backdropUrl,
              runtimeMinutes,
              dayOfWeek: day,
              blockStartMinutes: startMin,
              blockCount,
              currentSeason: missedItem.season ?? 1,
              currentEpisode: missedItem.episode ?? 1,
              isRerun: false,
            },
          });
        }
      } else {
        // One-off encore rerun: Scheduled as dedicated rerun slot that auto-retires once aired
        await prisma.userPersonalSchedule.create({
          data: {
            sessionId: userId,
            tmdbId: missedItem.tmdbId,
            mediaType: missedItem.mediaType,
            title: cleanTitle,
            posterPath: missedItem.posterPath,
            backdropUrl: missedItem.backdropUrl,
            runtimeMinutes,
            dayOfWeek: day,
            blockStartMinutes: startMin,
            blockCount,
            currentSeason: missedItem.season ?? 1,
            currentEpisode: missedItem.episode ?? 1,
            isRerun: true,
          },
        });
      }

      // Mark missed broadcast resolved
      await prisma.userMissedBroadcast.update({
        where: { id: missedItem.id },
        data: { isResolved: true },
      });

      return NextResponse.json({ success: true, action: "rescheduled", mode });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("[api/broadcast/reschedule] POST error:", error);
    return NextResponse.json({ error: "Failed to process missed broadcast action." }, { status: 500 });
  }
}
