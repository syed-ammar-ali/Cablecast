import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "./webpush";
import type { PushNotificationPayload } from "./webpush";
import { sendSms, makeCall, isTwilioConfigured } from "./twilio";
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  isTelegramConfigured,
  getDefaultTelegramChatId,
} from "./telegram";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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
  let subscriptions: any[] = [];
  try {
    const userKeys = [userId];
    let session: any = null;
    try {
      session = await prisma.session?.findFirst({
        where: {
          OR: [{ id: userId }, { accessCodeId: userId }],
        },
        select: { id: true, accessCodeId: true, role: true },
      });
    } catch {
      session = null;
    }
    if (session) {
      if (session.id && !userKeys.includes(session.id)) userKeys.push(session.id);
      if (session.accessCodeId && !userKeys.includes(session.accessCodeId)) userKeys.push(session.accessCodeId);
      // Admin subscriptions are stored as userId="admin" by getPersistentUserId().
      // Schedule slots store the actual session.id, so we must add "admin" here.
      if (session.role === "admin" && !userKeys.includes("admin")) userKeys.push("admin");
    }

    subscriptions = (await prisma.pushSubscription.findMany({
      where: { userId: { in: userKeys } },
    })) || [];
  } catch {
    subscriptions = [];
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        payload,
      ),
    ),
  );

  const toDelete: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value.success) {
      sent++;
    } else {
      failed++;
      const shouldRemove = result.status === "fulfilled" && result.value.shouldRemove;
      if (shouldRemove) {
        toDelete.push(subscriptions[i].id);
      }
    }
  }

  if (toDelete.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: toDelete } },
      });
      cleaned += toDelete.length;
    } catch {
      // Ignore batch deletion error
    }
  }

  return { sent, failed, cleaned };
}

/**
 * Resolves a map of session IDs to canonical persistent user IDs (e.g. "admin" for admin sessions, accessCodeId for users).
 */
async function getCanonicalUserMap(sessionIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!sessionIds || sessionIds.length === 0) return map;
  try {
    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, accessCodeId: true, role: true },
    });
    for (const s of sessions) {
      const canonical = s.role === "admin" ? "admin" : (s.accessCodeId || s.id);
      map.set(s.id, canonical);
    }
  } catch {
    // Ignore and fallback to raw sessionId
  }
  return map;
}


/**
 * Bulk-fetches phone & telegram settings for a list of canonical user IDs.
 * Returns a Map keyed by userId → settings row
 */
async function getPhoneSettingsMap(
  userIds: string[],
): Promise<
  Map<
    string,
    {
      phoneNumber: string;
      callEnabled: boolean;
      smsEnabled: boolean;
      telegramChatId: string | null;
      telegramEnabled: boolean;
      verifiedAt: Date | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      phoneNumber: string;
      callEnabled: boolean;
      smsEnabled: boolean;
      telegramChatId: string | null;
      telegramEnabled: boolean;
      verifiedAt: Date | null;
    }
  >();
  if ((!isTwilioConfigured() && !isTelegramConfigured()) || userIds.length === 0) return map;
  try {
    const rows = await prisma.userPhoneSettings.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        phoneNumber: true,
        callEnabled: true,
        smsEnabled: true,
        telegramChatId: true,
        telegramEnabled: true,
        verifiedAt: true,
      },
    });
    for (const row of rows) {
      map.set(row.userId, row);
    }
  } catch {
    // Non-fatal — delivery is best-effort
  }
  return map;
}

/**
 * Calculates whether an appointment slot (recurring at slot.dayOfWeek and slot.blockStartMinutes)
 * airs in the upcoming 10-minute lookahead window (+/- 5 minutes) relative to `now`.
 * If a timezone offset is specified (in minutes, UTC - Local), aligns with the user's local timezone.
 * If no offset is specified, falls back to server-local time.
 */
