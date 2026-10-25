import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_COUNT } from "@/config/providers";
import {
  buildPlayerSource,
  getNextProviderIndex,
  isDynamicProvider,
  listProviders,
} from "@/lib/providers";

describe("Stream Providers Engine", () => {
  it("has 10 verified, ordered embedded providers in the fallback chain", () => {
    expect(PROVIDER_COUNT).toBe(10);
    expect(PROVIDERS.length).toBe(10);
    expect(PROVIDERS[0].id).toBe("cinesrc-primary");
    expect(PROVIDERS[1].id).toBe("vixsrc-relay");
    expect(PROVIDERS[2].id).toBe("vidlink-primary");
    expect(PROVIDERS[3].id).toBe("vidcore-edge");
    expect(PROVIDERS[4].id).toBe("anyembed-matrix");
    expect(PROVIDERS[5].id).toBe("vidsrc-pm");
    expect(PROVIDERS[6].id).toBe("vidfast-vc");
    expect(PROVIDERS[7].id).toBe("embedwave-ultra");
    expect(PROVIDERS[8].id).toBe("nontongo-asian");
    expect(PROVIDERS[9].id).toBe("2embed-skin");
  });

  it("builds correct movie and tv URLs with live-offset parameters and case-insensitivity", () => {
    // Test Feed: CineSrc
    const cinesrcIndex = PROVIDERS.findIndex((p) => p.id === "cinesrc-primary");
    expect(cinesrcIndex).toBe(0);
    const cineMovieSource = buildPlayerSource({
      providerIndex: cinesrcIndex,
      tmdbId: 27205,
      mediaType: "movie",
      startOffsetSeconds: 600,
    });
    expect(cineMovieSource.url).toContain("cinesrc.st/embed/movie/27205");
    expect(cineMovieSource.url).toContain("t=600");
    expect(cineMovieSource.url).toContain("continueprompt=false");

    // Test case-insensitive mediaType: "MOVIE"
    const uppercaseMovieSource = buildPlayerSource({
      providerIndex: cinesrcIndex,
      tmdbId: 27205,
      mediaType: "MOVIE" as unknown as "movie",
    });
    expect(uppercaseMovieSource.url).toContain("cinesrc.st/embed/movie/27205");

    const cineTvSource = buildPlayerSource({
      providerIndex: cinesrcIndex,
      tmdbId: 1396,
      mediaType: "tv",
      season: 2,
      episode: 3,
      startOffsetSeconds: 300,
    });
    expect(cineTvSource.url).toContain("cinesrc.st/embed/tv/1396?s=2&e=3");
    expect(cineTvSource.url).toContain("t=300");
    expect(cineTvSource.url).toContain("autoskip=true");

    // Test Feed: VixSrc
    const vixsrcIndex = PROVIDERS.findIndex((p) => p.id === "vixsrc-relay");
    expect(vixsrcIndex).toBe(1);
    const vixMovieSource = buildPlayerSource({
      providerIndex: vixsrcIndex,
      tmdbId: 786892,
      mediaType: "movie",
      startOffsetSeconds: 120,
    });
    expect(vixMovieSource.url).toContain("vixsrc.to/movie/786892");
    expect(vixMovieSource.url).toContain("startAt=120");

    // Test Feed: VidLink Pro
    const vidlinkIndex = PROVIDERS.findIndex((p) => p.id === "vidlink-primary");
    expect(vidlinkIndex).toBe(2);
    const movieSource = buildPlayerSource({
      providerIndex: vidlinkIndex,
      tmdbId: 27205,
      mediaType: "movie",
      startOffsetSeconds: 600,
    });
    expect(movieSource.url).toContain("vidlink.pro/movie/27205");
    expect(movieSource.url).toContain("startAt=600");
    expect(movieSource.url).toContain("primaryColor=6366f1");

    // Test Feed: VidCore Edge
    const vidcoreIndex = PROVIDERS.findIndex((p) => p.id === "vidcore-edge");
    expect(vidcoreIndex).toBe(3);
    const vidcoreTv = buildPlayerSource({
      providerIndex: vidcoreIndex,
      tmdbId: 1396,
      mediaType: "tv",
      season: 1,
      episode: 1,
      startOffsetSeconds: 120,
    });
    expect(vidcoreTv.url).toContain("vidcore.org/embed/tv/1396/1/1");
    expect(vidcoreTv.url).toContain("start=120");

    // Test Feed: AnyEmbed Matrix
    const anyembedIndex = PROVIDERS.findIndex((p) => p.id === "anyembed-matrix");
    expect(anyembedIndex).toBe(4);
    const anyembedMovie = buildPlayerSource({
      providerIndex: anyembedIndex,
      tmdbId: 550,
      mediaType: "movie",
      startOffsetSeconds: 120,
    });
    expect(anyembedMovie.url).toContain("anyembed.xyz/embed/tmdb-movie-550");
    expect(anyembedMovie.url).toContain("start=120");
  });

  it("correctly identifies static embed feeds", () => {
    PROVIDERS.forEach((provider, idx) => {
      expect(isDynamicProvider(idx)).toBe(false);
    });
  });

  it("correctly navigates fallback chain", () => {
    expect(getNextProviderIndex(0)).toBe(1);
    expect(getNextProviderIndex(8)).toBe(9);
    expect(getNextProviderIndex(9)).toBeNull();
  });

  it("lists all 10 providers for Global and 6 for US", () => {
    const list = listProviders();
    expect(list.length).toBe(10);
    expect(list[0].id).toBe("cinesrc-primary");

    // US list (only core US providers)
    const usList = listProviders("US");
    expect(usList.length).toBe(6);
    expect(usList[0].id).toBe("cinesrc-primary");
    expect(usList[1].id).toBe("vixsrc-relay");
    expect(usList[2].id).toBe("vidlink-primary");
    expect(usList[3].id).toBe("vidcore-edge");
    expect(usList[4].id).toBe("anyembed-matrix");
    expect(usList[5].id).toBe("vidsrc-pm");
  });
});
