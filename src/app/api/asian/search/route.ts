import { NextRequest, NextResponse } from "next/server";
import { searchKissKh, searchDramaCool } from "@/lib/asianDrama";
import type { MediaType } from "@/types/media";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const mediaType = (searchParams.get("mediaType") as MediaType) ?? "tv";
  const seasonParam = searchParams.get("season");
  const episodeParam = searchParams.get("episode");
  const provider = searchParams.get("provider") ?? "kisskh";

  if (!title) {
    return NextResponse.json(
      { match: null, error: "Missing `title` search parameter." },
      { status: 400 },
    );
  }

  const season = seasonParam ? Number(seasonParam) : undefined;
  const episode = episodeParam ? Number(episodeParam) : 1;

  try {
    let match = null;
    if (provider === "kisskh") {
      match = await searchKissKh(title, mediaType, season, episode);
    } else if (provider === "dramacool") {
      match = await searchDramaCool(title, mediaType, season, episode);
    }

    return NextResponse.json(
      { match },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("[api/asian/search] GET error:", error);
    return NextResponse.json(
      { match: null, error: "Unexpected error searching Asian drama index." },
      { status: 500 },
    );
  }
}
