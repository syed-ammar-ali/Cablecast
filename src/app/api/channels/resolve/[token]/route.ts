import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required to view shared broadcast channels." },
        { status: 401 },
      );
    }

    const { token } = await context.params;
    if (!token) {
      return NextResponse.json({ error: "Missing token parameter." }, { status: 400 });
    }

    const shareLink = await prisma.channelShareLink.findUnique({
      where: { token },
    });

    if (!shareLink) {
      return NextResponse.json(
        { error: "This channel share link does not exist or has been removed." },
        { status: 404 },
      );
    }

    const now = new Date();
    if (now > shareLink.expiresAt) {
      return NextResponse.json(
        { error: "This channel share link has expired (valid for 24 hours)." },
        { status: 410 },
      );
    }

    return NextResponse.json({
      valid: true,
      token: shareLink.token,
      isClaimed: Boolean(shareLink.usedAt),
      usedAt: shareLink.usedAt ? shareLink.usedAt.toISOString() : null,
      expiresAt: shareLink.expiresAt.toISOString(),
      snapshot: shareLink.channelSnapshot,
    });
  } catch (error) {
    console.error("[api/channels/resolve GET] error:", error);
    return NextResponse.json(
      { error: "Failed to resolve channel share link." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "You must have an active session to import channels." },
        { status: 401 },
      );
    }

    const userId = getPersistentUserId(session);

    const { token } = await context.params;
    if (!token) {
      return NextResponse.json({ error: "Missing token parameter." }, { status: 400 });
    }

    const shareLink = await prisma.channelShareLink.findUnique({
      where: { token },
    });

    if (!shareLink) {
      return NextResponse.json(
        { error: "Share link not found." },
        { status: 404 },
      );
    }

    if (new Date() > shareLink.expiresAt) {
      return NextResponse.json(
        { error: "This share link has expired." },
        { status: 410 },
      );
    }

    const snapshot = shareLink.channelSnapshot as {
      channelName?: string;
      items?: unknown[];
    } | null;
    const channelName = snapshot?.channelName?.trim() || "Shared Lineup";
    const items = snapshot?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "The shared channel package contains no broadcast items." },
        { status: 400 },
      );
    }

    // Upsert SubscribedChannel for the recipient as an independent channel
    const subscribedChannel = await prisma.subscribedChannel.upsert({
      where: {
        subscriberSessionId_channelName: {
          subscriberSessionId: userId,
          channelName,
        },
      },
      create: {
        subscriberSessionId: userId,
        channelName,
        shareToken: token,
        ownerSessionId: shareLink.ownerSessionId,
        scheduleSnapshot: items as unknown as Prisma.InputJsonValue,
      },
      update: {
        shareToken: token,
        scheduleSnapshot: items as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    // Mark as used
    await prisma.channelShareLink.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      channelId: subscribedChannel.id,
      channelName: subscribedChannel.channelName,
      importedCount: items.length,
      totalOffered: items.length,
    });
  } catch (error) {
    console.error("[api/channels/resolve POST] error:", error);
    return NextResponse.json(
      { error: "Failed to import shared channels." },
      { status: 500 },
    );
  }
}

