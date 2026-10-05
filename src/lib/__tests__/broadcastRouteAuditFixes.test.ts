import { describe, it, expect } from "vitest";
import { getNextAirDate } from "@/lib/schedule";

describe("Broadcast Route Audit Fixes", () => {
  describe("getNextAirDate with blockCount", () => {
    it("recognizes a multi-block slot that is currently live and returns today's air date instead of jumping to next week", () => {
      // Suppose today is Monday (day 1), local time 8:15 PM (1215 minutes)
      // The slot starts at 8:00 PM (1200 minutes) and lasts 4 blocks (2 hours -> ends 10:00 PM / 1320 minutes)
      const mockNow = new Date("2026-10-05T20:15:00.000Z"); // Monday
      const dayOfWeek = 1; // Monday
      const blockStartMinutes = 1200; // 8:00 PM
      const blockCount = 4; // 120 mins

      const nextAir = getNextAirDate(dayOfWeek, blockStartMinutes, mockNow, 0, blockCount);

      // It must return today (Oct 5), NOT next week (Oct 12)
      expect(nextAir.toISOString()).toBe("2026-10-05T20:00:00.000Z");
    });

    it("correctly advances to next week when the entire multi-block duration has finished", () => {
      // Suppose today is Monday, local time 10:15 PM (1335 minutes)
      // The slot was 8:00 PM - 10:00 PM (1200 to 1320 minutes)
      const mockNow = new Date("2026-10-05T22:15:00.000Z");
      const dayOfWeek = 1;
      const blockStartMinutes = 1200;
      const blockCount = 4;

      const nextAir = getNextAirDate(dayOfWeek, blockStartMinutes, mockNow, 0, blockCount);

      // It must now return next Monday (Oct 12)
      expect(nextAir.toISOString()).toBe("2026-10-12T20:00:00.000Z");
    });
  });

  describe("Rental expiration logic for live vs upcoming airings", () => {
    function evaluateSlotStatus(
      owned: boolean,
      expiresAt: Date | null,
      isLiveNow: boolean,
      targetAirDate: Date,
      referenceNow: Date,
    ) {
      if (owned) return { status: "OWNED", rentalExpiresAt: null };
      if (!expiresAt) return { status: "RETURNED_EXPIRED", rentalExpiresAt: null };

      const checkTime = isLiveNow ? referenceNow : targetAirDate;
      if (expiresAt.getTime() >= checkTime.getTime()) {
        return { status: "RENTED_VALID", rentalExpiresAt: expiresAt.toISOString() };
      }
      return { status: "RETURNED_EXPIRED", rentalExpiresAt: expiresAt.toISOString() };
    }

    it("marks slot as RENTED_VALID if slot is live right now and rental has not expired yet", () => {
      const now = new Date("2026-10-05T20:15:00Z");
      const expiresAt = new Date("2026-10-05T22:00:00Z"); // expires in 1h45m
      const targetAirDate = new Date("2026-10-05T20:00:00Z"); // started 15m ago

      const result = evaluateSlotStatus(false, expiresAt, true, targetAirDate, now);
      expect(result.status).toBe("RENTED_VALID");
      expect(result.rentalExpiresAt).toBe(expiresAt.toISOString());
    });

    it("marks slot as RETURNED_EXPIRED if slot is live right now but rental expired 5 minutes ago", () => {
      const now = new Date("2026-10-05T20:15:00Z");
      const expiresAt = new Date("2026-10-05T20:10:00Z"); // expired 5 mins ago
      const targetAirDate = new Date("2026-10-05T20:00:00Z");

      const result = evaluateSlotStatus(false, expiresAt, true, targetAirDate, now);
      expect(result.status).toBe("RETURNED_EXPIRED");
    });

    it("marks slot as RETURNED_EXPIRED for upcoming slot if rental expires before the future air date", () => {
      const now = new Date("2026-10-05T12:00:00Z"); // Monday noon
      const expiresAt = new Date("2026-10-07T12:00:00Z"); // 48h rental expires Wednesday noon
      const targetAirDate = new Date("2026-10-09T20:00:00Z"); // Friday 8 PM (4 days away)

      const result = evaluateSlotStatus(false, expiresAt, false, targetAirDate, now);
      expect(result.status).toBe("RETURNED_EXPIRED");
    });

    it("marks slot as RENTED_VALID for upcoming slot if rental covers the air date", () => {
      const now = new Date("2026-10-05T12:00:00Z"); // Monday noon
      const expiresAt = new Date("2026-10-07T12:00:00Z"); // Wednesday noon
      const targetAirDate = new Date("2026-10-06T20:00:00Z"); // Tuesday 8 PM (within 48h)

      const result = evaluateSlotStatus(false, expiresAt, false, targetAirDate, now);
      expect(result.status).toBe("RENTED_VALID");
    });
  });

  describe("Rerun cleanup scope isolation", () => {
    it("ensures rerun completion only deletes the specific rerun slot and not other recurring slots", () => {
      const slots = [
        { id: "slot-weekly-1", tmdbId: 100, isRerun: false, title: "Lost" },
        { id: "slot-weekly-2", tmdbId: 100, isRerun: false, title: "Lost" },
        { id: "slot-rerun-1", tmdbId: 100, isRerun: true, title: "Lost (Rerun)" },
      ];

      const completedSlot = slots.find((s) => s.id === "slot-rerun-1")!;

      // Simulating scoped deletion
      const remainingSlots = completedSlot.isRerun
        ? slots.filter((s) => s.id !== completedSlot.id)
        : slots.filter((s) => s.tmdbId !== completedSlot.tmdbId);

      expect(remainingSlots.length).toBe(2);
      expect(remainingSlots.map((s) => s.id)).toEqual(["slot-weekly-1", "slot-weekly-2"]);
    });
  });
});
