import { NextRequest, NextResponse } from "next/server";
import { resolveStreamPipeline, type StreamCategory } from "@/lib/streamResolver";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tmdbId = searchParams.get("tmdbId");
  const type = searchParams.get("type") as "movie" | "tv" | null;
  const season = searchParams.get("season") ? parseInt(searchParams.get("season")!, 10) : undefined;
  const episode = searchParams.get("episode") ? parseInt(searchParams.get("episode")!, 10) : undefined;
  const title = searchParams.get("title") || undefined;
  const category = (searchParams.get("category") as StreamCategory) || "general";

  if (!tmdbId || !type) {
    return NextResponse.json(
      { error: "Missing required query params: tmdbId and type." },
      { status: 400 },
    );
  }

  try {
    const stream = await resolveStreamPipeline({
      tmdbId,
      type,
      season,
      episode,
      title,
      category,
    });

    return NextResponse.json({
      ok: true,
      stream,
    });
  } catch (error) {
    console.error("[api/stream/resolve] Resolution error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve stream" },
      { status: 500 },
    );
  }
}
