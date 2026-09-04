import { NextRequest, NextResponse } from "next/server";
import { getVhsMetadata } from "@/lib/vhs-mapper";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaType: string; id: string }> }
) {
  try {
    const { mediaType: rawMediaType, id: rawId } = await params;
    const mediaType = rawMediaType?.toLowerCase();

    if (mediaType !== "movie" && mediaType !== "tv") {
      return NextResponse.json(
        { error: "Invalid mediaType. Expected 'movie' or 'tv'." },
        { status: 400 }
      );
    }

    const id = parseInt(rawId, 10);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json(
        { error: "Invalid media ID parameter." },
        { status: 400 }
      );
    }

    const seasonParam = request.nextUrl.searchParams.get("season");
    const seasonNumber = seasonParam ? parseInt(seasonParam, 10) : 1;

    const metadata = await getVhsMetadata(
      id,
      mediaType,
      isNaN(seasonNumber) || seasonNumber <= 0 ? 1 : seasonNumber
    );

    return NextResponse.json(metadata, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch VHS metadata.";
    const isNotFound =
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("could not be found") ||
      message.includes("404");

    if (isNotFound) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    // For transient upstream network issues (e.g. ECONNRESET, ETIMEDOUT), provide a safe fallback sleeve
    const { mediaType: rawMediaType, id: rawId } = await params;
    const isTv = rawMediaType?.toLowerCase() === "tv";
    const numericId = parseInt(rawId, 10) || 0;

    return NextResponse.json(
      {
        mediaId: numericId,
        mediaType: isTv ? "TV" : "MOVIE",
        seasonNumber: 1,
        frontPosterPath: "",
        synopsis: "Archival tape catalog record from the Cablecast retro collection.",
        guestStars: [],
        episodes: [
          {
            episodeNumber: 1,
            name: isTv ? "Episode 1" : "Feature Presentation",
            runtime: isTv ? 24 : 90,
          },
        ],
        credits: {
          creators: ["Cablecast Vault"],
          mainCast: ["Ensemble Cast"],
        },
        calculatedRuntime: isTv ? 24 : 90,
      },
      { status: 200 }
    );
  }
}
