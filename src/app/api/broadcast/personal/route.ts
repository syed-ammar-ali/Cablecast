import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { DAYS_OF_WEEK, formatBlockTime } from "@/types/broadcast";
import type { CreatePersonalScheduleInput, PersonalScheduleItem } from "@/types/broadcast";
import type { MediaType } from "@/types/media";
import { checkMediaOwnership, getBroadcastSlotStatus } from "@/lib/mediaOwnership";

/**
 * Calculates whether an appointment is live at the current second and its elapsed offset.
 */
function computeLiveState(
  dayOfWeek: number,
  blockStartMinutes: number,
  blockCount: number,
  now: Date = new Date(),
) {
  const currentDay = now.getDay();
  if (currentDay !== dayOfWeek) {
    return { isLiveNow: false, liveOffsetSeconds: null };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const blockEndMinutes = blockStartMinutes + blockCount * BLOCK_MINUTES;

  if (currentMinutes >= blockStartMinutes && currentMinutes < blockEndMinutes) {
    const elapsedMinutes = currentMinutes - blockStartMinutes;
    const elapsedSeconds = elapsedMinutes * 60 + now.getSeconds();
    return { isLiveNow: true, liveOffsetSeconds: elapsedSeconds };
  }

  return { isLiveNow: false, liveOffsetSeconds: null };
}

function getNextAirDate(dayOfWeek: number, blockStartMinutes: number, now: Date): Date {
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let daysUntil = (dayOfWeek - currentDay + 7) % 7;
  if (daysUntil === 0 && currentMinutes > blockStartMinutes) {
    daysUntil = 7;
  }

  const airDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil);
  airDate.setHours(Math.floor(blockStartMinutes / 60), blockStartMinutes % 60, 0, 0);
  return airDate;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({
        schedule: [],
        missed: [],
        seasonAlerts: [],
        channelName: "My Lineup",
        liveNow: null,
      });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const now = new Date();
    const todayDayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayIsoDate = now.toISOString().slice(0, 10);

    // Fetch user channel settings (prefer persistent userId, fallback to any session key)
    let channelSettings = await prisma.userChannelSettings.findFirst({
      where: { sessionId: { in: userKeys } },
    });
    if (!channelSettings) {
      channelSettings = await prisma.userChannelSettings.create({
        data: { sessionId: userId, channelName: "My Lineup" },
      });
    }

    const items = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
      orderBy: [{ dayOfWeek: "asc" }, { blockStartMinutes: "asc" }],
    });

    // Check for past broadcast slots that aired today and completed
    for (const item of items) {
      const blockEndMinutes = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
      const isPastToday = item.dayOfWeek === todayDayOfWeek && currentMinutes >= blockEndMinutes;

      if (isPastToday && item.lastAiredDate !== todayIsoDate) {
        if (item.isRerun) {
          // One-off rerun has completed its airing window!
          // Remove it from the schedule so it doesn't repeat weekly.
          await prisma.userPersonalSchedule.delete({
            where: { id: item.id },
          }).catch(() => {});
          continue;
        }

        if (!item.wasWatched) {
          // Record as missed broadcast if not already recorded
          const existingMissed = await prisma.userMissedBroadcast.findFirst({
            where: {
              sessionId: { in: userKeys },
              scheduleId: item.id,
              originalAirDate: todayIsoDate,
            },
          });

          if (!existingMissed) {
            await prisma.userMissedBroadcast.create({
              data: {
                sessionId: userId,
                scheduleId: item.id,
                tmdbId: item.tmdbId,
                mediaType: item.mediaType,
                title: item.title,
                posterPath: item.posterPath,
                backdropUrl: item.backdropUrl,
                runtimeMinutes: item.runtimeMinutes,
                blockCount: item.blockCount,
                season: item.mediaType === "tv" ? item.currentSeason : null,
                episode: item.mediaType === "tv" ? item.currentEpisode : null,
                episodeTitle: null,
                originalAirDate: todayIsoDate,
                originalAirTime: formatBlockTime(item.blockStartMinutes),
              },
            });
          }
        }

        // TV episodic progression & Season completion check
        if (item.mediaType === "tv") {
          const nextEpisode = item.currentEpisode + 1;
          const totalSeasonEpisodes = item.totalEpisodes ?? 24;

          if (nextEpisode > totalSeasonEpisodes) {
            // Season completed! Create alert and drop show from schedule
            await prisma.userSeasonCompletedAlert.create({
              data: {
                sessionId: userId,
                tmdbId: item.tmdbId,
                title: item.title,
                posterPath: item.posterPath,
                backdropUrl: item.backdropUrl,
                completedSeason: item.currentSeason,
                nextSeason: item.currentSeason + 1,
              },
            });

            await prisma.userPersonalSchedule.deleteMany({
              where: { sessionId: { in: userKeys }, tmdbId: item.tmdbId },
            });
          } else {
            // Advance to next episode
            await prisma.userPersonalSchedule.updateMany({
              where: { sessionId: { in: userKeys }, tmdbId: item.tmdbId },
              data: {
                currentEpisode: nextEpisode,
                lastAiredDate: todayIsoDate,
                lastAiredSeason: item.currentSeason,
                lastAiredEpisode: item.currentEpisode,
                wasWatched: false,
              },
            });
          }
        } else {
          // Movie broadcast completed
          await prisma.userPersonalSchedule.update({
            where: { id: item.id },
            data: {
              lastAiredDate: todayIsoDate,
              wasWatched: false,
            },
          });
        }
      }
    }

    // Refresh items to return the updated schedule after progression
    const updatedItems = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
      orderBy: [{ dayOfWeek: "asc" }, { blockStartMinutes: "asc" }],
    });

    // Dynamically evaluate slot status for all schedule items
    const schedule: PersonalScheduleItem[] = await Promise.all(
      updatedItems.map(async (item) => {
        const liveState = computeLiveState(item.dayOfWeek, item.blockStartMinutes, item.blockCount, now);
        const dayName = DAYS_OF_WEEK.find((d) => d.day === item.dayOfWeek)?.name ?? `Day ${item.dayOfWeek}`;
        const targetAirDate = getNextAirDate(item.dayOfWeek, item.blockStartMinutes, now);

        const slotStatus = await getBroadcastSlotStatus(
          userId,
          item.tmdbId,
          item.mediaType === "tv" ? item.currentSeason : 0,
          targetAirDate
        );

        const isExpired = slotStatus === "RETURNED_EXPIRED";
        const isRerun = Boolean(item.isRerun || item.title.includes("(Rerun)"));

        return {
          id: item.id,
          sessionId: item.sessionId,
          tmdbId: item.tmdbId,
          mediaType: item.mediaType as MediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropUrl: item.backdropUrl,
          runtimeMinutes: item.runtimeMinutes,
          dayOfWeek: item.dayOfWeek,
          dayName,
          blockStartMinutes: item.blockStartMinutes,
          blockCount: item.blockCount,
          timeLabel: formatBlockTime(item.blockStartMinutes),
          currentSeason: item.currentSeason,
          currentEpisode: item.currentEpisode,
          totalEpisodes: item.totalEpisodes,
          lastAiredDate: item.lastAiredDate,
          lastAiredSeason: item.lastAiredSeason,
          lastAiredEpisode: item.lastAiredEpisode,
          wasWatched: item.wasWatched,
          isRerun,
          isLiveNow: liveState.isLiveNow && !isExpired,
          liveOffsetSeconds: isExpired ? null : liveState.liveOffsetSeconds,
          slotStatus,
          isExpired,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        };
      })
    );

    // Fetch unresolved missed broadcasts
    const missed = await prisma.userMissedBroadcast.findMany({
      where: { sessionId: { in: userKeys }, isResolved: false },
      orderBy: { createdAt: "desc" },
    });

    // Fetch season completed alerts
    const seasonAlerts = await prisma.userSeasonCompletedAlert.findMany({
      where: { sessionId: { in: userKeys }, isDismissed: false },
      orderBy: { createdAt: "desc" },
    });

    const liveNow = schedule.find((item) => item.isLiveNow) ?? null;

    return NextResponse.json({
      schedule,
      missed: missed.map((m) => ({
        ...m,
        mediaType: m.mediaType as MediaType,
        runtimeMinutes: m.runtimeMinutes,
        blockCount: m.blockCount,
        createdAt: m.createdAt.toISOString(),
      })),
      seasonAlerts: seasonAlerts.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      channelName: channelSettings.channelName,
      liveNow,
    });
  } catch (error) {
    console.error("[api/broadcast/personal] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch personal schedule." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }
    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const body = await request.json();

    // Handle channel name update action
    if (body.action === "updateChannelName" && typeof body.channelName === "string") {
      const trimmed = body.channelName.trim() || "My Lineup";
      const updated = await prisma.userChannelSettings.upsert({
        where: { sessionId: userId },
        create: { sessionId: userId, channelName: trimmed },
        update: { channelName: trimmed },
      });
      return NextResponse.json({ success: true, channelName: updated.channelName });
    }

    // Handle dismissing season completed alert
    if (body.action === "dismissSeasonAlert" && body.alertId) {
      await prisma.userSeasonCompletedAlert.updateMany({
        where: { id: body.alertId, sessionId: { in: userKeys } },
        data: { isDismissed: true },
      });
      return NextResponse.json({ success: true });
    }

    const input = body as CreatePersonalScheduleInput;

    if (!input.tmdbId || !input.title || !input.mediaType) {
      return NextResponse.json({ error: "Missing required media details." }, { status: 400 });
    }

    if (!Array.isArray(input.daysOfWeek) || input.daysOfWeek.length === 0) {
      return NextResponse.json({ error: "At least one day of the week is required." }, { status: 400 });
    }

    if (typeof input.blockStartMinutes !== "number" || input.blockStartMinutes % BLOCK_MINUTES !== 0) {
      return NextResponse.json(
        { error: "Start time must be aligned to a 30-minute block." },
        { status: 400 },
      );
    }

    const now = new Date();

    // ── VHS POSSESSION & RENTAL GUARDRAIL VALIDATION ────────────────────────────
    const seasonNumber = input.mediaType === "tv" ? (input.startSeason ?? 1) : 0;
    const ownership = await checkMediaOwnership(userId, input.tmdbId, seasonNumber, now);

    if (ownership.isRented && ownership.expiresAt) {
      const runtimeMinutes = input.runtimeMinutes ?? (input.mediaType === "movie" ? 120 : 30);

      for (const day of input.daysOfWeek) {
        const airDate = getNextAirDate(day, input.blockStartMinutes, now);
        const broadcastEndTime = new Date(airDate.getTime() + runtimeMinutes * 60 * 1000);

        if (broadcastEndTime.getTime() > ownership.expiresAt.getTime()) {
          const formattedAirDate = airDate.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const formattedExpires = ownership.expiresAt.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return NextResponse.json(
            {
              error: `Rental duration guardrail: This VHS tape rental expires on ${formattedExpires}, which is before the scheduled air time (${formattedAirDate}). Extend your rental or buy the tape to program this slot.`,
              needsRentalExtension: true,
              expiresAt: ownership.expiresAt.toISOString(),
              mediaId: input.tmdbId,
              mediaType: input.mediaType,
              seasonNumber,
            },
            { status: 400 },
          );
        }
      }
    }

    // Calculate block count from runtime: Movies (e.g. 105 mins = 4 blocks = 120 mins)
    const blockCount = input.runtimeMinutes && input.runtimeMinutes > 0
      ? Math.max(1, Math.ceil(input.runtimeMinutes / BLOCK_MINUTES))
      : input.mediaType === "movie" ? 4 : 1;

    const requestedEnd = input.blockStartMinutes + blockCount * BLOCK_MINUTES;

    // Fetch existing schedule for this user to validate conflicts and duplicates
    const existing = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
    });

    // Prevent duplicate scheduling of the same title/season
    const targetSeason = input.mediaType === "tv" ? (input.startSeason ?? 1) : 1;
    const duplicate = existing.find(
      (item) =>
        item.tmdbId === input.tmdbId &&
        (input.mediaType !== "tv" || item.currentSeason === targetSeason),
    );
    if (duplicate) {
      return NextResponse.json(
        {
          error: `"${input.title}"${input.mediaType === "tv" ? ` (Season ${targetSeason})` : ""} is already scheduled on your broadcast lineup. Open Broadcast Studio to manage or reschedule it.`,
        },
        { status: 400 },
      );
    }

    // Conflict validation
    for (const day of input.daysOfWeek) {
      const dayMatches = existing.filter((item) => item.dayOfWeek === day);

      for (const item of dayMatches) {
        const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
        const overlaps =
          input.blockStartMinutes < itemEnd && requestedEnd > item.blockStartMinutes;

        if (overlaps) {
          const dayName = DAYS_OF_WEEK.find((d) => d.day === day)?.name ?? `Day ${day}`;
          const itemTime = formatBlockTime(item.blockStartMinutes);
          return NextResponse.json(
            {
              error: `Slot conflict on ${dayName} at ${itemTime}: Already occupied by "${item.title}". You cannot schedule two broadcasts at the same time.`,
              conflictWith: item.title,
              conflictDay: day,
            },
            { status: 409 },
          );
        }
      }
    }

    // Create appointments for each selected day with persistent userId
    const created = [];
    for (const day of input.daysOfWeek) {
      const item = await prisma.userPersonalSchedule.create({
        data: {
          sessionId: userId,
          tmdbId: input.tmdbId,
          mediaType: input.mediaType,
          title: input.title,
          posterPath: input.posterPath ?? null,
          backdropUrl: input.backdropUrl ?? null,
          runtimeMinutes: input.runtimeMinutes ?? (input.mediaType === "movie" ? 120 : 30),
          dayOfWeek: day,
          blockStartMinutes: input.blockStartMinutes,
          blockCount,
          currentSeason: input.startSeason ?? 1,
          currentEpisode: input.startEpisode ?? 1,
          totalEpisodes: input.totalEpisodes ?? (input.mediaType === "tv" ? 24 : null),
        },
      });
      created.push(item);
    }

    return NextResponse.json({ success: true, createdCount: created.length, created });
  } catch (error) {
    console.error("[api/broadcast/personal] POST error:", error);
    return NextResponse.json({ error: "Failed to schedule broadcast." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }
    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const tmdbId = searchParams.get("tmdbId");

    if (id) {
      await prisma.userPersonalSchedule.deleteMany({
        where: { id, sessionId: { in: userKeys } },
      });
      return NextResponse.json({ success: true, deletedId: id });
    }

    if (tmdbId) {
      const numTmdbId = Number(tmdbId);
      const deleted = await prisma.userPersonalSchedule.deleteMany({
        where: { tmdbId: numTmdbId, sessionId: { in: userKeys } },
      });
      return NextResponse.json({ success: true, count: deleted.count });
    }

    return NextResponse.json({ error: "Provide id or tmdbId to delete." }, { status: 400 });
  } catch (error) {
    console.error("[api/broadcast/personal] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete schedule appointment." }, { status: 500 });
  }
}
