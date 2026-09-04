import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireSession, getSession, getPersistentUserId } from "@/lib/auth/server";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { getLiveOffsetForAppointment, isAppointmentLiveNow } from "@/lib/schedule";
import { getChannel, CHANNEL_NUMBERS } from "@/config/channels";
import type { MediaType } from "@/types/media";
import type { CreateAppointmentInput, ScheduleEntry } from "@/types/schedule";

const MINUTES_PER_DAY = 24 * 60;

function enrichAppointment(appointment: {
  id: string;
  tmdbId: number;
  mediaType: string;
  title: string;
  season: number | null;
  episode: number | null;
  channelNumber: number;
  dayOfWeek: number;
  blockStartMinutes: number;
  blockCount: number;
  runtimeMinutes: number | null;
  posterPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ScheduleEntry {
  const channel = getChannel(appointment.channelNumber);
  const timing = {
    dayOfWeek: appointment.dayOfWeek,
    blockStartMinutes: appointment.blockStartMinutes,
    blockCount: appointment.blockCount,
  };

  return {
    id: appointment.id,
    tmdbId: appointment.tmdbId,
    mediaType: appointment.mediaType as MediaType,
    title: appointment.title,
    season: appointment.season,
    episode: appointment.episode,
    channelNumber: appointment.channelNumber,
    dayOfWeek: appointment.dayOfWeek,
    blockStartMinutes: appointment.blockStartMinutes,
    blockCount: appointment.blockCount,
    runtimeMinutes: appointment.runtimeMinutes,
    posterPath: appointment.posterPath,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
    channelName: channel?.name ?? `CH ${appointment.channelNumber}`,
    channelGenre: channel?.genre ?? "General",
    channelAccentColor: channel?.accentColor ?? "#22d3ee",
    isLiveNow: isAppointmentLiveNow(timing),
    liveOffsetSeconds: getLiveOffsetForAppointment(timing),
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ appointments: [] });
  }

  const userId = getPersistentUserId(session);
  const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];

  const { searchParams } = new URL(request.url);
  const dayOfWeekParam = searchParams.get("dayOfWeek");

  try {
    const where = {
      sessionId: { in: userKeys },
      ...(dayOfWeekParam !== null ? { dayOfWeek: Number(dayOfWeekParam) } : {}),
    };

    const appointments = await prisma.scheduledAppointment.findMany({
      where,
      orderBy: [{ channelNumber: "asc" }, { blockStartMinutes: "asc" }],
    });

    return NextResponse.json({
      appointments: appointments.map(enrichAppointment),
    });
  } catch (error) {
    console.error("[api/schedule] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load the schedule." },
      { status: 500 },
    );
  }
}

function validateCreateInput(body: Partial<CreateAppointmentInput>): string | null {
  if (!body.tmdbId || typeof body.tmdbId !== "number") return "`tmdbId` is required.";
  if (body.mediaType !== "movie" && body.mediaType !== "tv")
    return "`mediaType` must be 'movie' or 'tv'.";
  if (!body.title || typeof body.title !== "string") return "`title` is required.";
  if (typeof body.channelNumber !== "number" || !CHANNEL_NUMBERS.includes(body.channelNumber))
    return `\`channelNumber\` must be one of: ${CHANNEL_NUMBERS.join(", ")}.`;
  if (
    typeof body.dayOfWeek !== "number" ||
    body.dayOfWeek < 0 ||
    body.dayOfWeek > 6 ||
    !Number.isInteger(body.dayOfWeek)
  )
    return "`dayOfWeek` must be an integer between 0 (Sunday) and 6 (Saturday).";
  if (
    typeof body.blockStartMinutes !== "number" ||
    body.blockStartMinutes < 0 ||
    body.blockStartMinutes >= MINUTES_PER_DAY ||
    body.blockStartMinutes % BLOCK_MINUTES !== 0
  )
    return `\`blockStartMinutes\` must be a multiple of ${BLOCK_MINUTES} between 0 and ${MINUTES_PER_DAY - BLOCK_MINUTES}.`;
  if (body.blockCount !== undefined && (body.blockCount < 1 || !Number.isInteger(body.blockCount)))
    return "`blockCount` must be a positive integer.";
  if (body.mediaType === "tv" && (body.season == null || body.episode == null))
    return "`season` and `episode` are required for TV appointments.";

  return null;
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  let body: Partial<CreateAppointmentInput>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validationError = validateCreateInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const userId = getPersistentUserId(session);
  const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];

  try {
    const appointment = await prisma.scheduledAppointment.create({
      data: {
        sessionId: userId,
        tmdbId: body.tmdbId!,
        mediaType: body.mediaType!,
        title: body.title!,
        season: body.mediaType === "tv" ? (body.season ?? null) : null,
        episode: body.mediaType === "tv" ? (body.episode ?? null) : null,
        channelNumber: body.channelNumber!,
        dayOfWeek: body.dayOfWeek!,
        blockStartMinutes: body.blockStartMinutes!,
        blockCount: body.blockCount ?? 1,
        runtimeMinutes: body.runtimeMinutes ?? null,
        posterPath: body.posterPath ?? null,
      },
    });

    return NextResponse.json({ appointment: enrichAppointment(appointment) }, { status: 201 });
  } catch (error) {
    console.error("[api/schedule] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create the appointment." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const userId = getPersistentUserId(session);
  const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(Boolean) as string[];
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing required `id` search parameter." }, { status: 400 });
  }

  try {
    // Scope the delete to the caller's session / persistent identity
    const { count } = await prisma.scheduledAppointment.deleteMany({
      where: { id, sessionId: { in: userKeys } },
    });

    if (count === 0) {
      return NextResponse.json(
        { error: "Appointment not found or not owned by this session." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/schedule] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete the appointment." },
      { status: 500 },
    );
  }
}
