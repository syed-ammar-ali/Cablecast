import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAdmin } from "@/lib/auth/server";

interface PatchBody {
  revoked?: boolean;
  label?: string;
  showIds?: string[];
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updateData: {
    revoked?: boolean;
    revokedAt?: Date | null;
    label?: string;
    assignedShows?: { set: { id: string }[] };
  } = {};

  if (typeof body.revoked === "boolean") {
    updateData.revoked = body.revoked;
    updateData.revokedAt = body.revoked ? new Date() : null;

    // Immediately cascade revocation to all sessions using this code so live devices
    // are terminated on their very next request without requiring manual individual session disconnection.
    await prisma.session.updateMany({
      where: { accessCodeId: id },
      data: { revokedAt: body.revoked ? new Date() : null },
    });
  }

  if (typeof body.label === "string") {
    updateData.label = body.label.trim().slice(0, 80);
  }

  if (Array.isArray(body.showIds)) {
    updateData.assignedShows = {
      set: body.showIds.map((showId) => ({ id: showId })),
    };
  }

  const updated = await prisma.accessCode
    .update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { sessions: true } },
        assignedShows: {
          select: {
            id: true,
            prefix: true,
            title: true,
            channelNumber: true,
          },
        },
      },
    })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Code not found." }, { status: 404 });
  }

  return NextResponse.json({ code: updated });
}

/** Permanently removes a revoked access code. Linked sessions are permanently revoked to prevent unauthenticated access. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  const code = await prisma.accessCode.findUnique({ where: { id }, select: { revoked: true } });
  if (!code) {
    return NextResponse.json({ error: "Code not found." }, { status: 404 });
  }
  if (!code.revoked) {
    return NextResponse.json({ error: "Revoke the code before deleting it." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.session.updateMany({
      where: { accessCodeId: id },
      data: { accessCodeId: null, revokedAt: new Date() },
    }),
    prisma.accessCode.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
