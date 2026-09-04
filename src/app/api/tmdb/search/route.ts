import { NextRequest, NextResponse } from "next/server";
import { searchMedia, TmdbApiError } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  if (!query) {
    return NextResponse.json(
      { error: "Missing required `query` search parameter." },
      { status: 400 },
    );
  }

  try {
    const results = await searchMedia(query, page);
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof TmdbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/tmdb/search] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected error while searching TMDB." },
      { status: 500 },
    );
  }
}
