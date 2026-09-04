import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAdmin } from "@/lib/auth/server";
import { syncShowCodes } from "@/lib/showSync";

/* GET /api/admin/shows — list all registered shows with code counts and assigned access codes */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const shows = await prisma.registeredShow.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { episodeCodes: true } },
      accessCodes: {
        select: {
          id: true,
          code: true,
          label: true,
        },
      },
    },
  });

  return NextResponse.json({ shows });
}

/* POST /api/admin/shows — register a new show and automatically sync its episode codes */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  let body: {
    prefix?: string;
    title?: string;
    tmdbId?: number;
    channelNumber?: number;
    posterPath?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate
  if (!body.prefix || typeof body.prefix !== "string")
    return NextResponse.json({ error: "`prefix` is required." }, { status: 400 });
  if (!body.title || typeof body.title !== "string")
    return NextResponse.json({ error: "`title` is required." }, { status: 400 });
  if (!body.tmdbId || typeof body.tmdbId !== "number")
    return NextResponse.json({ error: "`tmdbId` is required." }, { status: 400 });
  if (!body.channelNumber || typeof body.channelNumber !== "number")
    return NextResponse.json({ error: "`channelNumber` is required." }, { status: 400 });

  const prefix = body.prefix.trim().toUpperCase().slice(0, 4);
  if (!/^[A-Z]+$/.test(prefix))
    return NextResponse.json({ error: "`prefix` must be letters only (A-Z)." }, { status: 400 });

  try {
    const show = await prisma.registeredShow.create({
      data: {
        prefix,
        title: body.title.trim(),
        tmdbId: body.tmdbId,
        channelNumber: body.channelNumber,
        posterPath: body.posterPath ?? null,
      },
    });

    // Automatically sync and generate all episode codes right away
    let syncResult = { codesGenerated: 0, seasonsProcessed: 0 };
    try {
      syncResult = await syncShowCodes(show.id);
    } catch (syncErr) {
      console.warn("[api/admin/shows] Automatic initial sync warning:", syncErr);
    }

    const populatedShow = await prisma.registeredShow.findUnique({
      where: { id: show.id },
      include: {
        _count: { select: { episodeCodes: true } },
        accessCodes: {
          select: {
            id: true,
            code: true,
            label: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        show: populatedShow ?? show,
        codesGenerated: syncResult.codesGenerated,
      },
      { status: 201 },
    );
  } catch (error) {
    const isUnique =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (isUnique)
      return NextResponse.json(
        { error: `Prefix "${prefix}" is already taken by another show.` },
        { status: 409 },
      );
    console.error("[api/admin/shows] POST error:", error);
    return NextResponse.json({ error: "Failed to register show." }, { status: 500 });
  }
}
