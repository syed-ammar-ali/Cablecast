import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildPlayerSource } from "@/lib/providers";
import { resolveStream } from "@/lib/streamResolver";
import { PROVIDER_COUNT, PROVIDERS } from "@/config/providers";

describe("Stream Resolvers & Video Provider Pipeline", () => {
  describe("buildPlayerSource", () => {
    it("builds a movie player URL for provider 0", () => {
      const source = buildPlayerSource({
        providerIndex: 0,
        tmdbId: 550, // Fight Club
        mediaType: "movie",
      });

      expect(source.providerIndex).toBe(0);
      expect(source.providerId).toBe(PROVIDERS[0].id);
      expect(source.url).toContain("550");
      expect(source.isLastProvider).toBe(PROVIDER_COUNT === 1);
    });

    it("builds a TV player URL including season and episode", () => {
      const source = buildPlayerSource({
        providerIndex: 0,
        tmdbId: 1399,
        mediaType: "tv",
        season: 2,
        episode: 5,
      });

      expect(source.url).toContain("1399");
      expect(source.url).toMatch(/season|s=2|2/i);
      expect(source.url).toMatch(/episode|e=5|5/i);
    });

    it("clamps negative provider indices to 0", () => {
      const source = buildPlayerSource({
        providerIndex: -5,
        tmdbId: 100,
        mediaType: "movie",
      });
      expect(source.providerIndex).toBe(0);
    });

    it("clamps excessive provider indices to the last available provider", () => {
      const source = buildPlayerSource({
        providerIndex: 999,
        tmdbId: 100,
        mediaType: "movie",
      });
      expect(source.providerIndex).toBe(PROVIDER_COUNT - 1);
      expect(source.isLastProvider).toBe(true);
    });

    it("appends start offset query params when tuned mid-broadcast", () => {
      const source = buildPlayerSource({
        providerIndex: 0,
        tmdbId: 100,
        mediaType: "movie",
        startOffsetSeconds: 450, // 7.5 minutes in
      });

      expect(source.url).toMatch(/start|time|startAt/);
      expect(source.url).toContain("450");
    });

    it("does not append offset query params when startOffsetSeconds is 0 or negative", () => {
      const source = buildPlayerSource({
        providerIndex: 0,
        tmdbId: 100,
        mediaType: "movie",
        startOffsetSeconds: 0,
      });

      expect(source.url).not.toContain("start=0");
      expect(source.url).not.toContain("startAt=0");
    });
  });

  describe("resolveStream pipeline", () => {
    it("resolves a movie stream with fallback embed", async () => {
      const result = await resolveStream({
        tmdbId: 680, // Pulp Fiction
        mediaType: "movie",
        title: "Pulp Fiction",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.streamUrl).toContain("680");
        expect(result.type).toBe("embed");
        expect(result.provider).toBeTruthy();
      }
    });

    it("resolves a TV episode stream with season and episode numbers", async () => {
      const result = await resolveStream({
        tmdbId: 1396, // Breaking Bad
        mediaType: "tv",
        season: 1,
        episode: 1,
        title: "Breaking Bad",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.streamUrl).toContain("1396");
        expect(result.streamUrl).toMatch(/season|s=1|1/i);
      }
    });
  });
});
