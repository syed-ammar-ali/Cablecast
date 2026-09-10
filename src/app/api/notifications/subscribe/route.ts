import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

import { VAPID_PUBLIC_KEY, sendPushNotification, type PushNotificationPayload } from "@/lib/notifications/webpush";
import { runAllNotificationDispatchers } from "@/lib/notifications/notificationDispatcher";

export async function GET() {
  try {
    const session = await getSession();
    const userId = getPersistentUserId(session);
    const publicKey = VAPID_PUBLIC_KEY;

    const userKeys = Array.from(new Set([userId, session?.id, session?.accessCodeId])).filter(Boolean) as string[];

    const activeSubscription = await prisma.pushSubscription.findFirst({
      where: { userId: { in: userKeys } },
    });

    return NextResponse.json({
      isSubscribed: Boolean(activeSubscription),
      publicKey,
    });
  } catch (error) {
    console.error("[api/notifications/subscribe] GET error:", error);
    return NextResponse.json({ error: "Failed to check subscription status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId = getPersistentUserId(session);

    const body = (await request.json()) as {
      subscription: {
        endpoint: string;
        keys: {
          p256dh: string;
          auth: string;
        };
      };
      timezone?: string;
      timezoneOffset?: number;
    };

    if (!body?.subscription?.endpoint || !body.subscription?.keys?.p256dh || !body.subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
    }

    const endpoint = body.subscription.endpoint.trim();
    const p256dh = body.subscription.keys.p256dh.trim();
    const auth = body.subscription.keys.auth.trim();
    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : null;
    const timezoneOffset = typeof body.timezoneOffset === "number" ? body.timezoneOffset : null;

    const existingSub = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });

    // Upsert subscription tied to this user with their client timezone
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId,
        p256dh,
        auth,
        timezone,
        timezoneOffset,
        updatedAt: new Date(),
      },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        timezone,
        timezoneOffset,
      },
    });

    let pushSent = false;
    let pushError: string | undefined;

    // Only dispatch welcome push if this is a newly created subscription (prevents spamming on syncs)
    if (!existingSub) {
      const welcomePayload: PushNotificationPayload = {
        title: "🔔 Cablecast Alerts Active",
        body: "Broadcast reminders are live on this device! You'll receive alerts 10 minutes before your scheduled shows air.",
        icon: "/badge-96.png",
        badge: "/badge-96.png",
        tag: "cablecast-welcome-alert",
        renotify: true,
        data: {
          url: "/?view=home#schedule",
          type: "STARTING_SOON",
        },
      };

      try {
        const res = await sendPushNotification(
          {
            endpoint,
            p256dh,
            auth,
          },
          welcomePayload,
        );
        pushSent = res.success;
        pushError = res.error;
      } catch (pushErr: unknown) {
        pushError = pushErr instanceof Error ? pushErr.message : "Delivery failed";
        console.warn("[api/notifications/subscribe] Welcome alert delivery warning:", pushErr);
      }
    }

    // Trigger dispatcher check in the background for any shows currently starting soon
    void runAllNotificationDispatchers().catch((e) => {
      console.warn("[api/notifications/subscribe] Background dispatcher check error:", e);
    });

    return NextResponse.json({
      success: true,
      message: "Subscription saved successfully.",
      notificationSent: pushSent,
      notificationError: pushError,
    });
  } catch (error) {
    console.error("[api/notifications/subscribe] POST error:", error);
    return NextResponse.json({ error: "Failed to register subscription." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { endpoint?: string };

    if (!body?.endpoint) {
      return NextResponse.json({ error: "Endpoint required to unsubscribe." }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint },
    });

    return NextResponse.json({ success: true, message: "Unsubscribed successfully." });
  } catch (error) {
    console.error("[api/notifications/subscribe] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete subscription." }, { status: 500 });
  }
}
