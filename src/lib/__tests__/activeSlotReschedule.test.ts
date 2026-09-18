import { describe, it, expect } from "vitest";
import { formatBlockTimeRange } from "@/types/broadcast";

describe("Active Broadcast Slot Rescheduling Logic", () => {
  const BLOCK_MINUTES = 30;

  // Multi-block overlap checking function mirroring the route logic
  function checkSlotCollision(
    targetStart: number,
    blockCount: number,
    existingSlots: Array<{ id: string; blockStartMinutes: number; blockCount: number; title: string }>,
    slotIdBeingMoved: string,
  ) {
    const requestedEnd = targetStart + blockCount * BLOCK_MINUTES;

    for (const item of existingSlots) {
      if (item.id === slotIdBeingMoved) continue; // Self-exclusion
      const itemEnd = item.blockStartMinutes + item.blockCount * BLOCK_MINUTES;
      const overlaps = targetStart < itemEnd && requestedEnd > item.blockStartMinutes;
      if (overlaps) {
        return {
          conflict: true,
          conflictingTitle: item.title,
          conflictingRange: formatBlockTimeRange(item.blockStartMinutes, item.blockCount),
        };
      }
    }
    return { conflict: false };
  }

  it("permits moving a slot to a free unoccupied time", () => {
    const existing = [
      { id: "slot-1", blockStartMinutes: 600, blockCount: 1, title: "Friends" }, // 10:00 - 10:30 AM
      { id: "slot-2", blockStartMinutes: 720, blockCount: 2, title: "Seinfeld" }, // 12:00 - 1:00 PM
    ];

    const result = checkSlotCollision(660, 1, existing, "slot-3"); // 11:00 AM (free)
    expect(result.conflict).toBe(false);
  });

  it("detects conflict when a multi-block movie overlaps an existing show", () => {
    const existing = [
      { id: "slot-1", blockStartMinutes: 660, blockCount: 1, title: "The Simpsons" }, // 11:00 - 11:30 AM
    ];

    // Attempting to move a 4-block movie (120m) starting at 10:00 AM (600) -> ends at 12:00 PM (720)
    const result = checkSlotCollision(600, 4, existing, "slot-movie");
    expect(result.conflict).toBe(true);
    expect(result.conflictingTitle).toBe("The Simpsons");
    expect(result.conflictingRange).toBe("11:00 AM – 11:30 AM");
  });

  it("ignores the slot's own current position so moving within the same day does not self-conflict", () => {
    const existing = [
      { id: "slot-target", blockStartMinutes: 600, blockCount: 1, title: "Twin Peaks" }, // 10:00 - 10:30 AM
    ];

    // Shifting Twin Peaks by 30 mins to 10:30 AM (630)
    const result = checkSlotCollision(630, 1, existing, "slot-target");
    expect(result.conflict).toBe(false);
  });

  it("calculates time range label correctly for multi-block slots", () => {
    expect(formatBlockTimeRange(600, 1)).toBe("10:00 AM – 10:30 AM");
    expect(formatBlockTimeRange(600, 2)).toBe("10:00 AM – 11:00 AM");
    expect(formatBlockTimeRange(600, 4)).toBe("10:00 AM – 12:00 PM");
    expect(formatBlockTimeRange(1200, 3)).toBe("8:00 PM – 9:30 PM");
  });
});