export function isSlotStartingSoon(
  slot: { dayOfWeek: number; blockStartMinutes: number; timezoneOffset?: number | null },
  userOffsetMinutes?: number | null,
  now: Date = new Date(),
): { isStartingSoon: boolean; localIsoDate: string } {
  // Effective offset: slot offset -> userOffsetMinutes -> default UTC (0)
  const effectiveOffset =
    typeof slot.timezoneOffset === "number"
      ? slot.timezoneOffset
      : typeof userOffsetMinutes === "number"
        ? userOffsetMinutes
        : 0;

  // Local time for user = UTC time - effectiveOffset (Date.prototype.getTimezoneOffset convention: UTC - Local)
  const localTimeMs = now.getTime() - effectiveOffset * 60_000;
  const localNow = new Date(localTimeMs);

  const localDayOfWeek = localNow.getUTCDay();
  const localMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  const localIsoDate = localNow.toISOString().slice(0, 10);

  if (slot.dayOfWeek !== localDayOfWeek) {
    return { isStartingSoon: false, localIsoDate };
  }

  // Lookahead window: slot starting within upcoming 10 minutes or started within the last 2 minutes
  const targetMinStart = localMinutes - 2;
  const targetMinEnd = localMinutes + 10;

  const isStartingSoon =
    slot.blockStartMinutes >= targetMinStart && slot.blockStartMinutes <= targetMinEnd;

  return { isStartingSoon, localIsoDate };
}

/**
 * Resolves crisp, high-DPI icon and hero cover image URLs for push notifications.
 * Uses 780px wide poster for sharp expanded cover card (fallback to /badge-96.png for icon)
 */
export function getNotificationImages(
  posterPath?: string | null,
): { icon: string; image?: string } {
  const icon = "/badge-96.png";
  let image: string | undefined = undefined;

  if (posterPath) {
    if (posterPath.startsWith("http://") || posterPath.startsWith("https://")) {
      image = posterPath;
    } else {
      const clean = posterPath.startsWith("/") ? posterPath : `/${posterPath}`;
      image = `https://image.tmdb.org/t/p/w780${clean}`;
    }
  }

  return { icon, image };
}

/**
 * Dispatches "Starting Soon" alerts (10 minutes before broadcast).
 * Lookahead window: slots starting between now - 2 mins and now + 20 mins in the user's local timezone.
 */
