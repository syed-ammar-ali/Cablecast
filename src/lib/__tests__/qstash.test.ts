import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isQStashConfigured,
  getQStashClient,
  getQStashReceiver,
  scheduleDelayedBroadcastAlert,
} from "@/lib/notifications/qstash";

describe("Upstash QStash Notification Integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

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

  it("schedules an alert for a slot with positive delay", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const alertTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes in future

    const result = await scheduleDelayedBroadcastAlert({
      scheduleId: "test-slot-123",
      alertTime,
    });

    expect(result.success).toBe(true);
    expect(["qstash", "dev_timer"]).toContain(result.mode);
  });
});
