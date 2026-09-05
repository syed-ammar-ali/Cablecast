import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "./webpush";
import type { PushNotificationPayload } from "./webpush";
import { getBroadcastSlotStatus } from "@/lib/mediaOwnership";

export interface DispatchSummary {
  startingSoon: number;
  missedBroadcast: number;
  tapeExpiring: number;
  failedDeliveries: number;
  cleanedSubscriptions: number;
}

/**
 * Sends a notification payload to all active subscriptions for a given userId.
 * Automatically cleans up invalid/expired endpoints (404/410).
 */
async function sendToUserSubscriptions(
  userId: string,
  payload: PushNotificationPayload,
): Promise<{ sent: number; failed: number; cleaned: number }> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  for (const sub of subscriptions) {
    const res = await sendPushNotification(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
      payload,
    );

    if (res.success) {
      sent++;
    } else {
      failed++;
      if (res.shouldRemove) {
        try {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } catch {
          // Ignore deletion error
        }
        cleaned++;
      }
    }
  }

  return { sent, failed, cleaned };
}

/**
 * Dispatches "Starting Soon" alerts (10 minutes before broadcast).
 * Lookahead window: slots starting between now + 5 mins and now + 15 mins.
 */
export async function dispatchStartingSoonAlerts(now: Date = new Date()): Promise<{ count: number; failed: number; cleaned: number }> {
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIsoDate = now.toISOString().slice(0, 10);

  // 10-minute lookahead window (+/- 5 minutes around now + 10)
  const targetMinStart = currentMinutes + 5;
  const targetMinEnd = currentMinutes + 15;

  const upcomingSlots = await prisma.userPersonalSchedule.findMany({
    where: {
      dayOfWeek: currentDay,
      blockStartMinutes: {
        gte: targetMinStart,
        lte: targetMinEnd,
      },
    },
  });

  let count = 0;
  let failed = 0;
  let cleaned = 0;

  for (const slot of upcomingSlots) {
    const referenceId = `${slot.id}_${todayIsoDate}`;

    // 1. Deduplication check
    const alreadyLogged = await prisma.notificationLog.findUnique({
      where: {
        userId_type_referenceId: {
          userId: slot.sessionId,
          type: "STARTING_SOON",
          referenceId,
        },
      },
    });
    if (alreadyLogged) continue;

    // 2. Rental expiration check
    const slotAirDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    slotAirDate.setHours(Math.floor(slot.blockStartMinutes / 60), slot.blockStartMinutes % 60, 0, 0);

    const slotStatus = await getBroadcastSlotStatus(
      slot.sessionId,
      slot.tmdbId,
      slot.mediaType === "tv" ? slot.currentSeason : 0,
      slotAirDate,
    );
    if (slotStatus === "RETURNED_EXPIRED") continue;

    // 3. Dispatch push notification
    const epDetails = slot.mediaType === "tv" ? ` (S${slot.currentSeason}:E${slot.currentEpisode})` : "";
    const payload: PushNotificationPayload = {
      title: "Starting Soon on Cablecast",
      body: `${slot.title}${epDetails} starts in 10 minutes on your channel!`,
      icon: slot.posterPath ? `https://image.tmdb.org/t/p/w185${slot.posterPath}` : "/icon-192.png",
      tag: `starting-soon-${slot.id}`,
      data: {
        url: "/?view=home#schedule",
        type: "STARTING_SOON",
        scheduleId: slot.id,
      },
    };

    const res = await sendToUserSubscriptions(slot.sessionId, payload);
    failed += res.failed;
    cleaned += res.cleaned;

    // 4. Record idempotency log
    try {
      await prisma.notificationLog.create({
        data: {
          userId: slot.sessionId,
          type: "STARTING_SOON",
          referenceId,
        },
      });
    } catch {
      // Ignore duplicate log insertion error
    }

    count++;
  }

  return { count, failed, cleaned };
}

/**
 * Dispatches "Missed Broadcast" alerts (unwatched broadcasts that completed recently).
 */
