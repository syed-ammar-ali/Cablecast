import { NextRequest, NextResponse } from "next/server";
import { searchHighlightUpload } from "@/lib/sportsHighlights";

/**
 * Resolves a Sports-category World Guide broadcast to an official
 * highlights/recap upload. There is no free, legal source for a full live
 * game, so this never claims to be live — the label always makes that
 * explicit. Returns `{ embedUrl: null }` if nothing trusted turns up,
 * which is an expected, honest outcome for most sports broadcasts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const network = searchParams.get("network")?.trim() ?? "";

  if (!title) {
    return NextResponse.json(
      { error: "Missing required `title` search parameter." },
      { status: 400 },
    );
  }

  try {
    const match = await searchHighlightUpload(title, network);
    if (!match) {
      return NextResponse.json({ embedUrl: null });
    }

    return NextResponse.json({
      embedUrl: `https://www.youtube.com/embed/${match.videoId}?autoplay=1&rel=0&modestbranding=1`,
      label: "Highlights Only — Not Live",
      title: match.title,
      channelTitle: match.channelTitle,
    });
  } catch (error) {
    console.error("[api/broadcast/sports] GET error:", error);
    return NextResponse.json({ error: "Unexpected error while resolving the sports broadcast." }, { status: 500 });
  }
}
