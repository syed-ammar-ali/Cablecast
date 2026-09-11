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

  const currentYear = new Date().getFullYear();

  // Multi-era resolution
  const eraList = era ? era.toLowerCase().split(/[,|]/).filter(Boolean) : [];
  const eraBoundsList = eraList.map((e) => ERA_RANGES[e]).filter(Boolean) as [number, number][];

  let startYear: number | undefined;
  let endYear: number | undefined;

  if (eraBoundsList.length > 0) {
    startYear = Math.min(...eraBoundsList.map(([start]) => start));
    endYear = Math.max(...eraBoundsList.map(([, end]) => end));
  }

  const seasonList = season ? season.toLowerCase().split(/[,|]/).filter(Boolean) : [];

  if (seasonList.length > 0) {
    const sYear = startYear ?? (currentYear - 1);
    const eYear = endYear ?? currentYear;

    // Determine month bounds across all selected seasons
    const SEASON_MONTHS: Record<string, { startM: string; endM: string; rollEndYear?: boolean }> = {
      fall: { startM: "09-01", endM: "11-30" },
      autumn: { startM: "09-01", endM: "11-30" },
      winter: { startM: "12-01", endM: "02-28", rollEndYear: true },
      spring: { startM: "03-01", endM: "05-31" },
      summer: { startM: "06-01", endM: "08-31" },
      monsoon: { startM: "06-15", endM: "09-30" },
      rainy: { startM: "06-15", endM: "09-30" },
    };

    const validConfigs = seasonList.map((s) => SEASON_MONTHS[s]).filter(Boolean);
    if (validConfigs.length > 0) {
      // If full year or multiple spanning seasons, clamp safely
      const hasWinter = seasonList.includes("winter");
      const effectiveEndYear = hasWinter ? eYear + 1 : eYear;

      // Find earliest start date and latest end date
      const minStartM = validConfigs.reduce((min, cur) => cur.startM < min ? cur.startM : min, "12-31");
      const maxEndM = validConfigs.reduce((max, cur) => cur.endM > max ? cur.endM : max, "01-01");

      return {
        dateFrom: `${sYear}-${minStartM}`,
        dateTo: `${effectiveEndYear}-${maxEndM}`,
      };
    }
  }

  if (startYear !== undefined && endYear !== undefined) {
    return {
      dateFrom: `${startYear}-01-01`,
      dateTo: `${endYear}-12-31`,
    };
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
