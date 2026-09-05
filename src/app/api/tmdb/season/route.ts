import { NextRequest, NextResponse } from "next/server";
import { getSeasonEpisodes, TmdbApiError } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("tmdbId");
  const season = Number(searchParams.get("season") ?? "");

  if (!tmdbId || !Number.isFinite(season) || season < 0) {
    return NextResponse.json(
      { error: "Missing or invalid `id` / `season` search parameters." },
      { status: 400 },
    );
  }

  try {
    const episodes = await getSeasonEpisodes(tmdbId, season);
    return NextResponse.json({ episodes });
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/tmdb/season] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected error while fetching season episodes." },
      { status: 500 },
    );
  }
}
