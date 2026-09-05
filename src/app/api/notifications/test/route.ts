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

    const payload: PushNotificationPayload = {
      title: "🔔 Cablecast Alert Test",
      body: "Push notifications are working perfectly on your device! You'll receive alerts 10 minutes before shows.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "cablecast-test-alert",
      data: {
        url: "/broadcast",
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
