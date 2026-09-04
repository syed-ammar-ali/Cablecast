import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId } from "@/lib/auth/server";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ favorites: [] });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];

    const favorites = await prisma.userFavorite.findMany({
      where: { sessionId: { in: userKeys } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error("[api/library/favorites] GET error:", error);
    return NextResponse.json({ favorites: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const body = await req.json();

    const {
      tmdbId,
      mediaType,
      title,
      posterPath,
      backdropUrl,
      releaseYear,
      overview,
      voteAverage,
    } = body;

    if (!tmdbId || !mediaType || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedTmdbId = Number(tmdbId);

    const favorite = await prisma.userFavorite.upsert({
      where: {
        sessionId_tmdbId_mediaType: {
          sessionId: userId,
          tmdbId: parsedTmdbId,
          mediaType,
        },
      },
      update: {
        title,
        posterPath: posterPath ?? null,
        backdropUrl: backdropUrl ?? null,
        releaseYear: releaseYear ?? null,
        overview: overview ?? null,
        voteAverage: voteAverage ? Number(voteAverage) : null,
      },
      create: {
        sessionId: userId,
        tmdbId: parsedTmdbId,
        mediaType,
        title,
        posterPath: posterPath ?? null,
        backdropUrl: backdropUrl ?? null,
        releaseYear: releaseYear ?? null,
        overview: overview ?? null,
        voteAverage: voteAverage ? Number(voteAverage) : null,
      },
    });

    return NextResponse.json({ favorite });
  } catch (error) {
    console.error("[api/library/favorites] POST error:", error);
    return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get("tmdbId");
    const mediaType = searchParams.get("mediaType");

    if (!tmdbId || !mediaType) {
      return NextResponse.json({ error: "Missing tmdbId or mediaType" }, { status: 400 });
    }

    await prisma.userFavorite.deleteMany({
      where: {
        sessionId: { in: userKeys },
        tmdbId: Number(tmdbId),
        mediaType,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/library/favorites] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete favorite" }, { status: 500 });
  }
}
