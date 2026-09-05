import { NextRequest, NextResponse } from "next/server";
import { searchOfficialUpload } from "@/lib/youtube";
import type { MediaType } from "@/types/media";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const mediaType = searchParams.get("mediaType") as MediaType | null;
  const seasonParam = searchParams.get("season");
  const episodeParam = searchParams.get("episode");

  if (!title) {
    return NextResponse.json(
      { match: null, error: "Missing `title` search parameter." },
      { status: 400 },
    );
  }
  if (mediaType !== "movie" && mediaType !== "tv") {
    return NextResponse.json(
      { match: null, error: "`mediaType` must be 'movie' or 'tv'." },
      { status: 400 },
    );
  }

  const season = seasonParam ? Number(seasonParam) : undefined;
  const episode = episodeParam ? Number(episodeParam) : undefined;

  try {
    const match = await searchOfficialUpload(title, mediaType, season, episode);
    return NextResponse.json({ match });
  } catch (error) {
    console.error("[api/youtube/search] GET error:", error);
    return NextResponse.json(
      { match: null, error: "Unexpected error while searching broadcast stream." },
      { status: 500 },
    );
  }
}
