export interface SeasonalEpisodeItem {
  showId: number;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  airDate: string; // YYYY-MM-DD
  theme: "fall" | "winter" | "spring" | "summer" | "halloween" | "thanksgiving" | "christmas";
  themeBadge: string;
  voteAverage: number;
  posterUrl: string | null;
}

export const CURATED_SEASONAL_EPISODES: SeasonalEpisodeItem[] = [
  // ── FALL / HALLOWEEN / THANKSGIVING ─────────────────────────
  {
    showId: 456,
    showTitle: "The Simpsons",
    seasonNumber: 2,
    episodeNumber: 3,
    name: "Treehouse of Horror",
    overview: "The original Halloween special featuring 'Bad Dream House', 'Hungry Are the Damned', and James Earl Jones narrating 'The Raven'.",
    stillUrl: "https://image.tmdb.org/t/p/w300/oE8Cg0E1L7dF2uN0n5yR4aA8b1d.jpg",
    airDate: "1990-10-25",
    theme: "halloween",
    themeBadge: "🎃 Halloween Classic",
    voteAverage: 8.2,
    posterUrl: "https://image.tmdb.org/t/p/w342/zI3E29ipAfd4fe0n0Vkv6048o4v.jpg",
  },
  {
    showId: 456,
    showTitle: "The Simpsons",
    seasonNumber: 5,
    episodeNumber: 5,
    name: "Treehouse of Horror IV",
    overview: "Bart presents three horrifying stories: Homer sells his soul to the Devil for a donut, Bart sees a gremlin on the school bus, and Mr. Burns is a vampire.",
    stillUrl: "https://image.tmdb.org/t/p/w300/k6v8n7z8y9x0w1v2u3t4s5r6q7p.jpg",
    airDate: "1993-10-28",
    theme: "halloween",
    themeBadge: "🎃 90s Spooky",
    voteAverage: 8.6,
    posterUrl: "https://image.tmdb.org/t/p/w342/zI3E29ipAfd4fe0n0Vkv6048o4v.jpg",
  },
  {
    showId: 1668,
    showTitle: "Friends",
    seasonNumber: 3,
    episodeNumber: 9,
    name: "The One with the Football",
    overview: "On Thanksgiving, the gang plays a fiercely competitive game of touch football in the park for the legendary Geller Cup.",
    stillUrl: "https://image.tmdb.org/t/p/w300/r5t6y7u8i9o0p1a2s3d4f5g6h7j.jpg",
    airDate: "1996-11-21",
    theme: "thanksgiving",
    themeBadge: "🍂 90s Thanksgiving",
    voteAverage: 8.8,
    posterUrl: "https://image.tmdb.org/t/p/w342/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
  },
  {
    showId: 1668,
    showTitle: "Friends",
    seasonNumber: 5,
    episodeNumber: 8,
    name: "The One with All the Thanksgivings",
    overview: "The gang reminisces about their worst Thanksgivings ever, leading to Monica dancing with a turkey on her head to cheer up Chandler.",
    stillUrl: "https://image.tmdb.org/t/p/w300/m1n2b3v4c5x6z7a8s9d0f1g2h3j.jpg",
    airDate: "1998-11-19",
    theme: "thanksgiving",
    themeBadge: "🍂 Thanksgiving Icon",
    voteAverage: 9.1,
    posterUrl: "https://image.tmdb.org/t/p/w342/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
  },
  {
    showId: 2316,
    showTitle: "The Office",
    seasonNumber: 2,
    episodeNumber: 5,
    name: "Halloween",
    overview: "Michael is forced by corporate to fire somebody by the end of October, putting a dark cloud over Dunder Mifflin's Halloween costume party.",
    stillUrl: "https://image.tmdb.org/t/p/w300/e4d5c6b7a8z9y0x1w2v3u4t5s6r.jpg",
    airDate: "2005-10-18",
    theme: "halloween",
    themeBadge: "🎃 Halloween",
    voteAverage: 8.4,
    posterUrl: "https://image.tmdb.org/t/p/w342/7DJKHzAi83BmQrWLrYY5q929dQ8.jpg",
  },
  {
    showId: 48891,
    showTitle: "Brooklyn Nine-Nine",
    seasonNumber: 1,
    episodeNumber: 6,
    name: "Halloween",
    overview: "Jake bets Captain Holt that he can steal the Medal of Valor before midnight, sparking the precinct's annual Halloween Heist tradition.",
    stillUrl: "https://image.tmdb.org/t/p/w300/q1w2e3r4t5y6u7i8o9p0a1s2d3f.jpg",
    airDate: "2013-10-22",
    theme: "halloween",
    themeBadge: "🎃 The Heist Begins",
    voteAverage: 8.7,
    posterUrl: "https://image.tmdb.org/t/p/w342/hgRMSOt7a1b8qyQR68vUixJPang.jpg",
  },
  {
    showId: 48891,
    showTitle: "Brooklyn Nine-Nine",
    seasonNumber: 5,
    episodeNumber: 4,
    name: "HalloVeen",
    overview: "The Fifth Annual Halloween Heist turns deeply personal as Jake has an unforgettable surprise in store for Amy.",
    stillUrl: "https://image.tmdb.org/t/p/w300/l9k8j7h6g5f4d3s2a1p0o9i8u7y.jpg",
    airDate: "2017-10-17",
    theme: "halloween",
    themeBadge: "🎃 HalloVeen Special",
    voteAverage: 9.3,
    posterUrl: "https://image.tmdb.org/t/p/w342/hgRMSOt7a1b8qyQR68vUixJPang.jpg",
  },
  {
    showId: 18347,
    showTitle: "Community",
    seasonNumber: 2,
    episodeNumber: 6,
    name: "Epidemiology",
    overview: "Dean Pelton serves military-grade taco meat at the Greendale Halloween dance, causing a terrifying zombie epidemic set to ABBA's greatest hits.",
    stillUrl: "https://image.tmdb.org/t/p/w300/z0y9x8w7v6u5t4s3r2q1p0o9i8u.jpg",
    airDate: "2010-10-28",
    theme: "halloween",
    themeBadge: "🎃 Zombie Halloween",
    voteAverage: 9.2,
    posterUrl: "https://image.tmdb.org/t/p/w342/3KUjDt8IPqZJXdUR4UiPtJQLrox.jpg",
  },
  {
    showId: 66732,
    showTitle: "Stranger Things",
    seasonNumber: 2,
    episodeNumber: 2,
    name: "Chapter Two: Trick or Treat, Freak",
    overview: "Dressed as the Ghostbusters, the boys hit Hawkins for Halloween trick-or-treating while Will experiences terrifying visions of the shadow monster.",
    stillUrl: "https://image.tmdb.org/t/p/w300/x1y2z3a4b5c6d7e8f9g0h1j2k3l.jpg",
    airDate: "2017-10-27",
    theme: "halloween",
    themeBadge: "🎃 80s Spooky",
    voteAverage: 8.6,
    posterUrl: "https://image.tmdb.org/t/p/w342/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
  },

  // ── WINTER / CHRISTMAS ───────────────────────────────────────
  {
    showId: 2316,
    showTitle: "The Office",
    seasonNumber: 2,
    episodeNumber: 10,
    name: "Christmas Party",
    overview: "Michael trades Secret Santa for Yankee Swap when he gets a homemade oven mitt, unleashing chaos and vodka across the office.",
    stillUrl: "https://image.tmdb.org/t/p/w300/c1d2e3f4g5h6j7k8l9z0x1c2v3b.jpg",
    airDate: "2005-12-06",
    theme: "christmas",
    themeBadge: "❄️ Holiday Classic",
    voteAverage: 9.0,
    posterUrl: "https://image.tmdb.org/t/p/w342/7DJKHzAi83BmQrWLrYY5q929dQ8.jpg",
  },
  {
    showId: 1668,
    showTitle: "Friends",
    seasonNumber: 7,
    episodeNumber: 10,
    name: "The One with the Holiday Armadillo",
    overview: "Unable to rent a Santa suit, Ross invents Santa's part-Jewish representative, the Holiday Armadillo, to teach Ben about Hanukkah.",
    stillUrl: "https://image.tmdb.org/t/p/w300/a1b2c3d4e5f6g7h8j9k0l1z2x3c.jpg",
    airDate: "2000-12-14",
    theme: "christmas",
    themeBadge: "❄️ Holiday Armadillo",
    voteAverage: 8.9,
    posterUrl: "https://image.tmdb.org/t/p/w342/f496cm9enuEsZkSPghkkxYA96Bh.jpg",
  },
  {
    showId: 984,
    showTitle: "Seinfeld",
    seasonNumber: 9,
    episodeNumber: 10,
    name: "The Strike",
    overview: "Frank Costanza introduces the gang to Festivus ('A Festivus for the rest of us!'), featuring the aluminum pole, the Airing of Grievances, and Feats of Strength.",
    stillUrl: "https://image.tmdb.org/t/p/w300/s9d8f7g6h5j4k3l2z1x0c9v8b7n.jpg",
    airDate: "1997-12-18",
    theme: "winter",
    themeBadge: "❄️ Festivus 90s",
    voteAverage: 9.1,
    posterUrl: "https://image.tmdb.org/t/p/w342/aCw8ON0yz3AhngVQa9E2Ss4CVG2.jpg",
  },
  {
    showId: 42009,
    showTitle: "Black Mirror",
    seasonNumber: 2,
    episodeNumber: 4,
    name: "White Christmas",
    overview: "In a remote snowbound outpost on Christmas Day, two men share three chilling tales of technology gone terribly wrong.",
    stillUrl: "https://image.tmdb.org/t/p/w300/h1j2k3l4z5x6c7v8b9n0m1a2s3d.jpg",
    airDate: "2014-12-16",
    theme: "christmas",
    themeBadge: "❄️ Winter Thriller",
    voteAverage: 9.2,
    posterUrl: "https://image.tmdb.org/t/p/w342/7RumKvx3J70y8k8s68n4e45d1w7.jpg",
  },
  {
    showId: 18347,
    showTitle: "Community",
    seasonNumber: 2,
    episodeNumber: 11,
    name: "Abed's Uncontrollable Christmas",
    overview: "When Abed wakes up experiencing the world in stop-motion animation, Professor Duncan and the study group journey to Planet Abed to save the meaning of Christmas.",
    stillUrl: "https://image.tmdb.org/t/p/w300/d4f5g6h7j8k9l0z1x2c3v4b5n6m.jpg",
    airDate: "2010-12-09",
    theme: "christmas",
    themeBadge: "❄️ Claymation Special",
    voteAverage: 8.8,
    posterUrl: "https://image.tmdb.org/t/p/w342/3KUjDt8IPqZJXdUR4UiPtJQLrox.jpg",
  },
  {
    showId: 97546,
    showTitle: "Ted Lasso",
    seasonNumber: 2,
    episodeNumber: 4,
    name: "Carol of the Bells",
    overview: "Christmas arrives in Richmond with Higgins hosting lonely players, Ted drinking alone, and Rebecca arriving like a secret Santa.",
    stillUrl: "https://image.tmdb.org/t/p/w300/k2j3l4m5n6p7q8r9s0t1u2v3w4x.jpg",
    airDate: "2021-08-13",
    theme: "christmas",
    themeBadge: "❄️ Feel Good Holiday",
    voteAverage: 8.9,
    posterUrl: "https://image.tmdb.org/t/p/w342/3P52oz9HPWhIPqkrGFUR8SpW51H.jpg",
  },

  // ── SUMMER / VACATION / ROAD TRIP ────────────────────────────
  {
    showId: 66732,
    showTitle: "Stranger Things",
    seasonNumber: 3,
    episodeNumber: 1,
    name: "Chapter One: Suzie, Do You Copy?",
    overview: "Summer brings new jobs and blooming romance in Hawkins 1985. But radio receiver static hints at a renewed danger from the Upside Down.",
    stillUrl: "https://image.tmdb.org/t/p/w300/q2w3e4r5t6y7u8i9o0p1a2s3d4f.jpg",
    airDate: "2019-07-04",
    theme: "summer",
    themeBadge: "☀️ Summer in Hawkins",
    voteAverage: 8.5,
    posterUrl: "https://image.tmdb.org/t/p/w342/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
  },
  {
    showId: 456,
    showTitle: "The Simpsons",
    seasonNumber: 7,
    episodeNumber: 25,
    name: "Summer of 4 Ft. 2",
    overview: "The Flanders family lends the Simpsons their beach house in Little Pwgmur, where Lisa buys a cool new wardrobe to reinvent her social identity.",
    stillUrl: "https://image.tmdb.org/t/p/w300/w9e8r7t6y5u4i3o2p1a0s9d8f7g.jpg",
    airDate: "1996-05-19",
    theme: "summer",
    themeBadge: "☀️ 90s Summer Beach",
    voteAverage: 8.9,
    posterUrl: "https://image.tmdb.org/t/p/w342/zI3E29ipAfd4fe0n0Vkv6048o4v.jpg",
  },
  {
    showId: 2710,
    showTitle: "It's Always Sunny in Philadelphia",
    seasonNumber: 7,
    episodeNumber: 2,
    name: "The Gang Goes to the Jersey Shore",
    overview: "Dennis and Dee reminisce about their idyllic childhood summer visits to Ocean City, dragging the Gang to the Jersey Shore with chaotic results.",
    stillUrl: "https://image.tmdb.org/t/p/w300/f8g7h6j5k4l3z2x1c0v9b8n7m6a.jpg",
    airDate: "2011-09-22",
    theme: "summer",
    themeBadge: "☀️ Jersey Shore Trip",
    voteAverage: 9.0,
    posterUrl: "https://image.tmdb.org/t/p/w342/xQY54kPq8K8Vv1H1pZ1K9q9V4Z9.jpg",
  },
  {
    showId: 40075,
    showTitle: "Gravity Falls",
    seasonNumber: 1,
    episodeNumber: 1,
    name: "Tourist Trapped",
    overview: "Twins Dipper and Mabel Pines are dropped off for the summer in enigmatic Gravity Falls, Oregon, quickly discovering a mysterious journal in the woods.",
    stillUrl: "https://image.tmdb.org/t/p/w300/j7k8l9z0x1c2v3b4n5m6q7w8e9r.jpg",
    airDate: "2012-06-15",
    theme: "summer",
    themeBadge: "☀️ Summer Mystery",
    voteAverage: 8.7,
    posterUrl: "https://image.tmdb.org/t/p/w342/hY9uC155z4n0x1r1n1n1n1n1n1n.jpg",
  },

  // ── SPRING / FESTIVALS / EASTER ──────────────────────────────
  {
    showId: 2316,
    showTitle: "The Office",
    seasonNumber: 6,
    episodeNumber: 19,
    name: "St. Patrick's Day",
    overview: "Jo Bennett makes everyone stay late on St. Patrick's Day, threatening to ruin Scranton's biggest bar crawl holiday of the year.",
    stillUrl: "https://image.tmdb.org/t/p/w300/z1x2c3v4b5n6m7q8w9e0r1t2y3u.jpg",
    airDate: "2010-03-11",
    theme: "spring",
    themeBadge: "🌸 St. Patrick's Spring",
    voteAverage: 8.2,
    posterUrl: "https://image.tmdb.org/t/p/w342/7DJKHzAi83BmQrWLrYY5q929dQ8.jpg",
  },
  {
    showId: 8592,
    showTitle: "Parks and Recreation",
    seasonNumber: 2,
    episodeNumber: 18,
    name: "The Master Plan",
    overview: "Leslie and the department prepare to announce a major spring festival, but state auditors Chris Traeger and Ben Wyatt arrive with dire budget cuts.",
    stillUrl: "https://image.tmdb.org/t/p/w300/p9o8i7u6y5t4r3e2w1q0z9x8c7v.jpg",
    airDate: "2010-05-06",
    theme: "spring",
    themeBadge: "🌸 Spring Festival",
    voteAverage: 8.9,
    posterUrl: "https://image.tmdb.org/t/p/w342/dDuzipflXjNux59IP6Fj6857ZLM.jpg",
  },
];

