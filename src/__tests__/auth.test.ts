import { describe, it, expect, beforeAll } from "vitest";
import { safeCompare, hashPassword, verifyPassword, signJwtToken, verifyJwtToken } from "@/lib/auth/crypto";
import { parseDeviceLabel } from "@/lib/auth/deviceFingerprint";
import { isSessionActive, getAccessCodeRedemptionError } from "@/lib/auth/validity";

describe("Authentication, Tokens & Security", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "super-secure-cablecast-unit-test-secret-key-32b";
  });

  describe("safeCompare", () => {
    it("returns true for identical strings", () => {
      expect(safeCompare("cablecast-secret-123", "cablecast-secret-123")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
      expect(safeCompare("cablecast-secret-123", "cablecast-secret-999")).toBe(false);
    });

    it("returns false for strings of different length", () => {
      expect(safeCompare("short", "much-longer-string")).toBe(false);
    });
  });

  describe("Password Hashing & Verification", () => {
    it("hashes password with bcrypt and verifies successfully", async () => {
      const plain = "VhsVaultPass!2026";
      const hash = await hashPassword(plain);

      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      const isMatch = await verifyPassword(plain, hash);
      expect(isMatch).toBe(true);

      const isWrongMatch = await verifyPassword("WrongPassword!", hash);
      expect(isWrongMatch).toBe(false);
    });

    it("verifies legacy plaintext passwords via safeCompare", async () => {
      const storedPlain = "legacyAdminSecret";
      expect(await verifyPassword("legacyAdminSecret", storedPlain)).toBe(true);
      expect(await verifyPassword("wrongSecret", storedPlain)).toBe(false);
    });

    it("returns false when inputs are empty or missing", async () => {
      expect(await verifyPassword("", "secret")).toBe(false);
      expect(await verifyPassword("password", "")).toBe(false);
    });
  });

  describe("JWT Signing & Verification", () => {
    it("signs and verifies a valid JWT payload", async () => {
      const payload = { userId: "user-test-42", role: "subscriber" };
      const token = await signJwtToken(payload, "1h");

      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // standard 3-segment JWT

      const verified = await verifyJwtToken<{ userId: string; role: string; iss?: string }>(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("user-test-42");
      expect(verified?.role).toBe("subscriber");
      expect(verified?.iss).toBe("cablecast");
    });

    it("returns null for tampered or invalid JWT strings", async () => {
      const invalid = "header.payload.invalidsignature";
      expect(await verifyJwtToken(invalid)).toBeNull();
      expect(await verifyJwtToken("")).toBeNull();
      expect(await verifyJwtToken("garbage-token")).toBeNull();
    });
  });

  describe("parseDeviceLabel", () => {
    it("identifies Windows desktop browsers", () => {
      const chromeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      expect(parseDeviceLabel(chromeWin)).toBe("Chrome on Windows");

      const edgeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
      expect(parseDeviceLabel(edgeWin)).toBe("Edge on Windows");

      const firefoxWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
      expect(parseDeviceLabel(firefoxWin)).toBe("Firefox on Windows");
    });

    it("identifies macOS browsers", () => {
      const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
      expect(parseDeviceLabel(macSafari)).toBe("Safari on macOS");
    });

    it("identifies mobile devices", () => {
      const iPhone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
      expect(parseDeviceLabel(iPhone)).toBe("Safari on iPhone (iOS 17.2)");

      const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36";
      expect(parseDeviceLabel(android)).toBe("Chrome on Android");
    });

    it("handles missing or invalid user agents gracefully", () => {
      expect(parseDeviceLabel(null)).toBe("Unknown Device");
      expect(parseDeviceLabel(undefined)).toBe("Unknown Device");
      expect(parseDeviceLabel("")).toBe("Unknown Device");
    });
  });

  describe("isSessionActive & getAccessCodeRedemptionError", () => {
    const now = new Date(2026, 8, 4, 12, 0);

    it("validates active unrevoked session", () => {
      const session = {
        revokedAt: null,
        expiresAt: new Date(2026, 8, 4, 18, 0), // 6h in future
        accessCode: { revoked: false, expiresAt: null },
      };
      expect(isSessionActive(session, now)).toBe(true);
    });

    it("rejects revoked session", () => {
      const session = {
        revokedAt: new Date(2026, 8, 4, 11, 0), // revoked 1h ago
        expiresAt: new Date(2026, 8, 4, 18, 0),
        accessCode: null,
      };
      expect(isSessionActive(session, now)).toBe(false);
    });

    it("rejects session whose access code was revoked or expired", () => {
      const sessionWithRevokedCode = {
        revokedAt: null,
        expiresAt: new Date(2026, 8, 4, 18, 0),
        accessCode: { revoked: true, expiresAt: null },
      };
      expect(isSessionActive(sessionWithRevokedCode, now)).toBe(false);

      const sessionWithExpiredCode = {
        revokedAt: null,
        expiresAt: new Date(2026, 8, 4, 18, 0),
        accessCode: { revoked: false, expiresAt: new Date(2026, 8, 4, 10, 0) },
      };
      expect(isSessionActive(sessionWithExpiredCode, now)).toBe(false);
    });

    it("returns user-friendly error reasons for code redemptions", () => {
      expect(getAccessCodeRedemptionError({ revoked: true, expiresAt: null, maxUses: 5, useCount: 1 }, now)).toBe(
        "This code has been revoked.",
      );

      expect(
        getAccessCodeRedemptionError(
          { revoked: false, expiresAt: new Date(2026, 8, 4, 10, 0), maxUses: 5, useCount: 1 },
          now,
        ),
      ).toBe("This code has expired.");

      expect(
        getAccessCodeRedemptionError({ revoked: false, expiresAt: null, maxUses: 3, useCount: 3 }, now),
      ).toBe("This code has already been used up.");

      expect(
        getAccessCodeRedemptionError({ revoked: false, expiresAt: null, maxUses: 5, useCount: 2 }, now),
      ).toBeNull();
    });
  });
});
