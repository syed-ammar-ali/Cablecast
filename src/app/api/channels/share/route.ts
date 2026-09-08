import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "You must have an active broadcast session to share channels." },
        { status: 401 },
      );
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
      Boolean,
    ) as string[];

    // Fetch user's channel lineup
    const scheduleItems = await prisma.userPersonalSchedule.findMany({
      where: { sessionId: { in: userKeys } },
      orderBy: [{ dayOfWeek: "asc" }, { blockStartMinutes: "asc" }],
    });

    if (scheduleItems.length === 0) {
      return NextResponse.json(
        { error: "Your personal channel lineup is empty. Schedule broadcasts before sharing." },
        { status: 400 },
      );
    }

    // Fetch channel name
    const channelSettings = await prisma.userChannelSettings.findFirst({
      where: { sessionId: { in: userKeys } },
    });
    const channelName = channelSettings?.channelName || "Curated Broadcast Lineup";

    // Prepare snapshot
    const channelSnapshot = {
      channelName,
      sharedAt: new Date().toISOString(),
      items: scheduleItems.map((item) => ({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        backdropUrl: item.backdropUrl,
        runtimeMinutes: item.runtimeMinutes,
        dayOfWeek: item.dayOfWeek,
        blockStartMinutes: item.blockStartMinutes,
        blockCount: item.blockCount,
        currentSeason: item.currentSeason,
        currentEpisode: item.currentEpisode,
      })),
    };

    // Generate cryptographically secure token (URL-safe base64url or hex)
    const token = crypto.randomBytes(16).toString("hex");

    // 24-hour expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const shareLink = await prisma.channelShareLink.create({
      data: {
        token,
        ownerSessionId: userId,
        channelSnapshot: channelSnapshot as any,
        expiresAt,
      },
    });

    return NextResponse.json({
      token: shareLink.token,
      shareUrl: `/share/${shareLink.token}`,
      expiresAt: shareLink.expiresAt.toISOString(),
      itemCount: scheduleItems.length,
      channelName,
    });
  } catch (error) {
    console.error("[api/channels/share POST] error:", error);
    return NextResponse.json(
      { error: "Failed to generate channel share link." },
      { status: 500 },
    );
  }
}
