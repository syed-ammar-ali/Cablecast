import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispatchStartingSoonAlerts,
  dispatchMissedBroadcastAlerts,
  dispatchTapeExpiringAlerts,
  runAllNotificationDispatchers,
} from "@/lib/notifications/notificationDispatcher";
import { prisma } from "@/lib/prisma";
import * as webpushModule from "@/lib/notifications/webpush";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    userPersonalSchedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    userMissedBroadcast: {
      findMany: vi.fn(),
    },
    rental: {
      findMany: vi.fn(),
    },
    libraryItem: {
      findFirst: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/mediaOwnership", () => ({
  getBroadcastSlotStatus: vi.fn().mockResolvedValue("OWNED"),
}));

describe("Notification Dispatcher Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("dispatchStartingSoonAlerts", () => {
    it("finds slots starting in 10 minutes and sends notification if not previously logged", async () => {
      const mockNow = new Date("2026-09-05T20:00:00Z"); // 8:00 PM UTC
      const currentMinutes = mockNow.getHours() * 60 + mockNow.getMinutes();

      vi.mocked(prisma.userPersonalSchedule.findMany).mockResolvedValueOnce([
        {
          id: "slot-1",
          sessionId: "user-1",
          tmdbId: 101,
          mediaType: "tv",
          title: "Friends",
          currentSeason: 1,
          currentEpisode: 1,
          blockStartMinutes: currentMinutes + 10,
          blockCount: 1,
          posterPath: "/friends.jpg",
          dayOfWeek: mockNow.getDay(),
        } as unknown as any,
      ]);

      // Not yet logged
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValueOnce(null);

      // User has one active subscription
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValueOnce([
        {
          id: "sub-1",
          userId: "user-1",
          endpoint: "https://push.service.com/sub-1",
          p256dh: "key-p256dh",
          auth: "key-auth",
        } as unknown as any,
      ]);

      const spySend = vi.spyOn(webpushModule, "sendPushNotification").mockResolvedValueOnce({
        success: true,
      });

      const result = await dispatchStartingSoonAlerts(mockNow);

      expect(result.count).toBe(1);
      expect(spySend).toHaveBeenCalledTimes(1);
      expect(spySend).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: "https://push.service.com/sub-1" }),
        expect.objectContaining({
          title: "Starting Soon on Cablecast",
          data: expect.objectContaining({ url: "/?view=home#schedule" }),
        }),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
    });

    it("skips slots that have already received a starting soon notification today (idempotency)", async () => {
      const mockNow = new Date("2026-09-05T20:00:00Z");
      const currentMinutes = mockNow.getHours() * 60 + mockNow.getMinutes();

      vi.mocked(prisma.userPersonalSchedule.findMany).mockResolvedValueOnce([
        {
          id: "slot-1",
          sessionId: "user-1",
          tmdbId: 101,
          mediaType: "tv",
          title: "Friends",
          currentSeason: 1,
          currentEpisode: 1,
          blockStartMinutes: currentMinutes + 10,
          dayOfWeek: mockNow.getDay(),
        } as unknown as any,
      ]);

      // Already logged today
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValueOnce({
        id: "log-1",
        userId: "user-1",
        type: "STARTING_SOON",
        referenceId: "slot-1_2026-09-05",
        sentAt: new Date(),
      });

      const spySend = vi.spyOn(webpushModule, "sendPushNotification");

      const result = await dispatchStartingSoonAlerts(mockNow);

      expect(result.count).toBe(0);
      expect(spySend).not.toHaveBeenCalled();
    });
  });

  describe("dispatchMissedBroadcastAlerts", () => {
    it("sends notification for unresolved missed broadcasts and links to rerun reschedule tab", async () => {
      vi.mocked(prisma.userMissedBroadcast.findMany).mockResolvedValueOnce([
        {
          id: "missed-1",
          sessionId: "user-1",
          title: "Friends",
          season: 1,
          episode: 1,
          posterPath: "/friends.jpg",
          isResolved: false,
        } as unknown as any,
      ]);

      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValueOnce(null);

      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValueOnce([
        {
          id: "sub-1",
          userId: "user-1",
          endpoint: "https://push.service.com/sub-1",
          p256dh: "key-p256dh",
          auth: "key-auth",
        } as unknown as any,
      ]);

      const spySend = vi.spyOn(webpushModule, "sendPushNotification").mockResolvedValueOnce({
        success: true,
      });

      const result = await dispatchMissedBroadcastAlerts();

      expect(result.count).toBe(1);
      expect(spySend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "Missed Broadcast",
          data: expect.objectContaining({
            url: "/broadcast?tab=missed&item=missed-1",
            type: "MISSED_BROADCAST",
          }),
        }),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatchTapeExpiringAlerts", () => {
    it("sends notification for rentals expiring in <= 2 hours and links to rented shelf", async () => {
      const mockNow = new Date("2026-09-05T12:00:00Z");
      const expiresAt = new Date(mockNow.getTime() + 90 * 60 * 1000); // 1.5 hours left

      vi.mocked(prisma.rental.findMany).mockResolvedValueOnce([
        {
          id: "rental-1",
          userId: "user-1",
          mediaId: 500,
          seasonNumber: 0,
          title: "Pulp Fiction",
          expiresAt,
        } as unknown as any,
      ]);

      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.libraryItem.findFirst).mockResolvedValueOnce(null); // Not permanently owned
      vi.mocked(prisma.userPersonalSchedule.findFirst).mockResolvedValueOnce(null); // Not scheduled

      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValueOnce([
        {
          id: "sub-1",
          userId: "user-1",
          endpoint: "https://push.service.com/sub-1",
          p256dh: "key-p256dh",
          auth: "key-auth",
        } as unknown as any,
      ]);

      const spySend = vi.spyOn(webpushModule, "sendPushNotification").mockResolvedValueOnce({
        success: true,
      });

      const result = await dispatchTapeExpiringAlerts(mockNow);

      expect(result.count).toBe(1);
      expect(spySend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "⏳ VHS Rental Expiring Soon",
          data: expect.objectContaining({
            url: "/library?tab=rented&tapeId=rental-1",
            type: "TAPE_EXPIRING",
          }),
        }),
      );
    });
  });

  describe("runAllNotificationDispatchers", () => {
    it("aggregates results from all 3 notification channels", async () => {
      vi.mocked(prisma.userPersonalSchedule.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.userMissedBroadcast.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.rental.findMany).mockResolvedValueOnce([]);

      const summary = await runAllNotificationDispatchers();

      expect(summary).toEqual({
        startingSoon: 0,
        missedBroadcast: 0,
        tapeExpiring: 0,
        failedDeliveries: 0,
        cleanedSubscriptions: 0,
      });
    });
  });
});
