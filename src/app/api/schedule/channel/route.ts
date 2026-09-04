import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAppointmentLiveNow, getLiveOffsetForAppointment, getAppointmentStartDate } from "@/lib/schedule";
import { getChannel } from "@/config/channels";
import type { MediaType } from "@/types/media";

/**
 * GET /api/schedule/channel?number=42
 *
 * Looks up what is currently airing on the given channel number.
 * Returns the appointment + live offset if something is on right now,
 * or the next scheduled airing + how long until it starts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const numberParam = searchParams.get("number");

  if (!numberParam || Number.isNaN(Number(numberParam))) {
    return NextResponse.json(
      { error: "`number` must be a valid channel number." },
      { status: 400 },
    );
  }

  const channelNumber = Number(numberParam);
  const now = new Date();
  const todayDow = now.getDay();

  try {
    // Fetch all appointments for this channel across all days of the week
    const appointments = await prisma.scheduledAppointment.findMany({
      where: { channelNumber },
      orderBy: [{ dayOfWeek: "asc" }, { blockStartMinutes: "asc" }],
    });

    if (appointments.length === 0) {
      return NextResponse.json({
        channelNumber,
        channelName: getChannel(channelNumber)?.name ?? `CH ${channelNumber}`,
        isLiveNow: false,
        appointment: null,
        liveOffsetSeconds: null,
        nextAiringAt: null,
        message: "Nothing scheduled on this channel.",
      });
    }

    const channel = getChannel(channelNumber);

    // Check if any appointment is live right now
    const liveAppointment = appointments.find((appt) =>
      isAppointmentLiveNow(
        { dayOfWeek: appt.dayOfWeek, blockStartMinutes: appt.blockStartMinutes, blockCount: appt.blockCount },
        now,
      ),
    );

    if (liveAppointment) {
      const timing = {
        dayOfWeek: liveAppointment.dayOfWeek,
        blockStartMinutes: liveAppointment.blockStartMinutes,
        blockCount: liveAppointment.blockCount,
      };
      const liveOffsetSeconds = getLiveOffsetForAppointment(timing, now);

      return NextResponse.json({
        channelNumber,
        channelName: channel?.name ?? `CH ${channelNumber}`,
        channelAccentColor: channel?.accentColor ?? "#22d3ee",
        isLiveNow: true,
        appointment: {
          id: liveAppointment.id,
          tmdbId: liveAppointment.tmdbId,
          mediaType: liveAppointment.mediaType as MediaType,
          title: liveAppointment.title,
          season: liveAppointment.season,
          episode: liveAppointment.episode,
          posterPath: liveAppointment.posterPath,
          blockStartMinutes: liveAppointment.blockStartMinutes,
          blockCount: liveAppointment.blockCount,
          runtimeMinutes: liveAppointment.runtimeMinutes,
          dayOfWeek: liveAppointment.dayOfWeek,
        },
        liveOffsetSeconds,
        nextAiringAt: null,
      });
    }

    // Nothing live right now — find the next upcoming airing this week
    // Build a list of upcoming "minute of week" values for each appointment
    const nowMinuteOfWeek = todayDow * 1440 + now.getHours() * 60 + now.getMinutes();

    const withMinuteOfWeek = appointments.map((appt) => ({
      appt,
      minuteOfWeek: appt.dayOfWeek * 1440 + appt.blockStartMinutes,
    }));

    // Find the next one after now this week
    const upcoming = withMinuteOfWeek
      .filter((x) => x.minuteOfWeek > nowMinuteOfWeek)
      .sort((a, b) => a.minuteOfWeek - b.minuteOfWeek)[0];

    // If none found later this week, wrap to the earliest next occurrence (next week)
    const next = upcoming ?? withMinuteOfWeek.sort((a, b) => a.minuteOfWeek - b.minuteOfWeek)[0];

    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // Compute wall-clock start time for the next airing
    const nextAppt = next.appt;
    const startDate = getAppointmentStartDate({ blockStartMinutes: nextAppt.blockStartMinutes }, now);
    // Adjust to correct day of week
    const dayDiff = (nextAppt.dayOfWeek - todayDow + 7) % 7;
    const nextDate = new Date(startDate.getTime() + dayDiff * 86400_000);
    // If it's today but already passed, push to next week
    const msUntil = nextDate.getTime() - now.getTime();
    const minutesUntil = Math.max(0, Math.ceil(msUntil / 60_000));

    return NextResponse.json({
      channelNumber,
      channelName: channel?.name ?? `CH ${channelNumber}`,
      channelAccentColor: channel?.accentColor ?? "#22d3ee",
      isLiveNow: false,
      appointment: {
        id: nextAppt.id,
        tmdbId: nextAppt.tmdbId,
        mediaType: nextAppt.mediaType as MediaType,
        title: nextAppt.title,
        season: nextAppt.season,
        episode: nextAppt.episode,
        posterPath: nextAppt.posterPath,
        blockStartMinutes: nextAppt.blockStartMinutes,
        blockCount: nextAppt.blockCount,
        runtimeMinutes: nextAppt.runtimeMinutes,
        dayOfWeek: nextAppt.dayOfWeek,
      },
      liveOffsetSeconds: null,
      nextAiringAt: {
        dayName: DAYS[nextAppt.dayOfWeek],
        minuteOfDay: nextAppt.blockStartMinutes,
        minutesUntil,
        isoString: nextDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("[api/schedule/channel] GET error:", error);
    return NextResponse.json(
      { error: "Failed to resolve the channel." },
      { status: 500 },
    );
  }
}
