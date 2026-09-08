import { NextRequest, NextResponse } from "next/server";
import { filterSeasonalEpisodes } from "@/lib/seasonalEpisodes";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const season = searchParams.get("season");
  const era = searchParams.get("era");
  const query = searchParams.get("query");

  try {
    const episodes = filterSeasonalEpisodes({ season, era, query });

    return NextResponse.json(
      {
        page: 1,
        results: episodes,
        totalResults: episodes.length,
        totalPages: 1,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("[api/tmdb/episodes/seasonal] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected error fetching seasonal episodes." },
      { status: 500 },
    );
  }
}
