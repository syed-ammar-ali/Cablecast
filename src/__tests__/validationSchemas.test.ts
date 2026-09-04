import { describe, it, expect } from "vitest";
import {
  isHoneypotTriggered,
  RedeemAccessCodeSchema,
  AdminLoginSchema,
  AdminCreateCodeSchema,
  CreateAccessCodeSchema,
  TmdbDetailsQuerySchema,
  EpisodeCodeLookupSchema,
  TvmazeScheduleQuerySchema,
} from "@/lib/validation/schemas";

describe("Validation Schemas & Honeypot Protection", () => {
  describe("isHoneypotTriggered", () => {
    it("returns false for legitimate user requests (empty/null/undefined)", () => {
      expect(isHoneypotTriggered(undefined)).toBe(false);
      expect(isHoneypotTriggered(null)).toBe(false);
      expect(isHoneypotTriggered("")).toBe(false);
      expect(isHoneypotTriggered("   ")).toBe(false);
    });

    it("returns true when automated bots populate hidden trap fields", () => {
      expect(isHoneypotTriggered("http://spam-bot.xyz")).toBe(true);
      expect(isHoneypotTriggered("viagra")).toBe(true);
      expect(isHoneypotTriggered("a")).toBe(true);
    });
  });

  describe("RedeemAccessCodeSchema", () => {
    it("accepts valid redemption payload and trims whitespace", () => {
      const parsed = RedeemAccessCodeSchema.safeParse({
        code: "  PASS-7789-VIP  ",
        displayName: "  Retro Fan  ",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.code).toBe("PASS-7789-VIP");
        expect(parsed.data.displayName).toBe("Retro Fan");
      }
    });

    it("rejects empty code", () => {
      const parsed = RedeemAccessCodeSchema.safeParse({ code: "   " });
      expect(parsed.success).toBe(false);
    });

    it("rejects codes exceeding max character limit (64 chars)", () => {
      const parsed = RedeemAccessCodeSchema.safeParse({ code: "A".repeat(65) });
      expect(parsed.success).toBe(false);
    });
  });

  describe("AdminLoginSchema", () => {
    it("accepts valid password", () => {
      const parsed = AdminLoginSchema.safeParse({ password: "my-admin-password" });
      expect(parsed.success).toBe(true);
    });

    it("rejects empty password", () => {
      const parsed = AdminLoginSchema.safeParse({ password: "" });
      expect(parsed.success).toBe(false);
    });
  });

  describe("AdminCreateCodeSchema", () => {
    it("validates legitimate code creation options", () => {
      const parsed = AdminCreateCodeSchema.safeParse({
        label: "VIP Beta Access",
        expiresAt: "2026-12-31T23:59:59.000Z",
        maxUses: 10,
        maxDevices: 2,
        showIds: ["show-1", "show-2"],
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid expiration date strings", () => {
      const parsed = AdminCreateCodeSchema.safeParse({
        expiresAt: "not-a-valid-date-timestamp",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects negative or non-integer maxUses / maxDevices", () => {
      expect(AdminCreateCodeSchema.safeParse({ maxUses: -1 }).success).toBe(false);
      expect(AdminCreateCodeSchema.safeParse({ maxUses: 2.5 }).success).toBe(false);
      expect(AdminCreateCodeSchema.safeParse({ maxDevices: 0 }).success).toBe(false);
      expect(AdminCreateCodeSchema.safeParse({ maxDevices: 1000 }).success).toBe(false); // exceeds 100
    });
  });

  describe("CreateAccessCodeSchema", () => {
    it("validates alphanumeric custom codes", () => {
      expect(CreateAccessCodeSchema.safeParse({ customCode: "VCR-RETRO_99" }).success).toBe(true);
    });

    it("rejects custom codes with illegal punctuation or spaces", () => {
      expect(CreateAccessCodeSchema.safeParse({ customCode: "VCR@CODE!" }).success).toBe(false);
      expect(CreateAccessCodeSchema.safeParse({ customCode: "VCR CODE" }).success).toBe(false);
      expect(CreateAccessCodeSchema.safeParse({ customCode: "ab" }).success).toBe(false); // min 4
    });

    it("validates expiresInDays within 1 to 365 range", () => {
      expect(CreateAccessCodeSchema.safeParse({ expiresInDays: 30 }).success).toBe(true);
      expect(CreateAccessCodeSchema.safeParse({ expiresInDays: 0 }).success).toBe(false);
      expect(CreateAccessCodeSchema.safeParse({ expiresInDays: 400 }).success).toBe(false);
    });
  });

  describe("TmdbDetailsQuerySchema", () => {
    it("accepts numeric IDs and valid media types", () => {
      expect(TmdbDetailsQuerySchema.safeParse({ tmdbId: "1399", mediaType: "tv" }).success).toBe(true);
      expect(TmdbDetailsQuerySchema.safeParse({ tmdbId: "550", mediaType: "movie" }).success).toBe(true);
    });

    it("rejects non-numeric IDs", () => {
      expect(TmdbDetailsQuerySchema.safeParse({ tmdbId: "fight-club", mediaType: "movie" }).success).toBe(false);
      expect(TmdbDetailsQuerySchema.safeParse({ tmdbId: "123-abc", mediaType: "movie" }).success).toBe(false);
    });

    it("rejects invalid media types", () => {
      expect(TmdbDetailsQuerySchema.safeParse({ tmdbId: "1399", mediaType: "anime" }).success).toBe(false);
      expect(TmdbDetailsQuerySchema.safeParse({ tmdbId: "1399", mediaType: "stream" }).success).toBe(false);
    });
  });

  describe("EpisodeCodeLookupSchema", () => {
    it("validates clean code strings", () => {
      expect(EpisodeCodeLookupSchema.safeParse({ code: "BB-S01E01" }).success).toBe(true);
    });

    it("rejects empty or overly long codes", () => {
      expect(EpisodeCodeLookupSchema.safeParse({ code: "" }).success).toBe(false);
      expect(EpisodeCodeLookupSchema.safeParse({ code: "A".repeat(20) }).success).toBe(false);
    });
  });

  describe("TvmazeScheduleQuerySchema", () => {
    it("validates date in YYYY-MM-DD format", () => {
      expect(TvmazeScheduleQuerySchema.safeParse({ date: "2026-09-04", country: "US" }).success).toBe(true);
    });

    it("rejects non-standard date formats", () => {
      expect(TvmazeScheduleQuerySchema.safeParse({ date: "09/04/2026" }).success).toBe(false);
      expect(TvmazeScheduleQuerySchema.safeParse({ date: "2026-9-4" }).success).toBe(false);
      expect(TvmazeScheduleQuerySchema.safeParse({ date: "today" }).success).toBe(false);
    });

    it("validates 2-letter country codes", () => {
      expect(TvmazeScheduleQuerySchema.safeParse({ country: "GB" }).success).toBe(true);
      expect(TvmazeScheduleQuerySchema.safeParse({ country: "CA" }).success).toBe(true);
      expect(TvmazeScheduleQuerySchema.safeParse({ country: "USA" }).success).toBe(false);
      expect(TvmazeScheduleQuerySchema.safeParse({ country: "U" }).success).toBe(false);
      expect(TvmazeScheduleQuerySchema.safeParse({ country: "12" }).success).toBe(false);
    });
  });
});
