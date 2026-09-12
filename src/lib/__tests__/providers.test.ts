import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_COUNT } from "@/config/providers";
import {
  buildPlayerSource,
  getNextProviderIndex,
  isDynamicProvider,
  listProviders,
} from "@/lib/providers";

describe("Stream Providers Engine", () => {
  it("has 15 verified, ordered providers in the fallback chain sorted with lowest latency first", () => {
    expect(PROVIDER_COUNT).toBe(15);
    expect(PROVIDERS.length).toBe(15);
    expect(PROVIDERS[0].id).toBe("anyembed-matrix");
    expect(PROVIDERS[1].id).toBe("zxcstream-direct");
    expect(PROVIDERS.some((p) => p.id === "vidlink-primary")).toBe(true);
    expect(PROVIDERS.some((p) => p.id === "videasy-hd")).toBe(true);
  });

  it("builds correct movie and tv URLs with live-offset parameters", () => {
    // Test Feed: VidLink Pro
    const vidlinkIndex = PROVIDERS.findIndex((p) => p.id === "vidlink-primary");
    expect(vidlinkIndex).toBeGreaterThanOrEqual(0);
    const movieSource = buildPlayerSource({
      providerIndex: vidlinkIndex,
      tmdbId: 27205,
      mediaType: "movie",
      startOffsetSeconds: 600,
    });
    expect(movieSource.url).toContain("vidlink.pro/movie/27205");
    expect(movieSource.url).toContain("startAt=600");
    expect(movieSource.url).toContain("primaryColor=6366f1");

    const tvSource = buildPlayerSource({
      providerIndex: vidlinkIndex,
      tmdbId: 1396,
      mediaType: "tv",
      season: 2,
      episode: 3,
      startOffsetSeconds: 300,
    });
    expect(tvSource.url).toContain("vidlink.pro/tv/1396/2/3");
    expect(tvSource.url).toContain("startAt=300");

    // Test Feed: ZXCStream Turbopack
    const zxcIndex = PROVIDERS.findIndex((p) => p.id === "zxcstream-direct");
    expect(zxcIndex).toBeGreaterThanOrEqual(0);
    const zxcMovie = buildPlayerSource({
      providerIndex: zxcIndex,
      tmdbId: 550,
      mediaType: "movie",
      startOffsetSeconds: 120,
    });
    expect(zxcMovie.url).toContain("player.zxcstream.xyz/embed/movie/550");
    expect(zxcMovie.url).toContain("start=120");

    // Test Feed: Videasy HD
    const videasyIndex = PROVIDERS.findIndex((p) => p.id === "videasy-hd");
    expect(videasyIndex).toBeGreaterThanOrEqual(0);
    const videasyMovie = buildPlayerSource({
      providerIndex: videasyIndex,
      tmdbId: 550,
      mediaType: "movie",
      startOffsetSeconds: 120,
    });
    expect(videasyMovie.url).toContain("player.videasy.to/movie/550");
    expect(videasyMovie.url).toContain("start=120");
  });

  it("correctly identifies dynamic niche feeds", () => {
    PROVIDERS.forEach((provider, idx) => {
      expect(isDynamicProvider(idx)).toBe(Boolean(provider.isDynamic));
    });
  });

  it("correctly navigates fallback chain", () => {
    expect(getNextProviderIndex(0)).toBe(1);
    expect(getNextProviderIndex(13)).toBe(14);
    expect(getNextProviderIndex(14)).toBeNull();
  });

  it("lists all providers for the Channel Swap UI and filters by region with specialized prioritization", () => {
    const list = listProviders();
    expect(list.length).toBe(15);
    expect(list[0].id).toBe("anyembed-matrix");

    // Regional filtering & prioritization
    const usList = listProviders("US");
    expect(usList.length).toBeGreaterThan(0);
    expect(usList.some((p) => p.id === "zxcstream-direct")).toBe(true);

    // Japan / Korea: Asian drama & anime specialists are prioritized first
    const jpKrList = listProviders("JP_KR");
    expect(jpKrList[0].id).toBe("kisskh-asian");
    expect(jpKrList[1].id).toBe("gogoanime");

    // India: Lowest latency engines with comprehensive Bollywood / Indian regional content
    const inList = listProviders("IN");
    expect(inList[0].id).toBe("anyembed-matrix");
    expect(inList[1].id).toBe("zxcstream-direct");
  });
});
