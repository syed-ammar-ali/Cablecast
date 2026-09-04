import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
let mockHeadersMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mockHeadersMap.get(name.toLowerCase()) ?? null,
  })),
}));

import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

describe("Rate Limiter & Abuse Prevention", () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    vi.useRealTimers();
  });

  describe("getClientIp", () => {
    it("extracts the first IP from x-forwarded-for proxy chain", async () => {
      mockHeadersMap.set("x-forwarded-for", "198.51.100.42, 10.0.0.1, 172.16.0.1");
      const ip = await getClientIp();
      expect(ip).toBe("198.51.100.42");
    });

    it("uses x-real-ip when x-forwarded-for is missing", async () => {
      mockHeadersMap.set("x-real-ip", "203.0.113.88");
      const ip = await getClientIp();
      expect(ip).toBe("203.0.113.88");
    });

    it("falls back to 127.0.0.1 when no forwarding headers exist", async () => {
      const ip = await getClientIp();
      expect(ip).toBe("127.0.0.1");
    });
  });

  describe("checkRateLimit sliding window enforcement", () => {
    it("allows requests under the threshold and decrements remaining", async () => {
      const testBucket = `test-under-limit-${Date.now()}`;
      mockHeadersMap.set("x-forwarded-for", "1.2.3.4");

      const res1 = await checkRateLimit(testBucket, { maxRequests: 3, windowMs: 10000 });
      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await checkRateLimit(testBucket, { maxRequests: 3, windowMs: 10000 });
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await checkRateLimit(testBucket, { maxRequests: 3, windowMs: 10000 });
      expect(res3.success).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it("blocks requests once the threshold is exceeded with retryAfterSeconds", async () => {
      const testBucket = `test-blocked-${Date.now()}`;
      mockHeadersMap.set("x-forwarded-for", "5.6.7.8");

      // Exhaust 2 allowed requests
      await checkRateLimit(testBucket, { maxRequests: 2, windowMs: 5000 });
      await checkRateLimit(testBucket, { maxRequests: 2, windowMs: 5000 });

      // 3rd attempt should be rejected
      const resBlocked = await checkRateLimit(testBucket, { maxRequests: 2, windowMs: 5000 });
      expect(resBlocked.success).toBe(false);
      expect(resBlocked.remaining).toBe(0);
      expect(resBlocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(resBlocked.retryAfterSeconds).toBeLessThanOrEqual(5);
    });

    it("isolates limits across different client IPs", async () => {
      const testBucket = `test-ip-isolation-${Date.now()}`;

      mockHeadersMap.set("x-forwarded-for", "10.0.0.1");
      const resIp1 = await checkRateLimit(testBucket, { maxRequests: 1, windowMs: 5000 });
      expect(resIp1.success).toBe(true);

      // Same bucket, but different IP
      mockHeadersMap.set("x-forwarded-for", "10.0.0.2");
      const resIp2 = await checkRateLimit(testBucket, { maxRequests: 1, windowMs: 5000 });
      expect(resIp2.success).toBe(true);
    });

    it("resets limit window after expiration", async () => {
      const testBucket = `test-reset-${Date.now()}`;
      mockHeadersMap.set("x-forwarded-for", "9.9.9.9");

      // 1 allowed request for a tiny window of 20ms
      await checkRateLimit(testBucket, { maxRequests: 1, windowMs: 20 });
      const blocked = await checkRateLimit(testBucket, { maxRequests: 1, windowMs: 20 });
      expect(blocked.success).toBe(false);

      // Wait 35ms for the window to pass
      await new Promise((resolve) => setTimeout(resolve, 35));

      const allowedAgain = await checkRateLimit(testBucket, { maxRequests: 1, windowMs: 20 });
      expect(allowedAgain.success).toBe(true);
    });
  });
});