export async function dispatchStartingSoonAlerts(now: Date = new Date()): Promise<{ count: number; failed: number; cleaned: number }> {
  // Candidate days across all possible global timezones (-12h to +14h)
  const candidateDays = Array.from(new Set([(now.getUTCDay() + 6) % 7, now.getUTCDay(), (now.getUTCDay() + 1) % 7]));

  // Fetch active schedules for relevant days, user subscriptions, and session aliases
  const [upcomingSlots, subscriptions, sessions] = await Promise.all([
    prisma.userPersonalSchedule.findMany({
      where: { dayOfWeek: { in: candidateDays } },
    }) || [],
    prisma.pushSubscription.findMany({ select: { userId: true, timezoneOffset: true } }) || [],
    prisma.session.findMany({ select: { id: true, accessCodeId: true, role: true } }) || [],
  ]);

  const sessionCanonicalMap = new Map<string, string>();
  for (const s of sessions) {
    sessionCanonicalMap.set(s.id, s.role === "admin" ? "admin" : (s.accessCodeId || s.id));
    if (s.accessCodeId) {
      sessionCanonicalMap.set(s.accessCodeId, s.role === "admin" ? "admin" : s.accessCodeId);
    }
  }
  const getCanonicalId = (id: string) => sessionCanonicalMap.get(id) || id;

  const userTimezoneMap = new Map<string, number>();
  for (const sub of subscriptions) {
    if (typeof sub.timezoneOffset === "number") {
      userTimezoneMap.set(sub.userId, sub.timezoneOffset);
      const relatedSession = sessions.find((s) => s.id === sub.userId || s.accessCodeId === sub.userId);
      if (relatedSession) {
        if (relatedSession.id) userTimezoneMap.set(relatedSession.id, sub.timezoneOffset);
        if (relatedSession.accessCodeId) userTimezoneMap.set(relatedSession.accessCodeId, sub.timezoneOffset);
      }
    }
  }

  // Identify candidate slots starting soon in memory first before firing any DB queries
  const candidateSlots: Array<{
    slot: (typeof upcomingSlots)[number];
    localIsoDate: string;
    referenceId: string;
  }> = [];

  for (const slot of upcomingSlots) {
    const effectiveOffset =
      typeof slot.timezoneOffset === "number"
        ? slot.timezoneOffset
        : (userTimezoneMap.get(slot.sessionId) ?? 0);

    const { isStartingSoon, localIsoDate } = isSlotStartingSoon(slot, effectiveOffset, now);
    if (!isStartingSoon) continue;

    candidateSlots.push({
      slot,
      localIsoDate,
      referenceId: `${slot.id}_${localIsoDate}`,
    });
  }

  if (candidateSlots.length === 0) {
    return { count: 0, failed: 0, cleaned: 0 };
  }

  // Pre-fetch phone settings for all candidate users (for voice call delivery)
  const candidateCanonicalIds = Array.from(
    new Set(candidateSlots.map((c) => getCanonicalId(c.slot.sessionId))),
  );
  const phoneSettingsMap = await getPhoneSettingsMap(candidateCanonicalIds);

  // Pre-fetch all deduplication logs, rentals, and owned items for candidate slots in bulk
  const refIds = candidateSlots.map((c) => c.referenceId);
  const userIds = Array.from(new Set(candidateSlots.flatMap((c) => [c.slot.sessionId, getCanonicalId(c.slot.sessionId)])));
  const tmdbIds = Array.from(new Set(candidateSlots.map((c) => c.slot.tmdbId)));

  const [existingLogs, rentals, ownedItems] = await Promise.all([
    prisma.notificationLog.findMany({
      where: {
        userId: { in: userIds },
        type: "STARTING_SOON",
        referenceId: { in: refIds },
      },
      select: { userId: true, referenceId: true },
    }),
    prisma.rental.findMany({
      where: {
        userId: { in: userIds },
        mediaId: { in: tmdbIds },
      },
      orderBy: { expiresAt: "desc" },
      select: { userId: true, mediaId: true, seasonNumber: true, expiresAt: true },
    }),
    prisma.libraryItem.findMany({
      where: {
        userId: { in: userIds },
        mediaId: { in: tmdbIds },
      },
      select: { userId: true, mediaId: true, seasonNumber: true },
    }),
  ]);

  const loggedSet = new Set(existingLogs.map((l) => `${l.userId}_${l.referenceId}`));
  const ownedSet = new Set(ownedItems.map((o) => `${o.userId}_${o.mediaId}_${o.seasonNumber ?? 0}`));
  const rentalMap = new Map<string, Date>();
  for (const r of rentals) {
    const key = `${r.userId}_${r.mediaId}_${r.seasonNumber ?? 0}`;
    if (!rentalMap.has(key)) rentalMap.set(key, r.expiresAt);
  }

  let count = 0;
  let failed = 0;
  let cleaned = 0;

  for (const { slot, referenceId } of candidateSlots) {
    const canonUserId = getCanonicalId(slot.sessionId);

    // 1. Deduplication check (in-memory O(1))
    if (loggedSet.has(`${slot.sessionId}_${referenceId}`) || loggedSet.has(`${canonUserId}_${referenceId}`)) continue;

    // 2. Rental expiration check (in-memory O(1))
    const slotAirDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    slotAirDate.setHours(Math.floor(slot.blockStartMinutes / 60), slot.blockStartMinutes % 60, 0, 0);

    const seasonNum = slot.mediaType === "tv" && slot.currentSeason ? slot.currentSeason : 0;
    const itemKey = `${slot.sessionId}_${slot.tmdbId}_${seasonNum}`;
    const latestRentalExpiry = rentalMap.get(itemKey);

    if (latestRentalExpiry && slotAirDate.getTime() > latestRentalExpiry.getTime()) {
      if (!ownedSet.has(itemKey)) {
        continue; // Rental expired and not owned
      }
    }

    // 3. Dispatch push notification with catchy line, sleek info, and hero cover
    const { icon, image } = getNotificationImages(slot.posterPath);
    const title = "📺 Showtime in 10 Minutes";
    const body =
      slot.mediaType === "tv" && slot.currentSeason && slot.currentEpisode
        ? `"${slot.title}" · Season ${slot.currentSeason}, Ep ${slot.currentEpisode}\nScheduled broadcast is about to start. Tune in live!`
        : `"${slot.title}"\nScheduled broadcast is about to start on your channel. Tune in live!`;

    const payload: PushNotificationPayload = {
      title,
      body,
      image,
      icon,
      badge: "/badge-96.png",
      tag: `starting-soon-${slot.id}`,
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "tune-in", title: "▶ Tune In" },
        { action: "dismiss", title: "Dismiss" },
      ],
      data: {
        url: "/?view=home#schedule",
        type: "STARTING_SOON",
        scheduleId: slot.id,
      },
    };

    const res = await sendToUserSubscriptions(slot.sessionId, payload);
    failed += res.failed;
    cleaned += res.cleaned;

    // 4. Voice call and/or SMS via Twilio (reliable phone reminder — fires regardless of web-push)
    const phoneSettings = phoneSettingsMap.get(canonUserId);
    if (phoneSettings?.phoneNumber) {
      const showLabel =
        slot.mediaType === "tv" && slot.currentSeason && slot.currentEpisode
          ? `${slot.title}, Season ${slot.currentSeason}, Episode ${slot.currentEpisode}`
          : slot.title;

      if (phoneSettings.callEnabled) {
        const callMessage = `This is Cablecast. Your show, ${showLabel}, is starting in 10 minutes. Tune in now!`;
        makeCall(phoneSettings.phoneNumber, callMessage).catch((e) =>
          console.error("[Twilio] Starting-soon call failed:", e),
        );
      }

      if (phoneSettings.smsEnabled) {
        const smsMessage = `📺 Cablecast: "${showLabel}" is starting in 10 minutes. Tune in live!`;
        sendSms(phoneSettings.phoneNumber, smsMessage).catch((e) =>
          console.error("[Twilio] Starting-soon SMS failed:", e),
        );
      }
    }

    // 5. Telegram instant alert with high-res poster (100% free forever)
    let telegramFired = false;
    const targetChatId = phoneSettings?.telegramChatId || getDefaultTelegramChatId();
    const isTelegramActive = phoneSettings ? phoneSettings.telegramEnabled : true;
    if (isTelegramConfigured() && targetChatId && isTelegramActive) {
      const showLabel =
        slot.mediaType === "tv" && slot.currentSeason && slot.currentEpisode
          ? `<b>${escapeHtml(slot.title)}</b> (Season ${slot.currentSeason}, Ep ${slot.currentEpisode})`
          : `<b>${escapeHtml(slot.title)}</b>`;

      const telegramCaption = `📺 <b>Showtime in 10 Minutes!</b>\n\n${showLabel}\nScheduled broadcast is about to start. Tune in live!`;

      const posterUrl = slot.posterPath
        ? slot.posterPath.startsWith("http")
          ? slot.posterPath
          : `https://image.tmdb.org/t/p/w780${slot.posterPath.startsWith("/") ? "" : "/"}${slot.posterPath}`
        : null;

      if (posterUrl) {
        sendTelegramPhoto(targetChatId, posterUrl, telegramCaption).catch((e) =>
          console.error("[Telegram] Starting-soon alert failed:", e),
        );
      } else {
        sendTelegramMessage(targetChatId, telegramCaption).catch((e) =>
          console.error("[Telegram] Starting-soon alert failed:", e),
        );
      }
      telegramFired = true;
    }

    // 6. Record idempotency log — log if push sent OR Twilio alert OR Telegram alert was triggered
    const twilioFired = Boolean(
      phoneSettings?.phoneNumber && (phoneSettings.callEnabled || phoneSettings.smsEnabled),
    );
    if (res.sent > 0 || twilioFired || telegramFired) {
      try {
        await prisma.notificationLog.create({
          data: {
            userId: canonUserId,
            type: "STARTING_SOON",
            referenceId,
          },
        });
      } catch {
        // Ignore duplicate log insertion error
      }

      count++;
    }
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

  const missedSessionIds = Array.from(new Set(missedItems.map((m) => m.sessionId)));
  const canonicalMap = await getCanonicalUserMap(missedSessionIds);
  const getCanon = (id: string) => canonicalMap.get(id) || id;

  for (const item of missedItems) {
    const referenceId = item.id;
    const canonUserId = getCanon(item.sessionId);

    // 1. Deduplication check
    const alreadyLogged = await prisma.notificationLog.findFirst({
      where: {
        userId: { in: [item.sessionId, canonUserId] },
        type: "MISSED_BROADCAST",
        referenceId,
      },
    });
    if (alreadyLogged) continue;

    // 2. Dispatch push notification
    const epDetails = item.season && item.episode ? ` · Season ${item.season}, Ep ${item.episode}` : "";
    const { icon, image } = getNotificationImages(item.posterPath);

    const payload: PushNotificationPayload = {
      title: "📼 Missed Broadcast",
      body: `You missed "${item.title}"${epDetails}.\nReschedule a one-off rerun anytime from your guide.`,
      image,
      icon,
      badge: "/badge-96.png",
      tag: `missed-${item.id}`,
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "reschedule", title: "🔄 Reschedule Rerun" },
        { action: "dismiss", title: "Dismiss" },
      ],
      data: {
        url: `/broadcast?tab=missed&item=${item.id}`,
        type: "MISSED_BROADCAST",
        missedId: item.id,
      },
    };

    const res = await sendToUserSubscriptions(item.sessionId, payload);
    failed += res.failed;
    cleaned += res.cleaned;

    // 3. SMS via Twilio for missed broadcast
    let missedTwilioFired = false;
    if (isTwilioConfigured()) {
      try {
        const phoneSetting = await prisma.userPhoneSettings.findUnique({
          where: { userId: canonUserId },
          select: { phoneNumber: true, smsEnabled: true },
        });
        if (phoneSetting?.smsEnabled && phoneSetting.phoneNumber) {
          const epDetails = item.season && item.episode ? ` (S${item.season}E${item.episode})` : "";
          sendSms(
            phoneSetting.phoneNumber,
            `📼 Cablecast: You missed "${item.title}"${epDetails}. Open the app to reschedule a rerun.`,
          ).catch((e) => console.error("[Twilio] Missed-broadcast SMS failed:", e));
          missedTwilioFired = true;
        }
      } catch {
        // Non-fatal
      }
    }

    // 4. Telegram alert for missed broadcast
    let missedTelegramFired = false;
    if (isTelegramConfigured()) {
      try {
        const phoneSetting = await prisma.userPhoneSettings.findUnique({
          where: { userId: canonUserId },
          select: { telegramChatId: true, telegramEnabled: true },
        });
        const targetChatId = phoneSetting?.telegramChatId || getDefaultTelegramChatId();
        const isTelegramActive = phoneSetting ? phoneSetting.telegramEnabled : true;
        if (targetChatId && isTelegramActive) {
          const epDetails = item.season && item.episode ? ` (Season ${item.season}, Ep ${item.episode})` : "";
          const msg = `📼 <b>Missed Broadcast</b>\n\nYou missed <b>${escapeHtml(item.title)}</b>${epDetails}.\nOpen your guide anytime to reschedule a rerun!`;
          sendTelegramMessage(targetChatId, msg).catch((e) =>
            console.error("[Telegram] Missed-broadcast alert failed:", e),
          );
          missedTelegramFired = true;
        }
      } catch {
        // Non-fatal
      }
    }

    // 5. Record log if push sent OR SMS OR Telegram triggered
    if (res.sent > 0 || missedTwilioFired || missedTelegramFired) {
      try {
        await prisma.notificationLog.create({
          data: {
            userId: canonUserId,
            type: "MISSED_BROADCAST",
            referenceId,
          },
        });
      } catch {
        // Ignore duplicate log insertion error
      }

      count++;
    }
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

  const rentalUserIds = Array.from(new Set(expiringRentals.map((r) => r.userId)));
  const canonicalMap = await getCanonicalUserMap(rentalUserIds);
  const getCanon = (id: string) => canonicalMap.get(id) || id;

  for (const rental of expiringRentals) {
    const referenceId = rental.id;
    const canonUserId = getCanon(rental.userId);

    // 1. Deduplication check
    const alreadyLogged = await prisma.notificationLog.findFirst({
      where: {
        userId: { in: [rental.userId, canonUserId] },
        type: "TAPE_EXPIRING",
        referenceId,
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
    const { icon, image } = getNotificationImages(rental.posterPath);

    const payload: PushNotificationPayload = {
      title: "⏳ VHS Rental Expiring Soon",
      body: bodyText,
      image,
      icon,
      badge: "/badge-96.png",
      tag: `rental-expiring-${rental.id}`,
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "watch", title: "▶ Watch Now" },
        { action: "dismiss", title: "Dismiss" },
      ],
      data: {
        url: `/library?tab=rented&tapeId=${rental.id}`,
        type: "TAPE_EXPIRING",
        rentalId: rental.id,
      },
    };

    const res = await sendToUserSubscriptions(rental.userId, payload);
    failed += res.failed;
    cleaned += res.cleaned;

    // 4. SMS via Twilio for expiring rental
    let expiringTwilioFired = false;
    if (isTwilioConfigured()) {
      try {
        const phoneSetting = await prisma.userPhoneSettings.findUnique({
          where: { userId: canonUserId },
          select: { phoneNumber: true, smsEnabled: true },
        });
        if (phoneSetting?.smsEnabled && phoneSetting.phoneNumber) {
          sendSms(
            phoneSetting.phoneNumber,
            `⏳ Cablecast: Your rental of "${title}" expires in 2 hours. Open the app to watch or renew.`,
          ).catch((e) => console.error("[Twilio] Rental-expiring SMS failed:", e));
          expiringTwilioFired = true;
        }
      } catch {
        // Non-fatal
      }
    }

    // 5. Telegram alert for expiring rental
    let expiringTelegramFired = false;
    if (isTelegramConfigured()) {
      try {
        const phoneSetting = await prisma.userPhoneSettings.findUnique({
          where: { userId: canonUserId },
          select: { telegramChatId: true, telegramEnabled: true },
        });
        const targetChatId = phoneSetting?.telegramChatId || getDefaultTelegramChatId();
        const isTelegramActive = phoneSetting ? phoneSetting.telegramEnabled : true;
        if (targetChatId && isTelegramActive) {
          const msg = `⏳ <b>VHS Rental Expiring Soon</b>\n\nYour rental for <b>${escapeHtml(title)}</b> expires in 2 hours. Watch now or renew in your library!`;
          sendTelegramMessage(targetChatId, msg).catch((e) =>
            console.error("[Telegram] Tape-expiring alert failed:", e),
          );
          expiringTelegramFired = true;
        }
      } catch {
        // Non-fatal
      }
    }

    // 6. Record log if push was sent OR SMS OR Telegram triggered
    if (res.sent > 0 || expiringTwilioFired || expiringTelegramFired) {
      try {
        await prisma.notificationLog.create({
          data: {
            userId: canonUserId,
            type: "TAPE_EXPIRING",
            referenceId,
          },
        });
      } catch {
        // Ignore duplicate log insertion error
      }

      count++;
    }
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

/**
 * Dispatches a "Starting Soon" alert for a specific slot ID (triggered by QStash or direct scheduler).
 * Guaranteed idempotent, verifies rental status, and dispatches across Push, Telegram, and Twilio.
 */
export async function dispatchStartingSoonForSlot(
  slotId: string,
  now: Date = new Date(),
): Promise<{ success: boolean; reason?: string }> {
  const slot = await prisma.userPersonalSchedule.findUnique({
    where: { id: slotId },
  });

  if (!slot) {
    return { success: true, reason: "Slot no longer exists (removed or deleted)" };
  }

  // Determine canonical user ID
  let canonUserId = slot.sessionId;
  try {
    const session = await prisma.session.findFirst({
      where: { OR: [{ id: slot.sessionId }, { accessCodeId: slot.sessionId }] },
      select: { id: true, accessCodeId: true, role: true },
    });
    if (session) {
      canonUserId = session.role === "admin" ? "admin" : (session.accessCodeId || session.id);
    }
  } catch {
    // fallback to slot.sessionId
  }

  const effectiveOffset = slot.timezoneOffset ?? 0;
  const localTimeMs = now.getTime() - effectiveOffset * 60_000;
  const localNow = new Date(localTimeMs);
  const localIsoDate = localNow.toISOString().slice(0, 10);
  const referenceId = `${slot.id}_${localIsoDate}`;

  // Idempotency check: verify this slot hasn't already received an alert for this air date
  const existingLog = await prisma.notificationLog.findFirst({
    where: {
      userId: { in: [slot.sessionId, canonUserId] },
      referenceId,
      type: "STARTING_SOON",
    },
  });

  if (existingLog) {
    return { success: true, reason: "Alert already sent for this date" };
  }

  // Verify rental possession
  const seasonNum = slot.mediaType === "tv" && slot.currentSeason ? slot.currentSeason : 0;
  try {
    const rental = await prisma.rental.findFirst({
      where: {
        userId: { in: [slot.sessionId, canonUserId] },
        mediaId: slot.tmdbId,
        seasonNumber: seasonNum,
      },
      orderBy: { expiresAt: "desc" },
    });
    if (rental && now.getTime() > rental.expiresAt.getTime()) {
      const owned = await prisma.libraryItem.findFirst({
        where: {
          userId: { in: [slot.sessionId, canonUserId] },
          mediaId: slot.tmdbId,
          seasonNumber: seasonNum,
        },
      });
      if (!owned) {
        return { success: true, reason: "Rental expired and not owned" };
      }
    }
  } catch {
    // Non-fatal
  }

  // 1. Web Push Notification
  const { icon, image } = getNotificationImages(slot.posterPath);
  const title = "📺 Showtime in 10 Minutes";
  const body =
    slot.mediaType === "tv" && slot.currentSeason && slot.currentEpisode
      ? `"${slot.title}" · Season ${slot.currentSeason}, Ep ${slot.currentEpisode}\nScheduled broadcast is about to start. Tune in live!`
      : `"${slot.title}"\nScheduled broadcast is about to start on your channel. Tune in live!`;

  const payload: PushNotificationPayload = {
    title,
    body,
    image,
    icon,
    badge: "/badge-96.png",
    tag: `starting-soon-${slot.id}`,
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: "tune-in", title: "▶ Tune In" },
      { action: "dismiss", title: "Dismiss" },
    ],
    data: {
      url: "/?view=home#schedule",
      type: "STARTING_SOON",
      scheduleId: slot.id,
    },
  };

  const pushRes = await sendToUserSubscriptions(slot.sessionId, payload);

  // 2. Twilio (SMS / Voice call if enabled)
  const phoneSettingsMap = await getPhoneSettingsMap([canonUserId]);
  const phoneSettings = phoneSettingsMap.get(canonUserId);
  let twilioFired = false;

  if (phoneSettings?.phoneNumber) {
    const showLabel =
      slot.mediaType === "tv" && slot.currentSeason && slot.currentEpisode
        ? `${slot.title}, Season ${slot.currentSeason}, Episode ${slot.currentEpisode}`
        : slot.title;

    if (phoneSettings.callEnabled) {
      void makeCall(
        phoneSettings.phoneNumber,
        `This is Cablecast. Your show, ${showLabel}, is starting in 10 minutes. Tune in now!`,
      ).catch((e) => console.error("[Twilio] Starting-soon call failed:", e));
      twilioFired = true;
    }
    if (phoneSettings.smsEnabled) {
      void sendSms(
        phoneSettings.phoneNumber,
        `📺 Cablecast: "${showLabel}" is starting in 10 minutes. Tune in live!`,
      ).catch((e) => console.error("[Twilio] Starting-soon SMS failed:", e));
      twilioFired = true;
    }
  }

  // 3. Telegram Instant Alert with rich poster card and inline keyboard buttons
  let telegramFired = false;
  const targetChatId = phoneSettings?.telegramChatId || getDefaultTelegramChatId();
  const isTelegramActive = phoneSettings ? phoneSettings.telegramEnabled : true;

  if (isTelegramConfigured() && targetChatId && isTelegramActive) {
    const showLabel =
      slot.mediaType === "tv" && slot.currentSeason && slot.currentEpisode
        ? `<b>${escapeHtml(slot.title)}</b> (Season ${slot.currentSeason}, Ep ${slot.currentEpisode})`
        : `<b>${escapeHtml(slot.title)}</b>`;

    const telegramCaption = `📺 <b>Showtime in 10 Minutes!</b>\n\n${showLabel}\nScheduled broadcast is about to start. Tune in live!`;

    const posterUrl = slot.posterPath
      ? slot.posterPath.startsWith("http")
        ? slot.posterPath
        : `https://image.tmdb.org/t/p/w780${slot.posterPath.startsWith("/") ? "" : "/"}${slot.posterPath}`
      : null;

    const buttons = [
      [{ text: "▶️ Tune In Live", url: "https://cablecast.tv/?view=home#schedule" }],
      [{ text: "🗓 Full TV Guide", url: "https://cablecast.tv/broadcast" }],
    ];

    if (posterUrl) {
      void sendTelegramPhoto(targetChatId, posterUrl, telegramCaption, { buttons }).catch(
        (e) => console.error("[Telegram] Starting-soon alert failed:", e),
      );
    } else {
      void sendTelegramMessage(targetChatId, telegramCaption, { buttons }).catch((e) =>
        console.error("[Telegram] Starting-soon alert failed:", e),
      );
    }
    telegramFired = true;
  }

  // 4. Record NotificationLog
  if (pushRes.sent > 0 || twilioFired || telegramFired) {
    try {
      await prisma.notificationLog.create({
        data: {
          userId: canonUserId,
          type: "STARTING_SOON",
          referenceId,
          sentAt: new Date(),
        },
      });
    } catch {
      // Non-fatal duplicate
    }
  }

  // 5. If recurring show (not rerun), schedule next week's occurrence automatically
  if (!slot.isRerun) {
    try {
      const { scheduleDelayedBroadcastAlert } = await import("./qstash");
      const nextWeekAlertTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      void scheduleDelayedBroadcastAlert({ scheduleId: slot.id, alertTime: nextWeekAlertTime });
    } catch (e) {
      console.error("[QStash] Failed to schedule next week alert:", e);
    }
  }

  return { success: true };
}

