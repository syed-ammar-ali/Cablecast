import { NextRequest, NextResponse } from "next/server";
import { searchKimCartoon, searchGogoAnime, searchKartoonsMe } from "@/lib/cartoons";
import type { MediaType } from "@/types/media";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const mediaType = (searchParams.get("mediaType") as MediaType) ?? "tv";
  const seasonParam = searchParams.get("season");
  const episodeParam = searchParams.get("episode");
  const provider = searchParams.get("provider") ?? "kartoons";

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
    if (provider === "kartoons") {
      match = await searchKartoonsMe(title, mediaType, season, episode);
    } else if (provider === "kimcartoon") {
      match = await searchKimCartoon(title, mediaType, season, episode);
    } else if (provider === "gogoanime") {
      match = await searchGogoAnime(title, mediaType, season, episode);
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
    console.error("[api/cartoons/search] GET error:", error);
    return NextResponse.json(
      { match: null, error: "Unexpected error searching cartoon index." },
      { status: 500 },
    );
  }
}
