import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

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

    const snapshot = shareLink.channelSnapshot as any;
    const items = snapshot?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "The shared channel package contains no broadcast items." },
        { status: 400 },
      );
    }

    let importedCount = 0;

    for (const item of items) {
      // Check if user already has an appointment in this exact slot
      const existing = await prisma.userPersonalSchedule.findFirst({
        where: {
          sessionId: { in: userKeys },
          dayOfWeek: item.dayOfWeek,
          blockStartMinutes: item.blockStartMinutes,
        },
      });

      if (!existing) {
        await prisma.userPersonalSchedule.create({
          data: {
            sessionId: userId,
            tmdbId: Number(item.tmdbId),
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath || null,
            backdropUrl: item.backdropUrl || null,
            runtimeMinutes: item.runtimeMinutes ? Number(item.runtimeMinutes) : null,
            dayOfWeek: Number(item.dayOfWeek),
            blockStartMinutes: Number(item.blockStartMinutes),
            blockCount: Number(item.blockCount || 1),
            currentSeason: Number(item.currentSeason || 1),
            currentEpisode: Number(item.currentEpisode || 1),
          },
        });
        importedCount++;
      }
    }

    // Mark as used
    await prisma.channelShareLink.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      importedCount,
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
