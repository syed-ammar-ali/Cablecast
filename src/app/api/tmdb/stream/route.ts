import { NextRequest, NextResponse } from "next/server";
import { resolveStream } from "@/lib/streamResolver";
import type { MediaType } from "@/types/media";

/**
 * Resolves a direct, playable stream URL for the native ad-free player.
 *
 * This route never talks to third-party embed sites (VidSrc/VidLink/etc.) —
 * see `src/lib/streamResolver.ts` for why. It only proxies to a
 * self-configured, licensed `STREAM_RESOLVER_URL`. Client code should treat
 * `{ success: false }` as "fall back to the embed provider chain", not as
 * a hard error.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("tmdbId");
  const mediaType = searchParams.get("type") as MediaType | null;
  const seasonParam = searchParams.get("season");
  const episodeParam = searchParams.get("episode");

  if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid media identification parameters." },
      { status: 400 },
    );
  }

  const season = seasonParam ? Number(seasonParam) : undefined;
  const episode = episodeParam ? Number(episodeParam) : undefined;

  if (mediaType === "tv" && (season === undefined || episode === undefined)) {
    return NextResponse.json(
      { success: false, error: "TV lookups require both `season` and `episode`." },
      { status: 400 },
    );
  }

  try {
    const result = await resolveStream({ tmdbId, mediaType, season, episode });
    if (
      result.success &&
      result.type === "hls" &&
      (result.streamUrl.includes(".m3u8") || result.streamUrl.includes(".mp4"))
    ) {
      return NextResponse.json(result, { status: 200 });
    }
    return NextResponse.json(
      { success: false, error: "No direct HLS stream available. Falling back to embed player." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/tmdb/stream] unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected error while resolving stream." },
      { status: 500 },
    );
  }
}
