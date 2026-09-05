import { NextResponse } from "next/server";
import { getTrendingMedia, TmdbApiError } from "@/lib/tmdb";

/** Powers the Live Guide's hero banner with today's trending movies/TV shows. */
export async function GET() {
  try {
    const results = await getTrendingMedia();
    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/tmdb/trending] GET error:", error);
    return NextResponse.json(
      { error: "Unexpected error while fetching trending titles." },
      { status: 500 },
    );
  }
}
