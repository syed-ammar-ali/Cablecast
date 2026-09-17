import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { isSlotStartingSoon } from "@/lib/notifications/notificationDispatcher";

vi.mock("server-only", () => ({}));

describe("High Priority Audit Fixes", () => {
  describe("Fix 1 & 2: Timezone Neutral Fallback (UTC / 0)", () => {
    it("defaults timezone to UTC (0) when neither slot nor user offset is specified", () => {
      // 2026-03-01 is a Sunday (dayOfWeek = 0), at 12:00 UTC (720 minutes)
      const now = new Date("2026-03-01T12:00:00Z");
      const slot = {
        dayOfWeek: 0,
        blockStartMinutes: 725, // 12:05 in UTC (5 mins away)
      };

      // When offset is omitted / null, effective offset must be 0 (UTC)
      const result = isSlotStartingSoon(slot, null, now);
      expect(result.isStartingSoon).toBe(true);
      expect(result.localIsoDate).toBe("2026-03-01");
    });

    it("does not falsely trigger using IST (+5:30 / -330) when no offset is supplied", () => {
      // At 12:00 UTC, if it were wrongly IST (-330), local time would be 17:30 (1050 mins)
      const now = new Date("2026-03-01T12:00:00Z");
      const slotInIstTime = {
        dayOfWeek: 0,
        blockStartMinutes: 1055, // 17:35 (would match if default was -330, but should NOT match with 0)
      };

      const result = isSlotStartingSoon(slotInIstTime, null, now);
      expect(result.isStartingSoon).toBe(false);
    });
  });

  describe("Fix 3: icon.svg Performance and Weight", () => {
    it("verifies src/app/icon.svg is a lightweight vector SVG under 5KB", () => {
      const iconPath = path.join(process.cwd(), "src", "app", "icon.svg");
      const stat = fs.statSync(iconPath);
      expect(stat.size).toBeLessThan(5000); // Must be under 5KB (previously 435KB)

      const content = fs.readFileSync(iconPath, "utf8");
      expect(content).toContain("<svg");
      expect(content).toContain("viewBox=");
      expect(content).not.toContain("data:image/png;base64"); // No embedded raster blobs
    });

    it("verifies public/icon.svg is also clean vector SVG under 5KB", () => {
      const iconPath = path.join(process.cwd(), "public", "icon.svg");
      const stat = fs.statSync(iconPath);
      expect(stat.size).toBeLessThan(5000);

      const content = fs.readFileSync(iconPath, "utf8");
      expect(content).toContain("<svg");
      expect(content).not.toContain("data:image/png;base64");
    });
  });
});
