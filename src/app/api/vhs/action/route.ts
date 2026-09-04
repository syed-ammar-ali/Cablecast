import { NextRequest, NextResponse } from "next/server";
import { getSession, getPersistentUserId } from "@/lib/auth/server";
import {
  checkMediaOwnership,
  createOrRenewRental,
  addLibraryItem,
  removeLibraryItem,
} from "@/lib/mediaOwnership";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const userId = getPersistentUserId(session);

    const mediaIdParam = request.nextUrl.searchParams.get("mediaId");
    if (!mediaIdParam) {
      return NextResponse.json({ error: "Missing mediaId parameter." }, { status: 400 });
    }

    const mediaId = parseInt(mediaIdParam, 10);
    if (isNaN(mediaId)) {
      return NextResponse.json({ error: "Invalid mediaId parameter." }, { status: 400 });
    }

    const seasonParam = request.nextUrl.searchParams.get("season");
    const seasonNumber = seasonParam !== null ? parseInt(seasonParam, 10) : undefined;

    const ownership = await checkMediaOwnership(
      userId,
      mediaId,
      isNaN(seasonNumber as number) ? undefined : seasonNumber
    );

    return NextResponse.json(ownership, { status: 200 });
  } catch (error) {
    console.error("[api/vhs/action] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check media status." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign-in required to rent or own VHS tapes." }, { status: 401 });
    }

    const userId = getPersistentUserId(session);
    const body = await request.json();
    const { action, mediaId, mediaType, seasonNumber, durationHours = 48, meta } = body;

    if (!action || !mediaId || !mediaType) {
      return NextResponse.json(
        { error: "Missing required fields: action, mediaId, mediaType." },
        { status: 400 }
      );
    }

    const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
    const parsedSeason = seasonNumber !== undefined && seasonNumber !== null ? Number(seasonNumber) : 0;

    // Normalize metadata for storage
    const metaForDb = meta ? {
      title: meta.title || undefined,
      posterPath: meta.posterPath || undefined,
      backdropUrl: meta.backdropUrl || undefined,
      releaseYear: meta.releaseYear != null ? String(meta.releaseYear) : undefined,
      overview: meta.overview || undefined,
      voteAverage: typeof meta.voteAverage === "number" ? meta.voteAverage : undefined,
    } : undefined;

    if (action === "RENT") {
      const rental = await createOrRenewRental(
        userId,
        numericMediaId,
        mediaType,
        durationHours,
        parsedSeason,
        metaForDb,
      );
      return NextResponse.json({
        success: true,
        action: "RENT",
        status: "RENTED",
        rental,
        expiresAt: rental.expiresAt,
        message: `Successfully rented for ${durationHours} hours!`,
      });
    }

    if (action === "BUY") {
      const libraryItem = await addLibraryItem(
        userId,
        numericMediaId,
        mediaType,
        parsedSeason,
        metaForDb,
      );
      return NextResponse.json({
        success: true,
        action: "BUY",
        status: "OWNED",
        libraryItem,
        expiresAt: null,
        message: "Added permanently to your VHS library!",
      });
    }

    if (action === "REMOVE") {
      await removeLibraryItem(userId, numericMediaId, parsedSeason);
      return NextResponse.json({
        success: true,
        action: "REMOVE",
        status: "NONE",
        message: "Removed from collection.",
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[api/vhs/action] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute VHS action." },
      { status: 500 }
    );
  }
}
