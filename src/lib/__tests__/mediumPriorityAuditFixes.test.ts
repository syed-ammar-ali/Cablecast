import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

vi.mock("server-only", () => ({}));

// Mock next/headers
const mockHeaderStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(async () => ({
    get: (key: string) => mockHeaderStore.get(key.toLowerCase()) || null,
  })),
}));

describe("Medium Priority Audit Fixes", () => {
  beforeEach(() => {
    mockHeaderStore.clear();
    mockHeaderStore.set("x-forwarded-for", "127.0.0.1");
  });

  describe("Fix: Rate Limiting Sliding Window & Enforcement", () => {
    it("allows requests within window and decrements remaining count", async () => {
      const bucketKey = "test-rate-limit-pass-" + Date.now();
      const res1 = await checkRateLimit(bucketKey, { maxRequests: 3, windowMs: 60_000 });
      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await checkRateLimit(bucketKey, { maxRequests: 3, windowMs: 60_000 });
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(1);
    }, 15000);

    it("blocks requests when limit is exceeded and provides retryAfterSeconds", async () => {
      const bucketKey = "test-rate-limit-block-" + Date.now();
      await checkRateLimit(bucketKey, { maxRequests: 2, windowMs: 60_000 });
      await checkRateLimit(bucketKey, { maxRequests: 2, windowMs: 60_000 });

      const blocked = await checkRateLimit(bucketKey, { maxRequests: 2, windowMs: 60_000 });
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }, 15000);
  });

  describe("Fix: In-Memory Proxy Cache Invalidation", () => {
    it("exports invalidateProxySessionCache without errors", async () => {
      const { invalidateProxySessionCache } = await import("@/proxy");
      expect(typeof invalidateProxySessionCache).toBe("function");

      // Test selective and full invalidation
      expect(() => invalidateProxySessionCache("test-token")).not.toThrow();
      expect(() => invalidateProxySessionCache()).not.toThrow();
    });
  });
});
