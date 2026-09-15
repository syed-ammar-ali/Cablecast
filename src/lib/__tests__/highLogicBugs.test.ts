import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { isSlotStartingSoon } from "@/lib/notifications/notificationDispatcher";
import { resolveStreamPipeline } from "@/lib/streamResolver";
import { getClientIp } from "@/lib/rateLimit";

vi.mock("server-only", () => ({}));

// Mock next/headers for rateLimit getClientIp
const mockHeaderStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(async () => ({
    get: (key: string) => mockHeaderStore.get(key.toLowerCase()) || null,
  })),
}));

// Mock prisma and auth for redeem route test
const mockUpdateMany = vi.fn();
const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accessCode: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    session: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/auth/server", () => ({
  createUserSessionWithDeviceLimit: vi.fn().mockResolvedValue({
    success: true,
    token: "mock-token",
    session: { id: "mock-session" },
  }),
  sanitizeDisplayName: vi.fn((name: string) => name),
}));

describe("High Logic Bugs (Batch 2)", () => {
  beforeEach(() => {
    mockHeaderStore.clear();
    mockUpdateMany.mockReset();
    mockUpdate.mockReset();
    mockFindUnique.mockReset();
  });

  describe("Fix 6 & Fix 7: streamResolver.ts", () => {
    it("returns type 'embed' for meta-router stream", async () => {
      const result = await resolveStreamPipeline({
        tmdbId: 550,
        type: "movie",
      });

      expect(result.type).toBe("embed");
      expect(result.url).toContain("anyembed.xyz/embed/tmdb-movie-550");
      expect(result.provider).toBe("AnyEmbed Matrix");
    });

    it("returns type 'embed' for Internet Archive streams instead of 'hls'", async () => {
      // Mock global fetch for Internet Archive advancedsearch API
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("archive.org/advancedsearch.php")) {
          return {
            ok: true,
            json: async () => ({
              response: {
                docs: [{ identifier: "vintage_cartoon_1935", title: "Vintage Cartoon" }],
              },
            }),
          };
        }
        return { ok: false };
      });

      try {
        const result = await resolveStreamPipeline({
          tmdbId: 9999,
          type: "movie",
          title: "Vintage Cartoon",
          category: "cartoon",
        });

        expect(result.provider).toBe("Internet Archive");
        expect(result.type).toBe("embed");
        expect(result.url).toContain("vintage_cartoon_1935.mp4");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("Fix 8: notificationDispatcher.ts 10-minute window", () => {
    it("identifies a slot starting in 8 minutes as starting soon", () => {
      // User in UTC (offset 0) on Sunday (day 0) at 12:00 UTC (720 minutes)
      const now = new Date("2026-03-01T12:00:00Z");
      const slot = {
        dayOfWeek: 0,
        blockStartMinutes: 728, // 12:08 (8 minutes ahead)
        timezoneOffset: 0,
      };

      const result = isSlotStartingSoon(slot, 0, now);
      expect(result.isStartingSoon).toBe(true);
    });

    it("does NOT identify a slot starting in 20 minutes as starting soon (preventing premature alerts)", () => {
      // User in UTC on Sunday at 12:00 UTC (720 minutes)
      const now = new Date("2026-03-01T12:00:00Z");
      const slot = {
        dayOfWeek: 0,
        blockStartMinutes: 740, // 12:20 (20 minutes ahead)
        timezoneOffset: 0,
      };

      const result = isSlotStartingSoon(slot, 0, now);
      expect(result.isStartingSoon).toBe(false);
    });

    it("does NOT identify a slot that started 4 minutes ago", () => {
      const now = new Date("2026-03-01T12:00:00Z");
      const slot = {
        dayOfWeek: 0,
        blockStartMinutes: 716, // 11:56 (4 minutes ago, window is -2)
        timezoneOffset: 0,
      };

      const result = isSlotStartingSoon(slot, 0, now);
      expect(result.isStartingSoon).toBe(false);
    });
  });

  describe("Fix 9: rateLimit.ts IP detection priority", () => {
    it("prioritizes x-vercel-forwarded-for over x-forwarded-for", async () => {
      mockHeaderStore.set("x-vercel-forwarded-for", "198.51.100.25");
      mockHeaderStore.set("x-forwarded-for", "10.0.0.1, 10.0.0.2");

      const ip = await getClientIp();
      expect(ip).toBe("198.51.100.25");
    });

    it("falls back to x-forwarded-for if x-vercel-forwarded-for is missing", async () => {
      mockHeaderStore.set("x-forwarded-for", "203.0.113.195, 10.0.0.1");

      const ip = await getClientIp();
      expect(ip).toBe("203.0.113.195");
    });
  });

  describe("Fix 11: redeem/route.ts atomic maxUses enforcement", () => {
    it("rejects redemption if updateMany indicates max uses reached", async () => {
      const { POST } = await import("@/app/api/auth/redeem/route");

      mockFindUnique.mockResolvedValue({
        id: "code-123",
        code: "SINGLE-USE-CODE",
        maxUses: 1,
        useCount: 0,
        expiresAt: null,
      });

      // updateMany finds 0 rows because useCount >= maxUses
      mockUpdateMany.mockResolvedValue({ count: 0 });

      const req = new NextRequest("https://cablecast.tv/api/auth/redeem", {
        method: "POST",
        body: JSON.stringify({ code: "SINGLE-USE-CODE" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("This code has reached its maximum number of uses.");
    });
  });
});
