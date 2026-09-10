import { NextRequest, NextResponse } from "next/server";
import { discoverMedia, TmdbApiError } from "@/lib/tmdb";

const ERA_RANGES: Record<string, [number, number]> = {
  "70s": [1970, 1979],
  "80s": [1980, 1989],
  "90s": [1990, 1999],
  "00s": [2000, 2009],
  "10s": [2010, 2019],
  "20s": [2020, 2029],
};

function computeDateBounds(
  season?: string | null,
  era?: string | null,
  customFrom?: string | null,
  customTo?: string | null,
): { dateFrom?: string; dateTo?: string } {
  if (customFrom || customTo) {
    return {
      dateFrom: customFrom || undefined,
      dateTo: customTo || undefined,
    };
  }

  const eraBounds = era ? ERA_RANGES[era.toLowerCase()] : null;
  const currentYear = new Date().getFullYear();

  if (eraBounds && season) {
    const [startYear, endYear] = eraBounds;
    switch (season.toLowerCase()) {
      case "fall":
      case "autumn":
        return { dateFrom: `${startYear}-09-01`, dateTo: `${endYear}-11-30` };
      case "winter":
        return { dateFrom: `${startYear}-12-01`, dateTo: `${endYear + 1}-02-28` };
      case "spring":
        return { dateFrom: `${startYear}-03-01`, dateTo: `${endYear}-05-31` };
      case "summer":
        return { dateFrom: `${startYear}-06-01`, dateTo: `${endYear}-08-31` };
      case "monsoon":
      case "rainy":
        return { dateFrom: `${startYear}-06-15`, dateTo: `${endYear}-09-30` };
    }
  }

  if (eraBounds) {
    const [startYear, endYear] = eraBounds;
    return { dateFrom: `${startYear}-01-01`, dateTo: `${endYear}-12-31` };
  }

  if (season) {
    const year = currentYear - 1; // Default to recent seasons
    switch (season.toLowerCase()) {
      case "fall":
      case "autumn":
        return { dateFrom: `${year}-09-01`, dateTo: `${currentYear}-11-30` };
      case "winter":
        return { dateFrom: `${year}-12-01`, dateTo: `${currentYear}-02-28` };
      case "spring":
        return { dateFrom: `${year}-03-01`, dateTo: `${currentYear}-05-31` };
      case "summer":
        return { dateFrom: `${year}-06-01`, dateTo: `${currentYear}-08-31` };
      case "monsoon":
      case "rainy":
        return { dateFrom: `${year}-06-15`, dateTo: `${currentYear}-09-30` };
    }
  }

  return {};
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mediaType = (searchParams.get("type") || searchParams.get("mediaType") || "all") as
    | "all"
    | "movie"
    | "tv";
  const genres = searchParams.get("genres") || undefined;
  const season = searchParams.get("season");
  const era = searchParams.get("era");
  const customFrom = searchParams.get("dateFrom");
  const customTo = searchParams.get("dateTo");
  const sortBy = searchParams.get("sortBy") || "popularity.desc";
  const voteAverageGte = searchParams.has("voteAverageGte")
    ? Number(searchParams.get("voteAverageGte"))
    : undefined;
  const voteAverageLte = searchParams.has("voteAverageLte")
    ? Number(searchParams.get("voteAverageLte"))
    : undefined;
  const language = searchParams.get("language") || undefined;
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  const { dateFrom, dateTo } = computeDateBounds(season, era, customFrom, customTo);

  try {
    const results = await discoverMedia({
      mediaType,
      genres,
      dateFrom,
      dateTo,
      sortBy,
      voteAverageGte,
      voteAverageLte,
      language,
      page,
    });

    return NextResponse.json(results, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/tmdb/discover] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected error while discovering broadcast catalog." },
      { status: 500 },
    );
  }
}
