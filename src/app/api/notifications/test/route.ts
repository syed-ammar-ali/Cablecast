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

    let reqBody: { endpoint?: string } = {};
    try {
      reqBody = await request.json();
    } catch {
      reqBody = {};
    }

    const userKeys = Array.from(
      new Set([userId, session?.id, session?.accessCodeId]),
    ).filter(Boolean) as string[];

    let subscriptions: any[] = [];

    // 1. If an explicit endpoint was sent from the client, target it directly
    if (reqBody.endpoint) {
      const explicitSub = await prisma.pushSubscription.findUnique({
        where: { endpoint: reqBody.endpoint },
      });
      if (explicitSub) {
        subscriptions = [explicitSub];
      }
    }

    // 2. Otherwise query subscriptions by user session keys
    if (subscriptions.length === 0 && userKeys.length > 0) {
      subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: { in: userKeys } },
      });
    }

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

    const title = "📺 Showtime in 10 Minutes";
    let body = "Scheduled broadcast is about to air on your channel. Tap to tune in live!";
    let image: string | undefined = undefined;

    if (scheduledShow) {
      const showTitle = scheduledShow.title;
      if (scheduledShow.mediaType === "tv" && scheduledShow.currentSeason && scheduledShow.currentEpisode) {
        body = `"${showTitle}" · Season ${scheduledShow.currentSeason}, Ep ${scheduledShow.currentEpisode}\nScheduled broadcast is about to start. Tune in live!`;
      } else {
        body = `"${showTitle}"\nScheduled broadcast is about to start on your channel. Tune in live!`;
      }

      if (scheduledShow.posterPath) {
        const clean = scheduledShow.posterPath.startsWith("/") ? scheduledShow.posterPath : `/${scheduledShow.posterPath}`;
        image = scheduledShow.posterPath.startsWith("http") ? scheduledShow.posterPath : `https://image.tmdb.org/t/p/w780${clean}`;
      }
    }

    const payload: PushNotificationPayload = {
      title,
      body,
      image,
      icon: "/badge-96.png",
      badge: "/badge-96.png",
      tag: "cablecast-test-alert",
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "tune-in", title: "▶ Tune In" },
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
