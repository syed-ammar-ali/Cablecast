import { NextRequest, NextResponse } from "next/server";
import { resolveOfficialLiveStream } from "@/lib/newsLiveChannels";
import { searchNewsArchive } from "@/lib/newsArchive";

/**
 * Resolves a News-category World Guide broadcast to a real, legal source:
 * the network's own official 24/7 YouTube live stream if we have one
 * curated and trusted, otherwise the Internet Archive's public TV News
 * Archive. Returns `{ embedUrl: null }` if neither has anything — that's
 * an expected, honest outcome, not an error.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network")?.trim() ?? "";
  const airdate = searchParams.get("airdate")?.trim() ?? "";

  if (!network) {
    return NextResponse.json(
      { error: "Missing required `network` search parameter." },
      { status: 400 },
    );
  }

  try {
    const live = await resolveOfficialLiveStream(network);
    if (live) {
      return NextResponse.json({ embedUrl: live.embedUrl, label: live.label, source: "live" });
    }

    if (airdate) {
      const archived = await searchNewsArchive(network, airdate);
      if (archived) {
        return NextResponse.json({
          embedUrl: archived.embedUrl,
          label: archived.label,
          source: "archive",
          sourceTitle: archived.sourceTitle,
        });
      }
    }

    return NextResponse.json({ embedUrl: null });
  } catch (error) {
    console.error("[api/broadcast/news] GET error:", error);
    return NextResponse.json({ error: "Unexpected error while resolving the news broadcast." }, { status: 500 });
  }
}
