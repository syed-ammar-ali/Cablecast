import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isQStashConfigured,
  getQStashClient,
  getQStashReceiver,
  getAppBaseUrl,
  resetQStashClients,
  scheduleDelayedBroadcastAlert,
} from "@/lib/notifications/qstash";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userPersonalSchedule: {
      findUnique: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
    notificationLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    rental: {
      findFirst: vi.fn(),
    },
    libraryItem: {
      findFirst: vi.fn(),
    },
    pushSubscription: {
      findMany: vi.fn(),
    },
    userPhoneNotification: {
      findMany: vi.fn(),
    },
  },
}));

describe("Upstash QStash Notification Integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    resetQStashClients();
  });

  describe("Configuration & Clients", () => {
    it("detects when QStash is configured", () => {
      process.env.QSTASH_TOKEN = "test-token";
      expect(isQStashConfigured()).toBe(true);

      delete process.env.QSTASH_TOKEN;
      expect(isQStashConfigured()).toBe(false);
    });

    it("instantiates QStash client with token and url", () => {
      process.env.QSTASH_TOKEN = "mock-token";
      process.env.QSTASH_URL = "https://qstash.example.com";

      const client = getQStashClient();
      expect(client).not.toBeNull();
    });

    it("instantiates QStash Receiver when signing keys are present", () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = "sig_current";
      process.env.QSTASH_NEXT_SIGNING_KEY = "sig_next";

      const receiver = getQStashReceiver();
      expect(receiver).not.toBeNull();
    });
  });

  describe("getAppBaseUrl Resolution", () => {
    it("falls back to localhost:3000 in development", () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      delete process.env.VERCEL_URL;
      vi.stubEnv("NODE_ENV", "development");

      expect(getAppBaseUrl()).toBe("http://localhost:3000");
    });

    it("uses requestOrigin when provided", () => {
      expect(getAppBaseUrl("https://my-domain.vercel.app")).toBe("https://my-domain.vercel.app");
    });

    it("falls back to localhost:3000 if no URL environment variables or origin provided", () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      delete process.env.VERCEL_URL;
      expect(getAppBaseUrl()).toBe("http://localhost:3000");
    });

    it("normalizes NEXT_PUBLIC_APP_URL by removing trailing slashes and ensuring protocol", () => {
      process.env.NEXT_PUBLIC_APP_URL = "my-site.tv/";
      expect(getAppBaseUrl()).toBe("https://my-site.tv");

      process.env.NEXT_PUBLIC_APP_URL = "https://custom.cablecast.tv/";
      expect(getAppBaseUrl()).toBe("https://custom.cablecast.tv");
    });

    it("prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL", () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "cablecast.vercel.app";
      process.env.VERCEL_URL = "cablecast-git-branch.vercel.app";

      expect(getAppBaseUrl()).toBe("https://cablecast.vercel.app");
    });
  });

  describe("scheduleDelayedBroadcastAlert", () => {
    it("schedules an alert via QStash when client and public URL are present", async () => {
      process.env.QSTASH_TOKEN = "mock-token";
      process.env.NEXT_PUBLIC_APP_URL = "https://cablecast.tv";
      resetQStashClients();

      const client = getQStashClient();
      expect(client).not.toBeNull();
      const publishSpy = vi.spyOn(client!, "publishJSON").mockResolvedValue({
        messageId: "msg_test_123",
      } as any);

      const alertTime = new Date(Date.now() + 600 * 1000); // 10 minutes in future
      const result = await scheduleDelayedBroadcastAlert({
        scheduleId: "slot-abc",
        alertTime,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("qstash");
      expect(result.messageId).toBe("msg_test_123");
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://cablecast.tv/api/notifications/dispatch-appointment",
          body: {
            scheduleId: "slot-abc",
            type: "starting_soon",
            scheduledFor: alertTime.toISOString(),
          },
          retries: 3,
        }),
      );
    });

    it("falls back to dev_timer when running on localhost", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      delete process.env.VERCEL_URL;
      vi.stubEnv("NODE_ENV", "development");
      resetQStashClients();

      const alertTime = new Date(Date.now() + 5 * 60 * 1000);
      const result = await scheduleDelayedBroadcastAlert({
        scheduleId: "slot-local-123",
        alertTime,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("dev_timer");
    });
  });

  describe("Obsolete Alert Discard Guard in dispatchStartingSoonForSlot", () => {
    it("discards obsolete alert when slot airtime is more than 25 minutes away (e.g. rescheduled)", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { dispatchStartingSoonForSlot } = await import("@/lib/notifications/notificationDispatcher");

      // Slot is scheduled on Sunday (day 0) at 8:00 PM (1200 mins)
      (prisma.userPersonalSchedule.findUnique as any).mockResolvedValue({
        id: "slot-rescheduled-1",
        sessionId: "sess-user-1",
        dayOfWeek: 0, // Sunday
        blockStartMinutes: 1200,
        timezoneOffset: 0,
        mediaType: "movie",
        title: "Rescheduled Movie",
        isRerun: false,
      });

      // Old alert triggers on Friday (day 5) at 7:50 PM
      const nowFriday = new Date(Date.UTC(2026, 8, 18, 19, 50, 0)); // Friday
      const result = await dispatchStartingSoonForSlot("slot-rescheduled-1", nowFriday);

      expect(result.success).toBe(true);
      expect(result.reason).toContain("Obsolete alert discarded");
    });

    it("handles non-existent or deleted slot gracefully", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { dispatchStartingSoonForSlot } = await import("@/lib/notifications/notificationDispatcher");

      (prisma.userPersonalSchedule.findUnique as any).mockResolvedValue(null);

      const result = await dispatchStartingSoonForSlot("slot-deleted-999");
      expect(result.success).toBe(true);
      expect(result.reason).toContain("Slot no longer exists");
    });
  });

  describe("dispatch-appointment Webhook Route Handler", () => {
    it("rejects invalid JSON with 400", async () => {
      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");
      const { NextRequest } = await import("next/server");

      const req = new NextRequest("http://localhost:3000/api/notifications/dispatch-appointment", {
        method: "POST",
        body: "invalid json string",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON body");
    });

    it("rejects missing scheduleId with 400", async () => {
      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");
      const { NextRequest } = await import("next/server");

      const req = new NextRequest("http://localhost:3000/api/notifications/dispatch-appointment", {
        method: "POST",
        body: JSON.stringify({ type: "starting_soon" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("scheduleId is required");
    });

    it("rejects request when in production with missing signature and receiver configured", async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = "sig_current";
      process.env.QSTASH_NEXT_SIGNING_KEY = "sig_next";
      vi.stubEnv("NODE_ENV", "production");
      resetQStashClients();

      const { POST } = await import("@/app/api/notifications/dispatch-appointment/route");
      const { NextRequest } = await import("next/server");

      const req = new NextRequest("https://cablecast.tv/api/notifications/dispatch-appointment", {
        method: "POST",
        body: JSON.stringify({ scheduleId: "slot-xyz" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Missing QStash signature");
    });
  });
});

