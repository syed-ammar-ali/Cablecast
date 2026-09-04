import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/server";
import { EpisodeCodeLookupSchema } from "@/lib/validation/schemas";

/**
 * GET /api/codes/lookup?code=F0101
 *
 * Resolves an episode code to show title, broadcast air date, and channel number.
 * Verifies that the viewer's access code has permission to tune into this show.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get("code") || "";

  const parseResult = EpisodeCodeLookupSchema.safeParse({ code: rawCode });
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "`code` query param is required.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const code = parseResult.data.code.toUpperCase();

  const entry = await prisma.episodeCode.findUnique({
    where: { code },
    include: {
      show: {
        select: {
          id: true,
          title: true,
          prefix: true,
          channelNumber: true,
          posterPath: true,
        },
      },
    },
  });

  if (!entry) {
    return NextResponse.json(
      { error: `Code "${code}" not found. Check the code and try again.` },
      { status: 404 },
    );
  }

  // Check if viewer has restricted show access
  const session = await getSession();
  if (session?.accessCodeId && session.role !== "admin") {
    const accessCode = await prisma.accessCode.findUnique({
      where: { id: session.accessCodeId },
      include: { assignedShows: { select: { id: true } } },
    });

    if (accessCode && accessCode.assignedShows.length > 0) {
      const isAllowed = accessCode.assignedShows.some((s) => s.id === entry.show.id);
      if (!isAllowed) {
        return NextResponse.json(
          { error: `"${entry.show.title}" is not available with your access code.` },
          { status: 403 },
        );
      }
    }
  }

  return NextResponse.json({
    code: entry.code,
    showTitle: entry.show.title,
    showPrefix: entry.show.prefix,
    channelNumber: entry.show.channelNumber,
    posterPath: entry.show.posterPath,
    season: entry.season,
    episode: entry.episode,
    episodeTitle: entry.episodeTitle,
    airDate: entry.airDate,
  });
}
