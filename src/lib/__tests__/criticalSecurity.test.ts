import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/server", () => ({
  getSession: vi.fn().mockResolvedValue(null),
  getPersistentUserId: vi.fn().mockReturnValue("test-user-id"),
}));

const mockDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

describe("Batch 1: Critical Security Fixes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.CRON_SECRET;
    mockDeleteMany.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Fix 1: webpush.ts VAPID keys security", () => {
    it("does not expose hardcoded fallback private or public keys when environment variables are unset", async () => {
      const webpush = await import("@/lib/notifications/webpush");

      expect(webpush.VAPID_PRIVATE_KEY).toBe("");
      expect(webpush.VAPID_PUBLIC_KEY).toBe("");
      expect(webpush.VAPID_PRIVATE_KEY).not.toBe("CviFIGj460TcI-jkvZZ1vLwapePJnmZrgK1VhoLpUos");
      expect(webpush.VAPID_PUBLIC_KEY).not.toBe(
        "BDkweSurB0QTH8HH9yMgH1_bEiQdEMqqTW7fwlefnuAbtexNrSXwlRLv1sclHaa1dvIfbaTf4mqevj7ZS9ibUwk"
      );
    });

    it("returns error gracefully without throwing when attempting to send notification without valid keys", async () => {
      const { sendPushNotification } = await import("@/lib/notifications/webpush");

      const result = await sendPushNotification(
        {
          endpoint: "https://example.com/endpoint",
          p256dh: "mock-p256dh",
          auth: "mock-auth",
        },
        {
          title: "Test Alert",
          body: "Test Body",
          data: { url: "/" },
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("WebPush not configured with valid VAPID keys");
    });
  });

  describe("Fix 2 & Fix 3: QStash dispatch-appointment webhook security", () => {
    it("rejects unauthenticated requests in production with 401 when signature is missing", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.QSTASH_CURRENT_SIGNING_KEY = "sig_current";
      process.env.QSTASH_NEXT_SIGNING_KEY = "sig_next";
      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");

      const req = new NextRequest("https://cablecast.tv/api/notifications/dispatch-appointment", {
        method: "POST",
        body: JSON.stringify({ scheduleId: "slot-xyz" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Missing QStash signature");
    });

    it("rejects invalid signature with 401", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.QSTASH_CURRENT_SIGNING_KEY = "sig_current";
      process.env.QSTASH_NEXT_SIGNING_KEY = "sig_next";
      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");

      const req = new NextRequest("https://cablecast.tv/api/notifications/dispatch-appointment", {
        method: "POST",
        headers: { "upstash-signature": "invalid_sig" },
        body: JSON.stringify({ scheduleId: "slot-xyz" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Invalid signature");
    });

    it("rejects malformed json payload with 400", async () => {
      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");

      const req = new NextRequest("https://cablecast.tv/api/notifications/dispatch-appointment", {
        method: "POST",
        body: "not-json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid JSON body");
    });

    it("requires scheduleId in request body", async () => {
      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");

      const req = new NextRequest("https://cablecast.tv/api/notifications/dispatch-appointment", {
        method: "POST",
        body: JSON.stringify({ type: "starting_soon" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("scheduleId is required");
    });
  });

  describe("Fix 4: notifications/subscribe/route.ts DELETE scoping", () => {
    it("returns 400 if endpoint is missing in DELETE payload", async () => {
      const { DELETE } = await import("@/app/api/notifications/subscribe/route");

      const req = new NextRequest("https://cablecast.tv/api/notifications/subscribe", {
        method: "DELETE",
        body: JSON.stringify({}),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Endpoint required to unsubscribe.");
    });

    it("scopes deletion to the authenticated user's subscriptions", async () => {
      const { DELETE } = await import("@/app/api/notifications/subscribe/route");

      const req = new NextRequest("https://cablecast.tv/api/notifications/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: "https://push.example.com/sub/123" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          endpoint: "https://push.example.com/sub/123",
          userId: { in: ["test-user-id"] },
        },
      });
    });
  });
});
