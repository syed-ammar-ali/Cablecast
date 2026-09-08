import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ channels: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    const channels = await prisma.subscribedChannel.findMany({
      where: { subscriberSessionId: { in: userKeys } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("[api/channels/subscribed GET] error:", error);
    return NextResponse.json({ error: "Failed to fetch subscribed channels." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("id");

    if (!channelId) {
      return NextResponse.json({ error: "Missing channel id." }, { status: 400 });
    }

    const existing = await prisma.subscribedChannel.findFirst({
      where: {
        id: channelId,
        subscriberSessionId: { in: userKeys },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Channel not found or not subscribed." }, { status: 404 });
    }

    await prisma.subscribedChannel.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, deletedId: channelId });
  } catch (error) {
    console.error("[api/channels/subscribed DELETE] error:", error);
    return NextResponse.json({ error: "Failed to remove subscribed channel." }, { status: 500 });
  }
}
