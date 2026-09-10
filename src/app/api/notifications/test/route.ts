import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/server";
import { sendPushNotification } from "@/lib/notifications/webpush";
import type { PushNotificationPayload } from "@/lib/notifications/webpush";

export const dynamic = "force-dynamic";

interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends an immediate test push notification.
 * STRICTLY RESTRICTED TO ADMIN MODE.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Admin authentication required. Test notifications are strictly restricted to admin mode.",
        },
        { status: 403 },
      );
    }

    let reqBody: {
      endpoint?: string;
      subscription?: {
        endpoint: string;
        keys: { p256dh?: string; auth?: string };
      };
      broadcast?: boolean;
    } = {};

    try {
      reqBody = await request.json();
    } catch {
      reqBody = {};
    }

    // Auto-heal: If the admin's browser sent valid subscription keys directly,
    // ensure this admin device is registered in the database immediately.
    if (
      reqBody.subscription?.endpoint &&
      reqBody.subscription.keys?.p256dh &&
      reqBody.subscription.keys?.auth
    ) {
      await prisma.pushSubscription.upsert({
        where: { endpoint: reqBody.subscription.endpoint },
        update: {
          userId: "admin",
          p256dh: reqBody.subscription.keys.p256dh,
          auth: reqBody.subscription.keys.auth,
          updatedAt: new Date(),
        },
        create: {
          userId: "admin",
          endpoint: reqBody.subscription.endpoint,
          p256dh: reqBody.subscription.keys.p256dh,
          auth: reqBody.subscription.keys.auth,
        },
      });
    }

    let subscriptions: PushSubscriptionRecord[] = [];

    if (reqBody.broadcast) {
      // Broadcast mode: target all active subscriber devices
      subscriptions = await prisma.pushSubscription.findMany();
    } else if (reqBody.endpoint) {
      // Target specific endpoint
      const explicitSub = await prisma.pushSubscription.findUnique({
        where: { endpoint: reqBody.endpoint },
      });
      if (explicitSub) {
        subscriptions = [explicitSub];
      }
    }

    // Fallback: target any active admin subscriptions
    if (subscriptions.length === 0) {
      subscriptions = await prisma.pushSubscription.findMany({
        where: {
          OR: [{ userId: "admin" }, { userId: session.id }],
        },
      });
    }

    // If still none, check if there's any subscription in the database at all
    if (subscriptions.length === 0) {
      const anySub = await prisma.pushSubscription.findFirst({
        orderBy: { updatedAt: "desc" },
      });
      if (anySub) {
        subscriptions = [anySub];
      }
    }

    if (subscriptions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No active push subscriptions found. Please click 'Enable Alerts' on this device first to generate a browser push token.",
        },
        { status: 404 },
      );
    }

    // Look for a scheduled show to use real artwork
    const scheduledShow = await prisma.userPersonalSchedule.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const title = "📺 Cablecast Showtime in 10 Minutes";
    let body = "Broadcast is about to air on your station. Tap to tune in live!";
    let image: string | undefined = undefined;

    if (scheduledShow) {
      const showTitle = scheduledShow.title;
      if (
        scheduledShow.mediaType === "tv" &&
        scheduledShow.currentSeason &&
        scheduledShow.currentEpisode
      ) {
        body = `"${showTitle}" · Season ${scheduledShow.currentSeason}, Ep ${scheduledShow.currentEpisode}\nLive broadcast starts in 10 minutes. Tune in live!`;
      } else {
        body = `"${showTitle}"\nScheduled broadcast starts in 10 minutes on your channel. Tune in live!`;
      }

      if (scheduledShow.posterPath) {
        const clean = scheduledShow.posterPath.startsWith("/")
          ? scheduledShow.posterPath
          : `/${scheduledShow.posterPath}`;
        image = scheduledShow.posterPath.startsWith("http")
          ? scheduledShow.posterPath
          : `https://image.tmdb.org/t/p/w780${clean}`;
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
        url: "/home",
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
      totalTargets: subscriptions.length,
      errors: errors.length > 0 ? errors : undefined,
      message:
        sent > 0
          ? `Successfully delivered test alert to ${sent} device(s).`
          : `Failed to deliver test alert: ${errors[0] || "Unknown push error."}`,
    });
  } catch (error) {
    console.error("[api/notifications/test] Error sending test notification:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error dispatching test alert.", details: String(error) },
      { status: 500 },
    );
  }
}
