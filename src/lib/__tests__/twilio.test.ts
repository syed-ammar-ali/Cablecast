import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms, makeCall, isTwilioConfigured } from "../notifications/twilio";

describe("Twilio Notification Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("isTwilioConfigured", () => {
    it("returns false when any required variable is missing", () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
      expect(isTwilioConfigured()).toBe(false);

      process.env.TWILIO_ACCOUNT_SID = "AC123";
      expect(isTwilioConfigured()).toBe(false);

      process.env.TWILIO_AUTH_TOKEN = "token123";
      expect(isTwilioConfigured()).toBe(false);
    });

    it("returns true when all 3 required variables are present", () => {
      process.env.TWILIO_ACCOUNT_SID = "AC1234567890abcdef";
      process.env.TWILIO_AUTH_TOKEN = "secret_token_value";
      process.env.TWILIO_FROM_NUMBER = "+12015550123";
      expect(isTwilioConfigured()).toBe(true);
    });
  });

  describe("sendSms", () => {
    it("successfully sends an SMS via Twilio API", async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC_TEST_ACCOUNT";
      process.env.TWILIO_AUTH_TOKEN = "TEST_AUTH_TOKEN";
      process.env.TWILIO_FROM_NUMBER = "+12015550123";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sid: "SM_mock_sid_123" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendSms("+15551234567", "Test alert message");

      expect(result.success).toBe(true);
      expect(result.sid).toBe("SM_mock_sid_123");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("AC_TEST_ACCOUNT/Messages.json");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toContain("Basic ");
      expect(options.body).toContain("To=%2B15551234567");
      expect(options.body).toContain("Body=Test+alert+message");
    });

    it("handles Twilio API errors gracefully without throwing", async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC_TEST_ACCOUNT";
      process.env.TWILIO_AUTH_TOKEN = "TEST_AUTH_TOKEN";
      process.env.TWILIO_FROM_NUMBER = "+12015550123";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Invalid phone number", code: 21211 }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendSms("+99999", "Test alert message");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid phone number");
    });
  });

  describe("makeCall", () => {
    it("initiates a voice call with inline TwiML and escaped XML characters", async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC_TEST_ACCOUNT";
      process.env.TWILIO_AUTH_TOKEN = "TEST_AUTH_TOKEN";
      process.env.TWILIO_FROM_NUMBER = "+12015550123";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sid: "CA_mock_call_sid_456" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await makeCall("+15551234567", 'Show "Tom & Jerry" is starting!');

      expect(result.success).toBe(true);
      expect(result.sid).toBe("CA_mock_call_sid_456");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("AC_TEST_ACCOUNT/Calls.json");
      expect(options.method).toBe("POST");
      // Verify special XML characters are escaped in TwiML
      expect(decodeURIComponent(options.body)).toContain("&amp;");
      expect(decodeURIComponent(options.body)).toContain("&quot;");
    });

    it("handles call failure gracefully", async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC_TEST_ACCOUNT";
      process.env.TWILIO_AUTH_TOKEN = "TEST_AUTH_TOKEN";
      process.env.TWILIO_FROM_NUMBER = "+12015550123";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Authentication Error" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await makeCall("+15551234567", "Hello");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Authentication Error");
    });
  });
});
