import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/server";

/**
 * GET /api/codes/shows
 *
 * Returns the list of registered shows available to the current viewer.
 * If the viewer is signed in with an access code that has specific shows assigned,
 * only those assigned shows are returned. Admins and full-access codes see all shows.
 */
export async function GET() {
  const session = await getSession();

  let assignedShowIds: string[] | null = null;

  if (session?.accessCodeId && session.role !== "admin") {
    const accessCode = await prisma.accessCode.findUnique({
      where: { id: session.accessCodeId },
      include: { assignedShows: { select: { id: true } } },
    });

    if (accessCode && accessCode.assignedShows.length > 0) {
      assignedShowIds = accessCode.assignedShows.map((s) => s.id);
    }
  }

  const whereClause = assignedShowIds ? { id: { in: assignedShowIds } } : {};

  const shows = await prisma.registeredShow.findMany({
    where: whereClause,
    orderBy: { title: "asc" },
    select: {
      id: true,
      prefix: true,
      title: true,
      channelNumber: true,
      posterPath: true,
      totalSeasons: true,
      totalCodes: true,
    },
  });

  return NextResponse.json({ shows });
}
