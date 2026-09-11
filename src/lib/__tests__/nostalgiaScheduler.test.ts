import { describe, it, expect } from "vitest";
import { generateNostalgiaSchedule } from "../nostalgiaScheduler";

describe("generateNostalgiaSchedule", () => {
  it("correctly maps multi-year seasons and snaps to Thursday without day-hopping", () => {
    const mockConfig = {
      tmdbId: 1668,
      showTitle: "Friends",
      posterPath: "/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
      backdropUrl: null,
      targetDayOfWeek: 4, // Thursday
      blockStartMinutes: 1230, // 8:30 PM
      startYear: 2026,
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "1994-09-22",
          episodes: [
            { episodeNumber: 1, name: "The Pilot", airDate: "1994-09-22", runtimeMinutes: 22 },
            { episodeNumber: 2, name: "The One with the Sonogram at the End", airDate: "1994-09-29", runtimeMinutes: 22 },
            { episodeNumber: 9, name: "The One Where Underdog Gets Away (Thanksgiving)", airDate: "1994-11-17", runtimeMinutes: 22 },
            { episodeNumber: 10, name: "The One with the Monkey (New Year)", airDate: "1994-12-15", runtimeMinutes: 22 },
            { episodeNumber: 24, name: "The One Where Rachel Finds Out (Finale)", airDate: "1995-05-18", runtimeMinutes: 22 },
          ],
        },
        {
          seasonNumber: 2,
          name: "Season 2",
          airDate: "1995-09-21",
          episodes: [
            { episodeNumber: 1, name: "The One with Ross's New Girlfriend", airDate: "1995-09-21", runtimeMinutes: 22 },
            // Stunt episode that originally aired on Sunday 1996-01-28
            { episodeNumber: 12, name: "The One After the Superbowl (Part 1)", airDate: "1996-01-28", runtimeMinutes: 22 },
            { episodeNumber: 13, name: "The One After the Superbowl (Part 2)", airDate: "1996-01-28", runtimeMinutes: 22 },
          ],
        },
      ],
    };

    const result = generateNostalgiaSchedule(mockConfig);

    expect(result.totalSeasons).toBe(2);
    expect(result.totalEpisodes).toBe(8);

    // Season 1 premiere in 2026 should be Thursday Sep 24, 2026
    const s1 = result.seasons[0];
    expect(s1.projectedYear).toBe(2026);
    expect(s1.projectedStartDate).toBe("2026-09-24");

    // Check all Season 1 episodes land on Thursday (day of week 4)
    for (const ep of s1.episodes) {
      const [y, m, d] = ep.scheduledDate.split("-").map(Number);
      const day = new Date(y, m - 1, d).getDay();
      expect(day).toBe(4);
    }

    // Thanksgiving episode (Ep 9) should land in November 2026
    const thanksgivingEp = s1.episodes.find((e) => e.episodeNumber === 9);
    expect(thanksgivingEp?.scheduledDate).toBe("2026-11-19");
    expect(thanksgivingEp?.milestoneBadge).toBe("🍂 Thanksgiving Classic");

    // Christmas/New Year episode (Ep 10) should land in December 2026
    const holidayEp = s1.episodes.find((e) => e.episodeNumber === 10);
    expect(holidayEp?.scheduledDate).toBe("2026-12-17");
    expect(holidayEp?.milestoneBadge).toBe("🎄 Holiday Special");

    // Season 2 in 2027 should start on Thursday Sep 23, 2027
    const s2 = result.seasons[1];
    expect(s2.projectedYear).toBe(2027);
    expect(s2.projectedStartDate).toBe("2027-09-23");

    // Super Bowl stunt episodes (Ep 12 & 13) should snap to Thursday (not Sunday)
    const superbowlPart1 = s2.episodes.find((e) => e.episodeNumber === 12);
    const superbowlPart2 = s2.episodes.find((e) => e.episodeNumber === 13);
    expect(superbowlPart1?.scheduledDate).toBe("2028-01-27");
    expect(superbowlPart2?.scheduledDate).toBe("2028-01-27");

    // And they should air back-to-back in consecutive 30-min blocks!
    expect(superbowlPart1?.blockStartMinutes).toBe(1230); // 8:30 PM
    expect(superbowlPart2?.blockStartMinutes).toBe(1260); // 9:00 PM
  });

  it("schedules episodes smoothly across multiple selected days of the week", () => {
    const multiDayConfig = {
      tmdbId: 1399,
      showTitle: "Game of Thrones",
      posterPath: "/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg",
      backdropUrl: null,
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      blockStartMinutes: 1200,
      startYear: 2026,
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "2011-04-17",
          episodes: [
            { episodeNumber: 1, name: "Winter Is Coming", airDate: "2011-04-17", runtimeMinutes: 62 },
            { episodeNumber: 2, name: "The Kingsroad", airDate: "2011-04-24", runtimeMinutes: 56 },
            { episodeNumber: 3, name: "Lord Snow", airDate: "2011-05-01", runtimeMinutes: 58 },
            { episodeNumber: 4, name: "Cripples, Bastards, and Broken Things", airDate: "2011-05-08", runtimeMinutes: 56 },
            { episodeNumber: 5, name: "The Wolf and the Lion", airDate: "2011-05-15", runtimeMinutes: 55 },
          ],
        },
      ],
    };

    const result = generateNostalgiaSchedule(multiDayConfig);
    expect(result.daysOfWeek).toEqual([1, 3, 5]);
    expect(result.totalEpisodes).toBe(5);

    const s1 = result.seasons[0];
    const episodeWeekdays = s1.episodes.map((ep) => {
      const [y, m, d] = ep.scheduledDate.split("-").map(Number);
      return new Date(y, m - 1, d).getDay();
    });

    // Verify all episodes land only on Mon (1), Wed (3), or Fri (5)
    for (const wd of episodeWeekdays) {
      expect([1, 3, 5]).toContain(wd);
    }

    // Verify sequential progression across target days
    for (let i = 1; i < s1.episodes.length; i++) {
      expect(s1.episodes[i].scheduledDate > s1.episodes[i - 1].scheduledDate).toBe(true);
    }
  });

  it("supports starting from a later season (e.g. Season 2) with Season 1 excluded", () => {
    const config = {
      tmdbId: 1668,
      showTitle: "Friends",
      posterPath: "/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
      backdropUrl: null,
      targetDayOfWeek: 4, // Thursday
      blockStartMinutes: 1200,
      startYear: 2026,
      startSeason: 2,
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "1994-09-22",
          episodes: [
            { episodeNumber: 1, name: "The Pilot", airDate: "1994-09-22", runtimeMinutes: 22 },
          ],
        },
        {
          seasonNumber: 2,
          name: "Season 2",
          airDate: "1995-09-21",
          episodes: [
            { episodeNumber: 1, name: "The One with Ross's New Girlfriend", airDate: "1995-09-21", runtimeMinutes: 22 },
            { episodeNumber: 2, name: "The One with the Breast Milk", airDate: "1995-09-28", runtimeMinutes: 22 },
          ],
        },
        {
          seasonNumber: 3,
          name: "Season 3",
          airDate: "1996-09-19",
          episodes: [
            { episodeNumber: 1, name: "The One with the Princess Leia Fantasy", airDate: "1996-09-19", runtimeMinutes: 22 },
          ],
        },
      ],
    };

    const result = generateNostalgiaSchedule(config);

    // Season 1 should NOT be in the schedule
    expect(result.seasons.find((s) => s.seasonNumber === 1)).toBeUndefined();
    expect(result.totalSeasons).toBe(2);
    expect(result.startSeason).toBe(2);

    // Season 2 is the starting season and should launch in startYear (2026)
    const s2 = result.seasons[0];
    expect(s2.seasonNumber).toBe(2);
    expect(s2.projectedYear).toBe(2026);
    expect(s2.projectedStartDate).toBe("2026-09-24");

    // Season 3 should air in 2027 (preserving relative gap from Season 2)
    const s3 = result.seasons[1];
    expect(s3.seasonNumber).toBe(3);
    expect(s3.projectedYear).toBe(2027);
  });

  it("supports starting mid-season at a specific episode offset", () => {
    const config = {
      tmdbId: 1668,
      showTitle: "Friends",
      posterPath: "/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
      backdropUrl: null,
      targetDayOfWeek: 4,
      blockStartMinutes: 1200,
      startYear: 2026,
      startSeason: 1,
      startEpisode: 3, // Start at Episode 3
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "1994-09-22",
          episodes: [
            { episodeNumber: 1, name: "Ep 1", airDate: "1994-09-22", runtimeMinutes: 22 },
            { episodeNumber: 2, name: "Ep 2", airDate: "1994-09-29", runtimeMinutes: 22 },
            { episodeNumber: 3, name: "Ep 3", airDate: "1994-10-06", runtimeMinutes: 22 },
            { episodeNumber: 4, name: "Ep 4", airDate: "1994-10-13", runtimeMinutes: 22 },
          ],
        },
      ],
    };

    const result = generateNostalgiaSchedule(config);
    expect(result.seasons[0].episodes.length).toBe(2);
    expect(result.seasons[0].episodes[0].episodeNumber).toBe(3);
    expect(result.seasons[0].episodes[1].episodeNumber).toBe(4);
    expect(result.startEpisode).toBe(3);
  });

  it("supports cherry-picking specific seasons and capping with endSeason", () => {
    const config = {
      tmdbId: 1668,
      showTitle: "Friends",
      posterPath: "/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
      backdropUrl: null,
      targetDayOfWeek: 4,
      blockStartMinutes: 1200,
      startYear: 2026,
      endSeason: 3,
      includedSeasonNumbers: [1, 3], // Skip Season 2
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "1994-09-22",
          episodes: [{ episodeNumber: 1, name: "Ep 1", airDate: "1994-09-22" }],
        },
        {
          seasonNumber: 2,
          name: "Season 2",
          airDate: "1995-09-21",
          episodes: [{ episodeNumber: 1, name: "Ep 1", airDate: "1995-09-21" }],
        },
        {
          seasonNumber: 3,
          name: "Season 3",
          airDate: "1996-09-19",
          episodes: [{ episodeNumber: 1, name: "Ep 1", airDate: "1996-09-19" }],
        },
        {
          seasonNumber: 4,
          name: "Season 4",
          airDate: "1997-09-25",
          episodes: [{ episodeNumber: 1, name: "Ep 1", airDate: "1997-09-25" }],
        },
      ],
    };

    const result = generateNostalgiaSchedule(config);
    const seasonNumbers = result.seasons.map((s) => s.seasonNumber);
    expect(seasonNumbers).toEqual([1, 3]);
    expect(result.endSeason).toBe(3);
  });

  it("schedules 2 episodes per day consecutively (back-to-back) with strict auto-incrementation", () => {
    const config = {
      tmdbId: 1668,
      showTitle: "Friends",
      posterPath: "/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
      backdropUrl: null,
      targetDayOfWeek: 4, // Thursday
      blockStartMinutes: 1200, // 8:00 PM
      dailySlots: [1200, 1230], // 8:00 PM and 8:30 PM back-to-back
      episodesPerDay: 2,
      startYear: 2026,
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "1994-09-22",
          episodes: [
            { episodeNumber: 1, name: "The Pilot", airDate: "1994-09-22", runtimeMinutes: 22 },
            { episodeNumber: 2, name: "Ep 2", airDate: "1994-09-29", runtimeMinutes: 22 },
            { episodeNumber: 3, name: "Ep 3", airDate: "1994-10-06", runtimeMinutes: 22 },
            { episodeNumber: 4, name: "Ep 4", airDate: "1994-10-13", runtimeMinutes: 22 },
            { episodeNumber: 5, name: "Ep 5", airDate: "1994-10-20", runtimeMinutes: 22 },
          ],
        },
      ],
    };

    const result = generateNostalgiaSchedule(config);
    expect(result.episodesPerDay).toBe(2);
    expect(result.dailySlots).toEqual([1200, 1230]);
    const eps = result.seasons[0].episodes;
    expect(eps.length).toBe(5);

    // Day 1 (Week 0: 2026-09-24)
    expect(eps[0].episodeNumber).toBe(1);
    expect(eps[0].scheduledDate).toBe("2026-09-24");
    expect(eps[0].blockStartMinutes).toBe(1200); // 8:00 PM

    expect(eps[1].episodeNumber).toBe(2);
    expect(eps[1].scheduledDate).toBe("2026-09-24");
    expect(eps[1].blockStartMinutes).toBe(1230); // 8:30 PM

    // Day 2 (Week 1: 2026-10-01)
    expect(eps[2].episodeNumber).toBe(3);
    expect(eps[2].scheduledDate).toBe("2026-10-01");
    expect(eps[2].blockStartMinutes).toBe(1200); // 8:00 PM

    expect(eps[3].episodeNumber).toBe(4);
    expect(eps[3].scheduledDate).toBe("2026-10-01");
    expect(eps[3].blockStartMinutes).toBe(1230); // 8:30 PM

    // Day 3 (Week 2: 2026-10-08, 1 episode finale)
    expect(eps[4].episodeNumber).toBe(5);
    expect(eps[4].scheduledDate).toBe("2026-10-08");
    expect(eps[4].blockStartMinutes).toBe(1200);
  });

  it("schedules 3 episodes per day spaced out throughout the day with strict auto-incrementation", () => {
    const config = {
      tmdbId: 1668,
      showTitle: "Friends",
      posterPath: "/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
      backdropUrl: null,
      targetDayOfWeek: 4, // Thursday
      blockStartMinutes: 780,
      dailySlots: [780, 1200, 1380], // 1:00 PM, 8:00 PM, 11:00 PM
      episodesPerDay: 3,
      startYear: 2026,
      seasons: [
        {
          seasonNumber: 1,
          name: "Season 1",
          airDate: "1994-09-22",
          episodes: [
            { episodeNumber: 1, name: "Ep 1", airDate: "1994-09-22" },
            { episodeNumber: 2, name: "Ep 2", airDate: "1994-09-29" },
            { episodeNumber: 3, name: "Ep 3", airDate: "1994-10-06" },
            { episodeNumber: 4, name: "Ep 4", airDate: "1994-10-13" },
            { episodeNumber: 5, name: "Ep 5", airDate: "1994-10-20" },
            { episodeNumber: 6, name: "Ep 6", airDate: "1994-10-27" },
          ],
        },
      ],
    };

    const result = generateNostalgiaSchedule(config);
    expect(result.episodesPerDay).toBe(3);
    const eps = result.seasons[0].episodes;
    expect(eps.length).toBe(6);

    // Broadcast Day 1: E1 @ 1:00 PM, E2 @ 8:00 PM, E3 @ 11:00 PM
    expect(eps[0].episodeNumber).toBe(1);
    expect(eps[0].scheduledDate).toBe("2026-09-24");
    expect(eps[0].blockStartMinutes).toBe(780);

    expect(eps[1].episodeNumber).toBe(2);
    expect(eps[1].scheduledDate).toBe("2026-09-24");
    expect(eps[1].blockStartMinutes).toBe(1200);

    expect(eps[2].episodeNumber).toBe(3);
    expect(eps[2].scheduledDate).toBe("2026-09-24");
    expect(eps[2].blockStartMinutes).toBe(1380);

    // Broadcast Day 2: E4 @ 1:00 PM, E5 @ 8:00 PM, E6 @ 11:00 PM
    expect(eps[3].episodeNumber).toBe(4);
    expect(eps[3].scheduledDate).toBe("2026-10-01");
    expect(eps[3].blockStartMinutes).toBe(780);

    expect(eps[4].episodeNumber).toBe(5);
    expect(eps[4].scheduledDate).toBe("2026-10-01");
    expect(eps[4].blockStartMinutes).toBe(1200);

    expect(eps[5].episodeNumber).toBe(6);
    expect(eps[5].scheduledDate).toBe("2026-10-01");
    expect(eps[5].blockStartMinutes).toBe(1380);
  });
});


