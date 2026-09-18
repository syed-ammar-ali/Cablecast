import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  isTelegramConfigured,
  getDefaultTelegramChatId,
} from "../notifications/telegram";

describe("Telegram Notification Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Configuration checks", () => {
    it("isTelegramConfigured returns false when token is missing", () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      expect(isTelegramConfigured()).toBe(false);
    });

    it("isTelegramConfigured returns true when token is present", () => {
      process.env.TELEGRAM_BOT_TOKEN = "123456:ABC-DEF";
      expect(isTelegramConfigured()).toBe(true);
    });

    it("getDefaultTelegramChatId returns the env variable value", () => {
      process.env.TELEGRAM_CHAT_ID = "8703799442";
      expect(getDefaultTelegramChatId()).toBe("8703799442");
    });
  });

  describe("sendTelegramMessage", () => {
    it("successfully sends message via Telegram API", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await sendTelegramMessage("8703799442", "Test broadcast message");
      expect(res.success).toBe(true);
      expect(res.messageId).toBe(42);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/botTEST_TOKEN/sendMessage");
      expect(options.headers["Content-Type"]).toBe("application/json");
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe("8703799442");
      expect(body.text).toBe("Test broadcast message");
      expect(body.parse_mode).toBe("HTML");
    });

    it("handles API error responses gracefully", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: "Bad Request: chat not found" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await sendTelegramMessage("invalid_chat", "Test");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Bad Request: chat not found");
    });
  });

  describe("sendTelegramPhoto", () => {
    it("successfully sends photo with caption", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 99 } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await sendTelegramPhoto(
        "8703799442",
        "https://image.tmdb.org/t/p/w780/poster.jpg",
        "Show starting soon!",
      );
      expect(res.success).toBe(true);
      expect(res.messageId).toBe(99);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/botTEST_TOKEN/sendPhoto");
      const body = JSON.parse(options.body);
      expect(body.photo).toBe("https://image.tmdb.org/t/p/w780/poster.jpg");
      expect(body.caption).toBe("Show starting soon!");
    });

    it("falls back to text message if sendPhoto fails", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ ok: false, description: "Failed to load image" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 101 } }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const res = await sendTelegramPhoto(
        "8703799442",
        "https://broken.link/poster.jpg",
        "Fallback Caption",
      );
      expect(res.success).toBe(true);
      expect(res.messageId).toBe(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
