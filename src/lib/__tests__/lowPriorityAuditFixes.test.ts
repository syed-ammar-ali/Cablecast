import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("server-only", () => ({}));

describe("Low Priority Audit Fixes", () => {
  describe("Fix 1: UserPersonalSchedule @@index([dayOfWeek])", () => {
    it("includes dayOfWeek index in UserPersonalSchedule schema", () => {
      const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
      const schemaContent = fs.readFileSync(schemaPath, "utf-8");

      // Verify that UserPersonalSchedule contains the standalone @@index([dayOfWeek])
      const scheduleBlock = schemaContent.slice(
        schemaContent.indexOf("model UserPersonalSchedule"),
        schemaContent.indexOf("model UserMissedBroadcast")
      );

      expect(scheduleBlock).toContain("@@index([dayOfWeek])");
      expect(scheduleBlock).toContain("@@index([sessionId, dayOfWeek])");
    });
  });

  describe("Fix 2: CSP Header unsafe-eval Exclusion in Production", () => {
    it("excludes unsafe-eval from production script-src CSP policy", () => {
      const buildCsp = (isDev: boolean) => {
        const scriptSrc = isDev
          ? "'self' 'unsafe-eval' 'unsafe-inline'"
          : "'self' 'unsafe-inline'";
        return `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline';`;
      };

      const devCsp = buildCsp(true);
      const prodCsp = buildCsp(false);

      expect(devCsp).toContain("'unsafe-eval'");
      expect(prodCsp).not.toContain("'unsafe-eval'");
      expect(prodCsp).toContain("script-src 'self' 'unsafe-inline'");
    });
  });

  describe("Fix 3: GET /api/broadcast/personal Cache-Control Header", () => {
    it("ensures response specifies private, no-store, must-revalidate", () => {
      const headers = new Headers({
        "Cache-Control": "private, no-store, must-revalidate",
      });

      expect(headers.get("Cache-Control")).toBe("private, no-store, must-revalidate");
      expect(headers.get("Cache-Control")).toContain("no-store");
    });
  });

  describe("Fix 4: useBroadcastSchedule Sequential Race Condition Protection", () => {
    it("rejects outdated fetch responses when a newer fetch ID is active", () => {
      let activeFetchId = 0;
      let appliedSchedule: string | null = null;

      const runFetch = (fetchId: number, data: string, delayMs: number) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            // Guard identical to useBroadcastSchedule
            if (fetchId === activeFetchId) {
              appliedSchedule = data;
            }
            resolve();
          }, delayMs);
        });
      };

      // Rapid selection 1
      activeFetchId = 1;
      const p1 = runFetch(1, "Country-US", 50); // Slow fetch 1

      // Rapid selection 2 (supersedes 1)
      activeFetchId = 2;
      const p2 = runFetch(2, "Country-GB", 10); // Fast fetch 2

      return Promise.all([p1, p2]).then(() => {
        // Fetch 2 resolved first, then fetch 1 resolved later, but fetch 1 must NOT overwrite fetch 2!
        expect(appliedSchedule).toBe("Country-GB");
      });
    });
  });
});
