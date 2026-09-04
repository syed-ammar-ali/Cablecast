import { NextRequest, NextResponse } from "next/server";
import { findByImdbId, TmdbApiError } from "@/lib/tmdb";

/**
 * Resolves an IMDb ID (from an external metadata source, e.g. TVmaze) to a
 * TMDB ID + media type, so real-world broadcast listings can be played
 * through our existing on-demand player pipeline.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get("imdbId");

  if (!imdbId || !/^tt\d+$/.test(imdbId)) {
    return NextResponse.json(
      { error: "Missing or invalid `imdbId` search parameter (expected e.g. 'tt0903747')." },
      { status: 400 },
    );
  }

  try {
    const result = await findByImdbId(imdbId);
    return NextResponse.json(
      { result },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/tmdb/find] GET error:", error);
    return NextResponse.json({ error: "Unexpected error while resolving the title." }, { status: 500 });
  }
}
