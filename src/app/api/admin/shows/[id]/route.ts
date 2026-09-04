import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAdmin } from "@/lib/auth/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/* GET /api/admin/shows/[id] — get show details and its episode codes */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  try {
    const show = await prisma.registeredShow.findUnique({
      where: { id },
      include: {
        episodeCodes: {
          orderBy: [{ season: "asc" }, { episode: "asc" }],
        },
      },
    });

    if (!show) {
      return NextResponse.json({ error: "Show not found." }, { status: 404 });
    }

    return NextResponse.json({ show });
  } catch (error) {
    console.error("[api/admin/shows/[id]] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch show." }, { status: 500 });
  }
}

/* PATCH /api/admin/shows/[id] — update show prefix, channelNumber, or title */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  let body: {
    prefix?: string;
    channelNumber?: number;
    title?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data: { prefix?: string; channelNumber?: number; title?: string } = {};

  if (typeof body.prefix === "string" && body.prefix.trim()) {
    const prefix = body.prefix.trim().toUpperCase().slice(0, 4);
    if (!/^[A-Z]+$/.test(prefix)) {
      return NextResponse.json({ error: "`prefix` must be letters only (A-Z)." }, { status: 400 });
    }
    data.prefix = prefix;
  }

  if (typeof body.channelNumber === "number" && Number.isFinite(body.channelNumber)) {
    data.channelNumber = body.channelNumber;
  }

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }

  try {
    const updated = await prisma.registeredShow.update({
      where: { id },
      data,
    });
    return NextResponse.json({ show: updated });
  } catch (error) {
    const isUnique =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (isUnique) {
      return NextResponse.json({ error: "Prefix already in use." }, { status: 409 });
    }
    console.error("[api/admin/shows/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update show." }, { status: 500 });
  }
}

/* DELETE /api/admin/shows/[id] — remove a registered show and all its codes */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  try {
    await prisma.registeredShow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/admin/shows/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete show. It may not exist." },
      { status: 404 },
    );
  }
}
