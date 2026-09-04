import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAdmin } from "@/lib/auth/server";
import { generateAccessCode } from "@/lib/auth/tokens";
import { AdminCreateCodeSchema } from "@/lib/validation/schemas";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: "desc" },
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
  });

  return NextResponse.json({ codes });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  let rawJson: unknown = {};
  try {
    rawJson = await request.json();
  } catch {
    // Empty body is fine — all fields are optional.
  }

  const parseResult = AdminCreateCodeSchema.safeParse(rawJson);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "Invalid payload format.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const { label, expiresAt: expiresAtStr, maxUses, maxDevices, showIds = [] } = parseResult.data;
  const expiresAt = expiresAtStr ? new Date(expiresAtStr) : null;

  // Collisions are astronomically unlikely (32^8 space) but retry once or
  // twice rather than surfacing a 500 in that edge case.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateAccessCode();
    try {
      const created = await prisma.accessCode.create({
        data: {
          code,
          label,
          expiresAt,
          maxUses,
          maxDevices,
          assignedShows: showIds.length > 0 ? { connect: showIds.map((id) => ({ id })) } : undefined,
        },
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
      });
      return NextResponse.json({ code: created }, { status: 201 });
    } catch (error) {
      const isUniqueViolation =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
      if (!isUniqueViolation) throw error;
    }
  }

  return NextResponse.json({ error: "Could not generate a unique code, try again." }, { status: 500 });
}
