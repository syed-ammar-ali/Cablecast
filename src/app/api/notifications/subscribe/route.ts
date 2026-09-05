import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

export async function GET() {
  try {
    const session = await getSession();
    const userId = getPersistentUserId(session);
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

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
    };

    if (!body?.subscription?.endpoint || !body.subscription?.keys?.p256dh || !body.subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
    }

    const { endpoint, keys } = body.subscription;

    // Upsert subscription tied to this user
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updatedAt: new Date(),
      },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return NextResponse.json({ success: true, message: "Subscription saved successfully." });
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
