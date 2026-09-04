import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discoverMoviesByGenre, TmdbApiError } from "@/lib/tmdb";
import { BLOCK_MINUTES } from "@/lib/runtime";
import { CHANNELS } from "@/config/channels";

const MINUTES_PER_DAY = 24 * 60;
const SLOTS_PER_DAY = MINUTES_PER_DAY / BLOCK_MINUTES;

/** TMDB movie genre IDs matching each channel's declared genre string. */
const CHANNEL_GENRE_TMDB_MOVIE_ID: Record<string, number> = {
  Comedy: 35,
  Animation: 16,
  Drama: 18,
  Action: 28,
  Horror: 27,
};

/**
 * Auto-fills every unassigned 30-minute slot on today's guide with a
 * popular movie matching each channel's genre. Only fills gaps — existing
 * appointments are left untouched, so this is safe to run repeatedly.
 */
export async function POST() {
  const dayOfWeek = new Date().getDay();

  try {
    const existing = await prisma.scheduledAppointment.findMany({ where: { dayOfWeek } });

    const appointmentsToCreate: Prisma.ScheduledAppointmentCreateManyInput[] = [];

    for (const channel of CHANNELS) {
      const genreId = CHANNEL_GENRE_TMDB_MOVIE_ID[channel.genre];
      if (!genreId) continue;

      const occupied = new Set<number>();
      for (const appointment of existing) {
        if (appointment.channelNumber !== channel.number) continue;
        for (let block = 0; block < appointment.blockCount; block++) {
          occupied.add(appointment.blockStartMinutes + block * BLOCK_MINUTES);
        }
      }

      const emptySlots: number[] = [];
      for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        const minutes = slot * BLOCK_MINUTES;
        if (!occupied.has(minutes)) emptySlots.push(minutes);
      }

      if (emptySlots.length === 0) continue;

      let candidates;
      try {
        candidates = await discoverMoviesByGenre(genreId);
      } catch (error) {
        if (error instanceof TmdbApiError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }

      if (candidates.length === 0) continue;

      emptySlots.forEach((blockStartMinutes, index) => {
        const candidate = candidates[index % candidates.length];
        appointmentsToCreate.push({
          tmdbId: candidate.tmdbId,
          mediaType: "movie",
          title: candidate.title,
          season: null,
          episode: null,
          channelNumber: channel.number,
          dayOfWeek,
          blockStartMinutes,
          blockCount: 1,
          runtimeMinutes: null,
          posterPath: candidate.posterPath,
        });
      });
    }

    if (appointmentsToCreate.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    await prisma.scheduledAppointment.createMany({ data: appointmentsToCreate });

    return NextResponse.json({ created: appointmentsToCreate.length });
  } catch (error) {
    console.error("[api/schedule/autofill] POST error:", error);
    return NextResponse.json(
      { error: "Failed to auto-fill the schedule." },
      { status: 500 },
    );
  }
}
