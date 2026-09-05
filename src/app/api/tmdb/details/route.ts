import { NextRequest, NextResponse } from "next/server";
import { getMediaDetails, TmdbApiError } from "@/lib/tmdb";
import { TmdbDetailsQuerySchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawTmdbId = searchParams.get("tmdbId") || "";
  const rawMediaType = searchParams.get("mediaType") || "";

  const parseResult = TmdbDetailsQuerySchema.safeParse({
    tmdbId: rawTmdbId,
    mediaType: rawMediaType,
  });

  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "Missing or invalid `tmdbId` / `mediaType` search parameters.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const { tmdbId, mediaType } = parseResult.data;

  try {
    const details = await getMediaDetails(tmdbId, mediaType);
    return NextResponse.json(details, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/tmdb/details] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected error while fetching media details." },
      { status: 500 },
    );
  }
}