export function filterSeasonalEpisodes(options: {
  season?: string | null;
  era?: string | null;
  query?: string | null;
}): SeasonalEpisodeItem[] {
  let list = [...CURATED_SEASONAL_EPISODES];

  if (options.season) {
    const s = options.season.toLowerCase();
    list = list.filter((ep) => {
      if (s === "fall" || s === "autumn") {
        return ep.theme === "fall" || ep.theme === "halloween" || ep.theme === "thanksgiving";
      }
      if (s === "winter") {
        return ep.theme === "winter" || ep.theme === "christmas";
      }
      if (s === "spring") {
        return ep.theme === "spring";
      }
      if (s === "summer") {
        return ep.theme === "summer";
      }
      return true;
    });
  }

  if (options.era) {
    const era = options.era.toLowerCase();
    list = list.filter((ep) => {
      const year = parseInt(ep.airDate.slice(0, 4), 10);
      if (era === "70s") return year >= 1970 && year <= 1979;
      if (era === "80s") return year >= 1980 && year <= 1989;
      if (era === "90s") return year >= 1990 && year <= 1999;
      if (era === "00s") return year >= 2000 && year <= 2009;
      if (era === "10s") return year >= 2010 && year <= 2019;
      if (era === "20s") return year >= 2020 && year <= 2029;
      return true;
    });
  }

  if (options.query && options.query.trim()) {
    const q = options.query.toLowerCase().trim();
    list = list.filter(
      (ep) =>
        ep.showTitle.toLowerCase().includes(q) ||
        ep.name.toLowerCase().includes(q) ||
        ep.overview.toLowerCase().includes(q) ||
        ep.themeBadge.toLowerCase().includes(q),
    );
  }

  return list;
}
