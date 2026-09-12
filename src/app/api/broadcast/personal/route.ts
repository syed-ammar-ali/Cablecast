import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { DAYS_OF_WEEK, formatBlockTime } from "@/types/broadcast";
import type { CreatePersonalScheduleInput, PersonalScheduleItem } from "@/types/broadcast";
import type { MediaType } from "@/types/media";
import { checkMediaOwnership, getBroadcastSlotStatus } from "@/lib/mediaOwnership";
import { getShowDetails, getMovieDetails } from "@/lib/tmdb";

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

function findNextOpenSlotForDay(
  dayMatches: { blockStartMinutes: number; blockCount: number }[],
  blockCount: number,
  preferredStart: number,
): number | null {
  const blockDuration = blockCount * BLOCK_MINUTES;
  // First search from preferredStart forward up to end of day
  for (let m = preferredStart; m <= 1440 - blockDuration; m += BLOCK_MINUTES) {
    const end = m + blockDuration;
    const hasOverlap = dayMatches.some((item) => {
      const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
      return m < itemEnd && end > item.blockStartMinutes;
    });
    if (!hasOverlap) return m;
  }
  // Wrap around from beginning of day
  for (let m = 0; m < preferredStart; m += BLOCK_MINUTES) {
    if (m + blockDuration > 1440) break;
    const end = m + blockDuration;
    const hasOverlap = dayMatches.some((item) => {
      const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
      return m < itemEnd && end > item.blockStartMinutes;
    });
    if (!hasOverlap) return m;
  }
  return null;
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
        subscribedChannels: [],
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
          await prisma.userPersonalSchedule.deleteMany({
            where: { id: item.id },
          }).catch(() => {});
          continue;
        }

        // Atomic lock: Only the first concurrent worker to mark lastAiredDate proceeds with advancing & alerts
        const lockUpdate = await prisma.userPersonalSchedule.updateMany({
          where: { id: item.id, NOT: { lastAiredDate: todayIsoDate } },
          data: { lastAiredDate: todayIsoDate },
        });

        if (lockUpdate.count === 0) {
          // Concurrently already claimed and processed by another request
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
          // Count total non-rerun weekly broadcast slots for this TV show
          const showWeeklySlots = items.filter((it) => it.tmdbId === item.tmdbId && !it.isRerun);
          const weeklyIncrement = Math.max(1, showWeeklySlots.length);
          const nextEpisode = item.currentEpisode + weeklyIncrement;
          const totalSeasonEpisodes = item.totalEpisodes ?? 12;

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
            // Advance this specific slot to its next weekly episode occurrence
            await prisma.userPersonalSchedule.update({
              where: { id: item.id },
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

    // Self-healing check for items with missing/inaccurate runtime or blockCount (e.g. corrupted by old finale runtimes)
    // or placeholder totalEpisodes (e.g. default 24).
    const itemsNeedingSync = updatedItems.filter((it) => {
      if (it.mediaType !== "tv") return false;
      // Total episode placeholder check
      if (it.totalEpisodes === 24 || !it.totalEpisodes) return true;
      // Inaccurate block count check: e.g. 48m runtime on a sitcom that should be 1 block
      if (it.runtimeMinutes && it.runtimeMinutes > 30 && it.blockCount > 1) return true;
      return false;
    });

    if (itemsNeedingSync.length > 0) {
      const uniqueTmdbIds = Array.from(new Set(itemsNeedingSync.map((it) => it.tmdbId)));
      await Promise.allSettled(
        uniqueTmdbIds.map(async (tmdbId) => {
          try {
            const details = await getShowDetails(tmdbId);
            const epRuntime = details.defaultRuntime?.exactMinutes || 25;
            const newBlockCount = details.defaultRuntime?.blockCount ?? Math.max(1, Math.ceil(epRuntime / BLOCK_MINUTES));
            const relevantItems = itemsNeedingSync.filter((it) => it.tmdbId === tmdbId);

            for (const relItem of relevantItems) {
              const sMatch = details.seasons?.find((s) => s.seasonNumber === relItem.currentSeason);
              const realTotalEpisodes = sMatch?.episodeCount || details.numberOfEpisodes || relItem.totalEpisodes;

              if (
                relItem.runtimeMinutes !== epRuntime ||
                relItem.blockCount !== newBlockCount ||
                relItem.totalEpisodes !== realTotalEpisodes
              ) {
                await prisma.userPersonalSchedule.update({
                  where: { id: relItem.id },
                  data: {
                    totalEpisodes: realTotalEpisodes,
                    runtimeMinutes: epRuntime,
                    blockCount: newBlockCount,
                  },
                });
                relItem.totalEpisodes = realTotalEpisodes;
                relItem.runtimeMinutes = epRuntime;
                relItem.blockCount = newBlockCount;
              }
            }
          } catch (err) {
            console.debug?.("[api/broadcast/personal] Self-healing skipped for show:", tmdbId, err);
          }
        }),
      );
    }

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

    // Fetch any date-specific calendar entries scheduled for today
    const calendarEntries = await prisma.calendarEntry.findMany({
      where: {
        sessionId: { in: userKeys },
        scheduledDate: todayIsoDate,
      },
    });

    const calendarItems: PersonalScheduleItem[] = calendarEntries.map((c) => {
      const liveState = computeLiveState(todayDayOfWeek, c.blockStartMinutes, c.blockCount, now);
      return {
        id: `cal-${c.id}`,
        sessionId: c.sessionId,
        tmdbId: c.tmdbId,
        mediaType: c.mediaType as MediaType,
        title: `${c.title} (Special Screening)`,
        posterPath: c.posterPath,
        backdropUrl: c.backdropUrl,
        runtimeMinutes: c.runtimeMinutes,
        dayOfWeek: todayDayOfWeek,
        dayName: DAYS_OF_WEEK.find((d) => d.day === todayDayOfWeek)?.name || "Today",
        blockStartMinutes: c.blockStartMinutes,
        blockCount: c.blockCount,
        timeLabel: formatBlockTime(c.blockStartMinutes),
        currentSeason: c.startSeason ?? 1,
        currentEpisode: c.startEpisode ?? 1,
        totalEpisodes: 1,
        wasWatched: false,
        isRerun: false,
        isLiveNow: liveState.isLiveNow,
        liveOffsetSeconds: liveState.liveOffsetSeconds,
        slotStatus: undefined,
        createdAt: c.createdAt.toISOString(),
        updatedAt: (c.updatedAt ?? c.createdAt).toISOString(),
      };
    });

    // Fetch subscribed channels
    const subscribedChannelsData = await prisma.subscribedChannel.findMany({
      where: { subscriberSessionId: { in: userKeys } },
      orderBy: { createdAt: "asc" },
    });

    interface SnapshotScheduleItem {
      tmdbId: number;
      mediaType: string;
      title: string;
      posterPath?: string | null;
      backdropUrl?: string | null;
      runtimeMinutes?: number | null;
      dayOfWeek: number;
      blockStartMinutes: number;
      blockCount?: number;
      currentSeason?: number;
      currentEpisode?: number;
      totalEpisodes?: number | null;
    }

    const subscribedChannels = subscribedChannelsData.map((subChan) => {
      let rawItems: SnapshotScheduleItem[] = [];
      if (Array.isArray(subChan.scheduleSnapshot)) {
        rawItems = subChan.scheduleSnapshot as unknown as SnapshotScheduleItem[];
      } else if (
        subChan.scheduleSnapshot &&
        typeof subChan.scheduleSnapshot === "object" &&
        "items" in subChan.scheduleSnapshot &&
        Array.isArray((subChan.scheduleSnapshot as unknown as { items?: unknown }).items)
      ) {
        rawItems = (subChan.scheduleSnapshot as unknown as { items: SnapshotScheduleItem[] }).items;
      }

      const items: PersonalScheduleItem[] = rawItems.map((item, idx: number) => {
        const dayOfWeek = Number(item.dayOfWeek);
        const blockStartMinutes = Number(item.blockStartMinutes);
        const blockCount = Number(item.blockCount || 1);
        const liveState = computeLiveState(dayOfWeek, blockStartMinutes, blockCount, now);
        const dayName =
          DAYS_OF_WEEK.find((d) => d.day === dayOfWeek)?.name ??
          `Day ${dayOfWeek}`;

        return {
          id: `sub-${subChan.id}-${idx}`,
          sessionId: subChan.subscriberSessionId,
          tmdbId: Number(item.tmdbId),
          mediaType: item.mediaType as MediaType,
          title: item.title,
          posterPath: item.posterPath || null,
          backdropUrl: item.backdropUrl || null,
          runtimeMinutes: item.runtimeMinutes ? Number(item.runtimeMinutes) : null,
          dayOfWeek,
          dayName,
          blockStartMinutes,
          blockCount,
          timeLabel: formatBlockTime(blockStartMinutes),
          currentSeason: Number(item.currentSeason || 1),
          currentEpisode: Number(item.currentEpisode || 1),
          totalEpisodes: item.totalEpisodes ? Number(item.totalEpisodes) : null,
          wasWatched: false,
          isRerun: false,
          isLiveNow: liveState.isLiveNow,
          liveOffsetSeconds: liveState.liveOffsetSeconds,
          createdAt: subChan.createdAt.toISOString(),
          updatedAt: subChan.updatedAt.toISOString(),
        };
      });

      return {
        id: subChan.id,
        subscriberSessionId: subChan.subscriberSessionId,
        channelName: subChan.channelName,
        channelColor: subChan.channelColor || "#06b6d4",
        shareToken: subChan.shareToken ?? undefined,
        items,
        createdAt: subChan.createdAt.toISOString(),
        updatedAt: subChan.updatedAt.toISOString(),
      };
    });

    const combinedSchedule = [...schedule, ...calendarItems];
    const liveNow = combinedSchedule.find((item) => item.isLiveNow) ?? null;

    return NextResponse.json({
      schedule: combinedSchedule,
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
      subscribedChannels,
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

    // If the rental pass has already expired, prompt for renewal
    if (ownership.status === "EXPIRED") {
      const formattedExpires = ownership.expiresAt
        ? ownership.expiresAt.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "recently";

      return NextResponse.json(
        {
          error: `Your VHS rental pass expired on ${formattedExpires}. Renew your rental or buy the tape to program this slot.`,
          needsRentalExtension: true,
          expiresAt: ownership.expiresAt?.toISOString() ?? null,
          mediaId: input.tmdbId,
          mediaType: input.mediaType,
          seasonNumber,
        },
        { status: 400 },
      );
    }

    // Resolve accurate runtime and season total episodes
    let runtimeMinutes = input.runtimeMinutes && input.runtimeMinutes > 0 ? Number(input.runtimeMinutes) : null;
    let totalEpisodes = input.totalEpisodes && input.totalEpisodes > 0 ? Number(input.totalEpisodes) : null;
    const targetSeason = input.mediaType === "tv" ? (input.startSeason ?? 1) : 1;

    try {
      if (input.mediaType === "tv") {
        const details = await getShowDetails(input.tmdbId);
        // Canonical runtime check: prevent inflated runtimes (like a 48m finale) from forcing a 30m show into 60m
        if (details.defaultRuntime?.exactMinutes) {
          if (!runtimeMinutes || runtimeMinutes > details.defaultRuntime.exactMinutes) {
            runtimeMinutes = details.defaultRuntime.exactMinutes;
          }
        }
        if (!totalEpisodes || totalEpisodes === 24) {
          const sMatch = details.seasons?.find((s) => s.seasonNumber === targetSeason);
          if (sMatch?.episodeCount) {
            totalEpisodes = sMatch.episodeCount;
          } else if (details.numberOfEpisodes) {
            totalEpisodes = details.numberOfEpisodes;
          }
        }
      } else {
        if (!runtimeMinutes) {
          const details = await getMovieDetails(input.tmdbId);
          if (details.defaultRuntime?.exactMinutes) {
            runtimeMinutes = details.defaultRuntime.exactMinutes;
          }
        }
      }
    } catch (err) {
      console.warn("[api/broadcast/personal] Failed to fetch TMDB details for fallback:", err);
    }

    if (!runtimeMinutes) {
      runtimeMinutes = input.mediaType === "movie" ? 120 : 25;
    }

    const blockCount = Math.max(1, Math.ceil(runtimeMinutes / BLOCK_MINUTES));
    const requestedEnd = input.blockStartMinutes + blockCount * BLOCK_MINUTES;

    // Fetch existing schedule for this user to validate conflicts and duplicates
    const existing = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
    });

    // Prevent duplicate scheduling of the same title/season
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

    let targetDailySlots: number[] =
      input.mediaType === "tv" && Array.isArray(input.dailySlots) && input.dailySlots.length > 0
        ? input.dailySlots.map(Number)
        : [Number(input.blockStartMinutes)];

    // 1. Intra-request slot collision validation
    if (targetDailySlots.length > 1) {
      for (let i = 0; i < targetDailySlots.length; i++) {
        for (let j = i + 1; j < targetDailySlots.length; j++) {
          const s1 = targetDailySlots[i];
          const s2 = targetDailySlots[j];
          const s1End = s1 + blockCount * BLOCK_MINUTES;
          const s2End = s2 + blockCount * BLOCK_MINUTES;
          if (s1 < s2End && s1End > s2) {
            return NextResponse.json(
              {
                error: `Episode time slot conflict: ${formatBlockTime(s1)} overlaps with ${formatBlockTime(s2)}. Each episode requires a ${blockCount * BLOCK_MINUTES}m block. Please space out your episode times.`,
              },
              { status: 400 },
            );
          }
        }
      }
    }

    // 2. Conflict validation with existing personal schedule
    for (const day of input.daysOfWeek) {
      const dayMatches = existing.filter((item) => item.dayOfWeek === day);

      for (let sIdx = 0; sIdx < targetDailySlots.length; sIdx++) {
        const slotStart = targetDailySlots[sIdx];
        const slotEnd = slotStart + blockCount * BLOCK_MINUTES;

        const overlappingItem = dayMatches.find((item) => {
          const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
          return slotStart < itemEnd && slotEnd > item.blockStartMinutes;
        });

        if (overlappingItem) {
          const nextOpen = findNextOpenSlotForDay(
            dayMatches,
            blockCount,
            overlappingItem.blockStartMinutes + overlappingItem.blockCount * BLOCK_MINUTES,
          );

          if (input.autoShiftOnConflict && nextOpen !== null) {
            targetDailySlots[sIdx] = nextOpen;
          } else {
            const dayName = DAYS_OF_WEEK.find((d) => d.day === day)?.name ?? `Day ${day}`;
            const itemTime = formatBlockTime(overlappingItem.blockStartMinutes);
            return NextResponse.json(
              {
                error: `Slot conflict on ${dayName} at ${itemTime}: Already occupied by "${overlappingItem.title}". You cannot schedule two broadcasts at the same time.`,
                conflictWith: overlappingItem.title,
                conflictDay: day,
                suggestedSlot: nextOpen,
                suggestedSlotTime: nextOpen !== null ? formatBlockTime(nextOpen) : null,
              },
              { status: 409 },
            );
          }
        }
      }
    }

    // Create appointments for each selected day and daily slot with sequential episode numbers
    const created = [];
    const sortedDays = [...input.daysOfWeek].sort((a, b) => a - b);
    const baseEpisode = Math.max(1, Number(input.startEpisode) || 1);
    let episodeOffsetCounter = 0;

    for (const day of sortedDays) {
      for (const slotMinutes of targetDailySlots) {
        const episodeNum = input.mediaType === "tv" ? baseEpisode + episodeOffsetCounter : 1;
        const item = await prisma.userPersonalSchedule.create({
          data: {
            sessionId: userId,
            tmdbId: input.tmdbId,
            mediaType: input.mediaType,
            title: input.title,
            posterPath: input.posterPath ?? null,
            backdropUrl: input.backdropUrl ?? null,
            runtimeMinutes,
            dayOfWeek: day,
            blockStartMinutes: slotMinutes,
            blockCount,
            currentSeason: targetSeason,
            currentEpisode: episodeNum,
            totalEpisodes: totalEpisodes ?? (input.mediaType === "tv" ? 12 : null),
            timezoneOffset: typeof input.timezoneOffset === "number" ? input.timezoneOffset : null,
          },
        });
        created.push(item);
        if (input.mediaType === "tv") {
          episodeOffsetCounter++;
        }
      }
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