export async function dispatchMissedBroadcastAlerts(): Promise<{ count: number; failed: number; cleaned: number }> {
  // Find unresolved missed broadcasts
  const missedItems = await prisma.userMissedBroadcast.findMany({
    where: {
      isResolved: false,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let count = 0;
  let failed = 0;
  let cleaned = 0;

  for (const item of missedItems) {
    const referenceId = item.id;

    // 1. Deduplication check
    const alreadyLogged = await prisma.notificationLog.findUnique({
      where: {
        userId_type_referenceId: {
          userId: item.sessionId,
          type: "MISSED_BROADCAST",
          referenceId,
        },
      },
    });
    if (alreadyLogged) continue;

    // 2. Dispatch push notification
    const epDetails = item.season && item.episode ? ` (S${item.season}:E${item.episode})` : "";
    const payload: PushNotificationPayload = {
      title: "Missed Broadcast",
      body: `You missed ${item.title}${epDetails}. Tap to reschedule a one-off rerun.`,
      icon: item.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : "/icon-192.png",
      tag: `missed-${item.id}`,
      data: {
        url: `/broadcast?tab=missed&item=${item.id}`,
        type: "MISSED_BROADCAST",
        missedId: item.id,
      },
    };

    const res = await sendToUserSubscriptions(item.sessionId, payload);
    failed += res.failed;
    cleaned += res.cleaned;

    // 3. Record log
    try {
      await prisma.notificationLog.create({
        data: {
          userId: item.sessionId,
          type: "MISSED_BROADCAST",
          referenceId,
        },
      });
    } catch {
      // Ignore duplicate log insertion error
    }

    count++;
  }

  return { count, failed, cleaned };
}

/**
 * Dispatches "Tape Expiring Soon" alerts (2 hours before rental expires).
 */
export async function dispatchTapeExpiringAlerts(now: Date = new Date()): Promise<{ count: number; failed: number; cleaned: number }> {
  // Expiring in the next 2 hours
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const expiringRentals = await prisma.rental.findMany({
    where: {
      expiresAt: {
        gt: now,
        lte: twoHoursFromNow,
      },
    },
  });

  let count = 0;
  let failed = 0;
  let cleaned = 0;

  for (const rental of expiringRentals) {
    const referenceId = rental.id;

    // 1. Deduplication check
    const alreadyLogged = await prisma.notificationLog.findUnique({
      where: {
        userId_type_referenceId: {
          userId: rental.userId,
          type: "TAPE_EXPIRING",
          referenceId,
        },
      },
    });
    if (alreadyLogged) continue;

    // 2. Permanent collection check (skip if permanently owned)
    const owned = await prisma.libraryItem.findFirst({
      where: {
        userId: rental.userId,
        mediaId: rental.mediaId,
        seasonNumber: rental.seasonNumber,
      },
    });
    if (owned) continue;

    // 3. Check if this rental is programmed in their schedule
    const scheduled = await prisma.userPersonalSchedule.findFirst({
      where: {
        sessionId: rental.userId,
        tmdbId: rental.mediaId,
      },
    });

    const title = rental.title || "VHS Tape";
    const bodyText = scheduled
      ? `Your rental for "${title}" expires in 2 hours! Scheduled broadcasts will be disabled unless renewed.`
      : `Your rental pass for "${title}" expires in 2 hours. Watch now or extend your rental.`;

    const payload: PushNotificationPayload = {
      title: "⏳ VHS Rental Expiring Soon",
      body: bodyText,
      icon: rental.posterPath ? `https://image.tmdb.org/t/p/w185${rental.posterPath}` : "/icon-192.png",
      tag: `rental-expiring-${rental.id}`,
      data: {
        url: `/library?tab=rented&tapeId=${rental.id}`,
        type: "TAPE_EXPIRING",
        rentalId: rental.id,
      },
    };

    const res = await sendToUserSubscriptions(rental.userId, payload);
    failed += res.failed;
    cleaned += res.cleaned;

    // 4. Record log
    try {
      await prisma.notificationLog.create({
        data: {
          userId: rental.userId,
          type: "TAPE_EXPIRING",
          referenceId,
        },
      });
    } catch {
      // Ignore duplicate log insertion error
    }

    count++;
  }

  return { count, failed, cleaned };
}

/**
 * Master dispatcher orchestrating all 3 notification triggers.
 */
export async function runAllNotificationDispatchers(now: Date = new Date()): Promise<DispatchSummary> {
  const [startingSoon, missed, expiring] = await Promise.all([
    dispatchStartingSoonAlerts(now),
    dispatchMissedBroadcastAlerts(),
    dispatchTapeExpiringAlerts(now),
  ]);

  return {
    startingSoon: startingSoon.count,
    missedBroadcast: missed.count,
    tapeExpiring: expiring.count,
    failedDeliveries: startingSoon.failed + missed.failed + expiring.failed,
    cleanedSubscriptions: startingSoon.cleaned + missed.cleaned + expiring.cleaned,
  };
}
