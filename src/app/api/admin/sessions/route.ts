import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAdmin } from "@/lib/auth/server";
import { isSessionActive } from "@/lib/auth/validity";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const sessions = await prisma.session.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      role: true,
      displayName: true,
      deviceLabel: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      userAgent: true,
      ip: true,
      accessCode: { select: { id: true, code: true, label: true, revoked: true, expiresAt: true } },
    },
  });

  const withStatus = sessions.map((session) => ({
    ...session,
    isActive: isSessionActive(session),
  }));

  return NextResponse.json({ sessions: withStatus });
}

/** Bulk-clears every inactive or revoked session in one shot */
export async function DELETE() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  // Find all inactive sessions (directly revoked, expired, or with revoked/expired access codes)
  const allSessions = await prisma.session.findMany({
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      accessCode: { select: { revoked: true, expiresAt: true } },
    },
  });

  const inactiveIds = allSessions
    .filter((s) => !isSessionActive(s))
    .map((s) => s.id);

  let deletedCount = 0;
  if (inactiveIds.length > 0) {
    const { count } = await prisma.session.deleteMany({
      where: { id: { in: inactiveIds } },
    });
    deletedCount = count;
  }

  return NextResponse.json({ ok: true, deletedCount });
}
