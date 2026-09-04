import { describe, it, expect } from "vitest";
import {
  formatLocalDate,
  getBroadcastRuntimeMinutes,
  getBroadcastStartMinutes,
  isBroadcastLiveNow,
  getBroadcastLiveOffsetSeconds,
} from "@/lib/broadcastLive";
import {
  formatBlockTime,
  formatBlockTimeRange,
  personalScheduleToMediaSearchResult,
  type PersonalScheduleItem,
} from "@/types/broadcast";

describe("broadcastLive & schedule time engine", () => {
  describe("formatLocalDate", () => {
    it("formats a standard date as YYYY-MM-DD", () => {
      const d = new Date(2026, 4, 15); // May 15, 2026
      expect(formatLocalDate(d)).toBe("2026-05-15");
    });

    it("pads single-digit month and day with leading zeroes", () => {
      const d = new Date(2026, 0, 7); // Jan 7, 2026
      expect(formatLocalDate(d)).toBe("2026-01-07");
    });

    it("handles leap year dates correctly", () => {
      const leapDate = new Date(2024, 1, 29); // Feb 29, 2024
      expect(formatLocalDate(leapDate)).toBe("2024-02-29");
    });

    it("defaults to current date when no argument is passed", () => {
      const now = new Date();
      const expectedYear = now.getFullYear();
      expect(formatLocalDate()).toContain(String(expectedYear));
    });
  });

  describe("getBroadcastRuntimeMinutes", () => {
    it("returns runtime when positive", () => {
      expect(getBroadcastRuntimeMinutes({ runtime: 45 })).toBe(45);
      expect(getBroadcastRuntimeMinutes({ runtime: 120 })).toBe(120);
    });

    it("falls back to DEFAULT_RUNTIME_MINUTES (30) when runtime is zero or negative or null", () => {
      expect(getBroadcastRuntimeMinutes({ runtime: 0 })).toBe(30);
      expect(getBroadcastRuntimeMinutes({ runtime: -10 })).toBe(30);
      expect(getBroadcastRuntimeMinutes({ runtime: null as unknown as number })).toBe(30);
      expect(getBroadcastRuntimeMinutes({ runtime: undefined as unknown as number })).toBe(30);
    });
  });

  describe("getBroadcastStartMinutes", () => {
    it("calculates minutes from midnight correctly", () => {
      expect(getBroadcastStartMinutes({ airtime: "00:00" })).toBe(0);
      expect(getBroadcastStartMinutes({ airtime: "01:30" })).toBe(90);
      expect(getBroadcastStartMinutes({ airtime: "12:00" })).toBe(720);
      expect(getBroadcastStartMinutes({ airtime: "20:00" })).toBe(1200);
      expect(getBroadcastStartMinutes({ airtime: "23:45" })).toBe(1425);
    });

    it("handles empty or missing airtime by returning 0", () => {
      expect(getBroadcastStartMinutes({ airtime: "" })).toBe(0);
      expect(getBroadcastStartMinutes({ airtime: undefined as unknown as string })).toBe(0);
    });
  });

  describe("isBroadcastLiveNow", () => {
    it("returns true when clock is inside broadcast window [start, end)", () => {
      const item = { airtime: "20:00", runtime: 60 }; // 8:00 PM to 9:00 PM
      const clockInside = new Date(2026, 8, 4, 20, 25); // 8:25 PM
      expect(isBroadcastLiveNow(item, clockInside)).toBe(true);

      const clockStart = new Date(2026, 8, 4, 20, 0); // Exact start: 8:00 PM
      expect(isBroadcastLiveNow(item, clockStart)).toBe(true);
    });

    it("returns false when clock is before start time", () => {
      const item = { airtime: "20:00", runtime: 60 };
      const clockBefore = new Date(2026, 8, 4, 19, 59); // 7:59 PM
      expect(isBroadcastLiveNow(item, clockBefore)).toBe(false);
    });

    it("returns false when clock is at or after end time", () => {
      const item = { airtime: "20:00", runtime: 60 };
      const clockEnd = new Date(2026, 8, 4, 21, 0); // 9:00 PM exact
      expect(isBroadcastLiveNow(item, clockEnd)).toBe(false);

      const clockAfter = new Date(2026, 8, 4, 21, 15); // 9:15 PM
      expect(isBroadcastLiveNow(item, clockAfter)).toBe(false);
    });
  });

  describe("getBroadcastLiveOffsetSeconds", () => {
    it("returns accurate offset in seconds when broadcast is live", () => {
      const item = { airtime: "14:00", runtime: 60 }; // 2:00 PM to 3:00 PM
      const clock = new Date(2026, 8, 4, 14, 15, 30); // 15 mins 30 secs in
      const offset = getBroadcastLiveOffsetSeconds(item, clock);
      expect(offset).toBe(15 * 60 + 30); // 930 seconds
    });

    it("returns null when broadcast is not live", () => {
      const item = { airtime: "14:00", runtime: 60 };
      const clock = new Date(2026, 8, 4, 15, 30); // already ended
      expect(getBroadcastLiveOffsetSeconds(item, clock)).toBeNull();
    });
  });

  describe("formatBlockTime & formatBlockTimeRange", () => {
    it("formats 24-hour minutes to 12-hour AM/PM string", () => {
      expect(formatBlockTime(0)).toBe("12:00 AM");
      expect(formatBlockTime(30)).toBe("12:30 AM");
      expect(formatBlockTime(720)).toBe("12:00 PM");
      expect(formatBlockTime(750)).toBe("12:30 PM");
      expect(formatBlockTime(1200)).toBe("8:00 PM");
      expect(formatBlockTime(1410)).toBe("11:30 PM");
    });

    it("returns single time label when blockCount is 1", () => {
      expect(formatBlockTimeRange(1200, 1)).toBe("8:00 PM");
    });

    it("calculates multi-block end time correctly (4 blocks = 2 hours)", () => {
      // 8:00 PM (1200 mins) + 4 blocks * 30 mins = 1320 mins (10:00 PM)
      expect(formatBlockTimeRange(1200, 4)).toBe("8:00 PM – 10:00 PM");
    });

    it("handles block spans rolling over midnight", () => {
      // 11:30 PM (1410 mins) + 2 blocks = 12:30 AM (1470 mins -> 30 mins)
      expect(formatBlockTimeRange(1410, 2)).toBe("11:30 PM – 12:30 AM");
    });
  });

  describe("personalScheduleToMediaSearchResult", () => {
    it("converts PersonalScheduleItem to MediaSearchResult format", () => {
      const item: PersonalScheduleItem = {
        id: "schedule-1",
        sessionId: "session-1",
        tmdbId: 1399,
        title: "Game of Thrones",
        currentSeason: 1,
        currentEpisode: 1,
        wasWatched: false,
        dayOfWeek: 0,
        blockStartMinutes: 1200,
        blockCount: 2,
        posterPath: "/poster.jpg",
        backdropUrl: "https://image.tmdb.org/backdrop.jpg",
        mediaType: "tv",
        createdAt: "2026-09-04T00:00:00Z",
      };

      const result = personalScheduleToMediaSearchResult(item);
      expect(result.tmdbId).toBe(1399);
      expect(result.title).toBe("Game of Thrones");
      expect(result.mediaType).toBe("tv");
      expect(result.posterPath).toBe("/poster.jpg");
      expect(result.posterUrl).toBe("https://image.tmdb.org/t/p/w780/poster.jpg");
      expect(result.backdropUrl).toBe("https://image.tmdb.org/backdrop.jpg");
    });
  });
});
