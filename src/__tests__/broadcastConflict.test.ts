import { describe, it, expect } from "vitest";

const BLOCK_MINUTES = 30;

function calculateBlockCount(runtimeMinutes?: number | null, mediaType: "movie" | "tv" = "tv"): number {
  if (runtimeMinutes && runtimeMinutes > 0) {
    return Math.max(1, Math.ceil(runtimeMinutes / BLOCK_MINUTES));
  }
  return mediaType === "movie" ? 4 : 1;
}

interface ScheduleSlot {
  id?: string;
  dayOfWeek: number;
  blockStartMinutes: number;
  blockCount: number;
  title: string;
}

function checkSlotConflict(
  requested: { dayOfWeek: number; blockStartMinutes: number; blockCount: number; id?: string },
  existingSchedule: ScheduleSlot[],
  mode: "create" | "move" = "create",
  ignoreId?: string,
): { hasConflict: boolean; conflictItem?: ScheduleSlot } {
  const requestedEnd = requested.blockStartMinutes + requested.blockCount * BLOCK_MINUTES;

  for (const item of existingSchedule) {
    if (item.dayOfWeek !== requested.dayOfWeek) continue;

    // In move mode, ignore the item being moved
    if (mode === "move" && ignoreId && item.id === ignoreId) {
      continue;
    }

    const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
    const overlaps = requested.blockStartMinutes < itemEnd && requestedEnd > item.blockStartMinutes;

    if (overlaps) {
      return { hasConflict: true, conflictItem: item };
    }
  }

  return { hasConflict: false };
}

function cleanRerunTitle(title: string): string {
  return title.replace(/\s*\(Rerun\)\s*$/i, "").trim();
}

describe("Broadcast conflict & block allocation engine", () => {
  describe("calculateBlockCount", () => {
    it("allocates 1 block for 25m episode", () => {
      expect(calculateBlockCount(25, "tv")).toBe(1);
    });

    it("allocates 2 blocks for 45m or 55m drama episode", () => {
      expect(calculateBlockCount(45, "tv")).toBe(2);
      expect(calculateBlockCount(55, "tv")).toBe(2);
    });

    it("allocates 4 blocks for a 105m movie", () => {
      expect(calculateBlockCount(105, "movie")).toBe(4);
    });

    it("allocates 5 blocks for a 140m movie", () => {
      expect(calculateBlockCount(140, "movie")).toBe(5);
    });

    it("falls back to 4 blocks for movies and 1 block for TV when runtime is 0 or missing", () => {
      expect(calculateBlockCount(0, "movie")).toBe(4);
      expect(calculateBlockCount(null, "movie")).toBe(4);
      expect(calculateBlockCount(undefined, "tv")).toBe(1);
      expect(calculateBlockCount(-5, "tv")).toBe(1);
    });
  });

  describe("checkSlotConflict", () => {
    const existing: ScheduleSlot[] = [
      { id: "slot-1", dayOfWeek: 1, blockStartMinutes: 1200, blockCount: 2, title: "The Twilight Zone" }, // Mon 8:00 PM - 9:00 PM
      { id: "slot-2", dayOfWeek: 1, blockStartMinutes: 1260, blockCount: 4, title: "Blade Runner" }, // Mon 9:00 PM - 11:00 PM
      { id: "slot-3", dayOfWeek: 2, blockStartMinutes: 1200, blockCount: 2, title: "Twin Peaks" }, // Tue 8:00 PM - 9:00 PM
    ];

    it("detects direct overlap on same day", () => {
      const requested = { dayOfWeek: 1, blockStartMinutes: 1200, blockCount: 1 }; // Mon 8:00 PM
      const result = checkSlotConflict(requested, existing);
      expect(result.hasConflict).toBe(true);
      expect(result.conflictItem?.title).toBe("The Twilight Zone");
    });

    it("detects partial overlap intersecting start of existing slot", () => {
      // Mon 7:30 PM - 8:30 PM (1170 to 1230), overlaps Twilight Zone (1200 to 1260)
      const requested = { dayOfWeek: 1, blockStartMinutes: 1170, blockCount: 2 };
      const result = checkSlotConflict(requested, existing);
      expect(result.hasConflict).toBe(true);
      expect(result.conflictItem?.title).toBe("The Twilight Zone");
    });

    it("detects multi-block span engulfing existing slot", () => {
      // Mon 7:00 PM - 10:00 PM (1140 to 1320), engulfs both Twilight Zone and Blade Runner
      const requested = { dayOfWeek: 1, blockStartMinutes: 1140, blockCount: 6 };
      const result = checkSlotConflict(requested, existing);
      expect(result.hasConflict).toBe(true);
    });

    it("allows adjacent back-to-back broadcasts without conflict", () => {
      // Mon 7:00 PM - 8:00 PM (1140 to 1200), ends right when slot-1 starts at 1200
      const requestedBefore = { dayOfWeek: 1, blockStartMinutes: 1140, blockCount: 2 };
      expect(checkSlotConflict(requestedBefore, existing).hasConflict).toBe(false);

      // Mon 11:00 PM - 11:30 PM (1380 to 1410), starts right after Blade Runner ends at 1380
      const requestedAfter = { dayOfWeek: 1, blockStartMinutes: 1380, blockCount: 1 };
      expect(checkSlotConflict(requestedAfter, existing).hasConflict).toBe(false);
    });

    it("allows identical time on a different day of the week", () => {
      // Wed 8:00 PM (day 3, 1200 mins), no shows scheduled on Wednesday
      const requested = { dayOfWeek: 3, blockStartMinutes: 1200, blockCount: 2 };
      expect(checkSlotConflict(requested, existing).hasConflict).toBe(false);
    });

    it("ignores old self when moving an existing appointment", () => {
      // Move slot-1 to a new start time on the same day that overlaps its own old bounds
      const requested = { id: "slot-1", dayOfWeek: 1, blockStartMinutes: 1200, blockCount: 1 };
      const result = checkSlotConflict(requested, existing, "move", "slot-1");
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("cleanRerunTitle", () => {
    it("strips trailing (Rerun) tag", () => {
      expect(cleanRerunTitle("Miami Vice (Rerun)")).toBe("Miami Vice");
      expect(cleanRerunTitle("Twin Peaks (rerun)")).toBe("Twin Peaks");
      expect(cleanRerunTitle("Blade Runner  (RERUN) ")).toBe("Blade Runner");
    });

    it("preserves title when no rerun tag exists", () => {
      expect(cleanRerunTitle("Miami Vice")).toBe("Miami Vice");
      expect(cleanRerunTitle("Star Trek: The Next Generation")).toBe("Star Trek: The Next Generation");
    });
  });
});
