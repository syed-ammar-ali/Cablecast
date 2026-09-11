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
});
