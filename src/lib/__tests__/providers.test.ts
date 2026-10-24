import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_COUNT } from "@/config/providers";
import {
  buildPlayerSource,
  getNextProviderIndex,
  isDynamicProvider,
  listProviders,
} from "@/lib/providers";

describe("Stream Providers Engine", () => {
  it("has 5 verified, ordered embedded providers in the fallback chain", () => {
    expect(PROVIDER_COUNT).toBe(5);
    expect(PROVIDERS.length).toBe(5);
    expect(PROVIDERS[0].id).toBe("vidlink-primary");
    expect(PROVIDERS[1].id).toBe("anyembed-matrix");
    expect(PROVIDERS[2].id).toBe("vidsrc-to");
    expect(PROVIDERS[3].id).toBe("embedwave-ultra");
    expect(PROVIDERS[4].id).toBe("2embed-skin");
  });

  it("builds correct movie and tv URLs with live-offset parameters and case-insensitivity", () => {
    // Test Feed: VidLink Pro
    const vidlinkIndex = PROVIDERS.findIndex((p) => p.id === "vidlink-primary");
    expect(vidlinkIndex).toBe(0);
    const movieSource = buildPlayerSource({
      providerIndex: vidlinkIndex,
      tmdbId: 27205,
      mediaType: "movie",
      startOffsetSeconds: 600,
    });
    expect(movieSource.url).toContain("vidlink.pro/movie/27205");
    expect(movieSource.url).toContain("startAt=600");
    expect(movieSource.url).toContain("primaryColor=6366f1");

    // Test case-insensitive mediaType: "MOVIE"
    const uppercaseMovieSource = buildPlayerSource({
      providerIndex: vidlinkIndex,
      tmdbId: 27205,
      mediaType: "MOVIE" as unknown as "movie",
    });
    expect(uppercaseMovieSource.url).toContain("vidlink.pro/movie/27205");

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

    // Test Feed: AnyEmbed Matrix
    const anyembedIndex = PROVIDERS.findIndex((p) => p.id === "anyembed-matrix");
    expect(anyembedIndex).toBe(1);
    const anyembedMovie = buildPlayerSource({
      providerIndex: anyembedIndex,
      tmdbId: 550,
      mediaType: "movie",
      startOffsetSeconds: 120,
    });
    expect(anyembedMovie.url).toContain("anyembed.xyz/embed/tmdb-movie-550");
    expect(anyembedMovie.url).toContain("start=120");

    // Test Feed: EmbedWave Ultra
    const waveIndex = PROVIDERS.findIndex((p) => p.id === "embedwave-ultra");
    expect(waveIndex).toBe(3);
    const waveMovie = buildPlayerSource({
      providerIndex: waveIndex,
      tmdbId: 550,
      mediaType: "movie",
      startOffsetSeconds: 120,
    });
    expect(waveMovie.url).toContain("embedwave.cc/embed/movie/550");
    expect(waveMovie.url).toContain("start=120");
  });

  it("correctly identifies static embed feeds", () => {
    PROVIDERS.forEach((provider, idx) => {
      expect(isDynamicProvider(idx)).toBe(false);
    });
  });

  it("correctly navigates fallback chain", () => {
    expect(getNextProviderIndex(0)).toBe(1);
    expect(getNextProviderIndex(3)).toBe(4);
    expect(getNextProviderIndex(4)).toBeNull();
  });

  it("lists all 5 providers for Global and US", () => {
    const list = listProviders();
    expect(list.length).toBe(5);
    expect(list[0].id).toBe("vidlink-primary");

    // US list
    const usList = listProviders("US");
    expect(usList.length).toBe(5);
    expect(usList[0].id).toBe("vidlink-primary");
    expect(usList[1].id).toBe("anyembed-matrix");
    expect(usList[2].id).toBe("vidsrc-to");
    expect(usList[3].id).toBe("embedwave-ultra");
    expect(usList[4].id).toBe("2embed-skin");
  });
});
