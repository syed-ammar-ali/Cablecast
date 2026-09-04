import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/server";
import { syncShowCodes } from "@/lib/showSync";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/shows/[id]/generate
 *
 * Fetches all seasons + episodes from TMDB for the registered show,
 * then upserts EpisodeCode records: prefix + zero-padded S + zero-padded E.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;

  try {
    const result = await syncShowCodes(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/admin/shows/[id]/generate] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync show codes." },
      { status: 500 },
    );
  }
}
