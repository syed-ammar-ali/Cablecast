import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAdmin } from "@/lib/auth/server";
import { isSessionActive } from "@/lib/auth/validity";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  const updated = await prisma.session
    .update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ session: updated });
}

/** Permanently removes a session row — only once it's disconnected/inactive, so an admin can't accidentally kick a live user by deleting them out from under it. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { accessCode: { select: { revoked: true, expiresAt: true } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (isSessionActive(session)) {
    return NextResponse.json({ error: "Disconnect the session before deleting it." }, { status: 400 });
  }

  await prisma.session.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

