import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkMediaOwnership, getBroadcastSlotStatus } from "@/lib/mediaOwnership";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    libraryItem: {
      findFirst: vi.fn(),
    },
    rental: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

function formatTimeRemaining(expiresAt: Date | string | null, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const expTime = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
  const diff = expTime - now.getTime();
  if (diff <= 0) return "Expired";
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  if (days >= 1) {
    return `${days}d ${totalHours % 24}h left`;
  }
  return `${totalHours}h left`;
}

function calculateEffectiveHours(isCustomMode: boolean, customUnit: "hours" | "days", customAmount: number, presetHours: number): number {
  if (isCustomMode) {
    return customUnit === "days" ? Math.max(1, customAmount) * 24 : Math.max(1, customAmount);
  }
  return presetHours;
}

describe("Media ownership & rental lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkMediaOwnership", () => {
    it("returns NONE for invalid media ID", async () => {
      const result = await checkMediaOwnership("user-1", -1);
      expect(result.status).toBe("NONE");
      expect(result.isOwned).toBe(false);
      expect(result.isRented).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it("returns OWNED with permanent validity when LibraryItem exists", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce({
        id: "lib-1",
        userId: "user-1",
        mediaId: 100,
        mediaType: "MOVIE",
        seasonNumber: 0,
        createdAt: new Date(),
      } as unknown as any);

      const result = await checkMediaOwnership("user-1", 100);
      expect(result.status).toBe("OWNED");
      expect(result.isOwned).toBe(true);
      expect(result.isRented).toBe(false);
      expect(result.isValid).toBe(true);
      expect(result.expiresAt).toBeNull();
    });

    it("returns RENTED when active rental exists and has not expired", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce(null);
      const futureDate = new Date(Date.now() + 48 * 3600 * 1000); // 48h in future
      vi.mocked(prisma.rental.findFirst).mockResolvedValueOnce({
        id: "rental-1",
        userId: "user-1",
        mediaId: 200,
        mediaType: "TV",
        seasonNumber: 1,
        rentedAt: new Date(),
        expiresAt: futureDate,
      } as unknown as any);

      const result = await checkMediaOwnership("user-1", 200, 1);
      expect(result.status).toBe("RENTED");
      expect(result.isOwned).toBe(false);
      expect(result.isRented).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.expiresAt).toEqual(futureDate);
    });

    it("returns EXPIRED when rental exists but expiresAt is in the past", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce(null);
      // Active rental query returns null
      vi.mocked(prisma.rental.findFirst)
        .mockResolvedValueOnce(null)
        // Expired rental query returns past rental
        .mockResolvedValueOnce({
          id: "rental-past",
          userId: "user-1",
          mediaId: 300,
          mediaType: "MOVIE",
          seasonNumber: 0,
          rentedAt: new Date(Date.now() - 72 * 3600 * 1000),
          expiresAt: new Date(Date.now() - 24 * 3600 * 1000),
        } as unknown as any);

      const result = await checkMediaOwnership("user-1", 300);
      expect(result.status).toBe("EXPIRED");
      expect(result.isOwned).toBe(false);
      expect(result.isRented).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it("returns NONE when neither library item nor rental exists", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.rental.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await checkMediaOwnership("user-1", 400);
      expect(result.status).toBe("NONE");
      expect(result.isOwned).toBe(false);
      expect(result.isRented).toBe(false);
      expect(result.isValid).toBe(false);
    });
  });

  describe("getBroadcastSlotStatus", () => {
    it("returns OWNED when in LibraryItem", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce({ id: "lib-1" } as unknown as any);
      const status = await getBroadcastSlotStatus("user-1", 100, 0, new Date());
      expect(status).toBe("OWNED");
    });

    it("returns RENTED_VALID when scheduled time is before rental expiration", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce(null);
      const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);
      vi.mocked(prisma.rental.findFirst).mockResolvedValueOnce({ expiresAt } as unknown as any);

      const scheduledTime = new Date(Date.now() + 24 * 3600 * 1000);
      const status = await getBroadcastSlotStatus("user-1", 200, 1, scheduledTime);
      expect(status).toBe("RENTED_VALID");
    });

    it("returns RETURNED_EXPIRED when scheduled time is after rental expiration", async () => {
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce(null);
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      vi.mocked(prisma.rental.findFirst).mockResolvedValueOnce({ expiresAt } as unknown as any);

      const scheduledTime = new Date(Date.now() + 48 * 3600 * 1000); // 1 day after expiration
      const status = await getBroadcastSlotStatus("user-1", 200, 1, scheduledTime);
      expect(status).toBe("RETURNED_EXPIRED");
    });
  });

  describe("Rental Duration Math & Time Formatting", () => {
    it("formats multi-day remaining time", () => {
      const now = new Date(2026, 8, 4, 12, 0);
      const expiresAt = new Date(2026, 8, 7, 18, 0); // 3 days 6 hours later
      expect(formatTimeRemaining(expiresAt, now)).toBe("3d 6h left");
    });

    it("formats sub-24h remaining time as hours", () => {
      const now = new Date(2026, 8, 4, 12, 0);
      const expiresAt = new Date(2026, 8, 4, 20, 0); // 8 hours later
      expect(formatTimeRemaining(expiresAt, now)).toBe("8h left");
    });

    it("returns Expired for past timestamps", () => {
      const now = new Date(2026, 8, 4, 12, 0);
      const past = new Date(2026, 8, 4, 10, 0);
      expect(formatTimeRemaining(past, now)).toBe("Expired");
    });

    it("calculates effective hours from custom mode (days vs hours)", () => {
      expect(calculateEffectiveHours(true, "days", 7, 48)).toBe(168); // 7 days = 168h
      expect(calculateEffectiveHours(true, "hours", 36, 48)).toBe(36); // 36h
      expect(calculateEffectiveHours(false, "days", 7, 48)).toBe(48); // preset fallback
    });
  });
});
