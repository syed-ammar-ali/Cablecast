import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import { sendPushNotification } from "@/lib/notifications/webpush";
import type { PushNotificationPayload } from "@/lib/notifications/webpush";

export const dynamic = "force-dynamic";

/**
 * Sends an immediate test push notification to all active devices registered
 * to the current session / viewer.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId = getPersistentUserId(session);

    const userKeys = Array.from(
      new Set([userId, session?.id, session?.accessCodeId]),
    ).filter(Boolean) as string[];

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: userKeys } },
    });

    if (subscriptions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active push subscriptions found on this device. Please tap 'Enable Alerts' first.",
        },
        { status: 404 },
      );
    }

    // Look for an existing scheduled show to showcase real artwork on the test notification
    const scheduledShow = await prisma.userPersonalSchedule.findFirst({
      where: { sessionId: { in: userKeys } },
      orderBy: { updatedAt: "desc" },
    });

    let title = "🔔 Cablecast Alert Test";
    let body = "Push notifications are active! You'll receive alerts with show artwork 10 minutes before broadcasts.";
    let icon = "/icon-192.png";

    if (scheduledShow) {
      const epDetails = scheduledShow.mediaType === "tv" ? ` (S${scheduledShow.currentSeason}:E${scheduledShow.currentEpisode})` : "";
      body = `Alerts active! "${scheduledShow.title}"${epDetails} is programmed on your TV lineup.`;
      if (scheduledShow.posterPath) {
        const clean = scheduledShow.posterPath.startsWith("/") ? scheduledShow.posterPath : `/${scheduledShow.posterPath}`;
        icon = scheduledShow.posterPath.startsWith("http") ? scheduledShow.posterPath : `https://image.tmdb.org/t/p/w500${clean}`;
      }
    }

    const payload: PushNotificationPayload = {
      title,
      body,
      icon,
      badge: "/icon-maskable-192.png",
      tag: "cablecast-test-alert",
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "tune-in", title: "📺 Open Guide" },
        { action: "dismiss", title: "Dismiss" },
      ],
      data: {
        url: "/?view=home#schedule",
        type: "STARTING_SOON",
      },
    };

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

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
        if (res.error) errors.push(res.error);
        if (res.shouldRemove) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }

    return NextResponse.json({
      success: sent > 0,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      message:
        sent > 0
          ? `Successfully delivered test alert to ${sent} device(s).`
          : "Failed to deliver alert to registered devices.",
    });
  } catch (error) {
    console.error("[api/notifications/test] Error sending test notification:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error dispatching test alert.", details: String(error) },
      { status: 500 },
    );
  }
}
