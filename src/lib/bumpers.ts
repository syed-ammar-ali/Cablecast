/**
 * Station bumper / filler reel library.
 *
 * When a program's known runtime ends before the top of its reserved
 * 30-minute broadcast block, we fill the remainder with a short "station
 * ID" style bumper instead of leaving dead air. These point at Google's
 * public `gtv-videos-bucket` sample assets (the Blender Foundation's
 * openly CC-BY-licensed short films) — real, stable, ad-free MP4 files
 * that are safe and legal to embed, unlike scraping third-party streams.
 */

export type BumperCategory =
  | "gaming"
  | "toys-cartoons"
  | "cereal-soda"
  | "fast-food"
  | "station-id"
  | "vhs-promo";

export interface Bumper {
  id: string;
  label: string;
  category: BumperCategory;
  categoryLabel: string;
  url: string;
}

export const BUMPERS: Bumper[] = [
  {
    id: "retro-ad-gaming",
    label: "RETRO COMMERCIAL · 90s CONSOLE GAMING",
    category: "gaming",
    categoryLabel: "16-BIT & 64-BIT GAMING SPOT",
    url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
  },
  {
    id: "retro-ad-cartoons",
    label: "SATURDAY MORNING AD · CLASSIC TOYS & HEROES",
    category: "toys-cartoons",
    categoryLabel: "RETRO TOY COMMERCIAL",
    url: "https://media.w3.org/2010/05/bunny/trailer.mp4",
  },
  {
    id: "retro-ad-cereal",
    label: "RETRO SPOT · SATURDAY MORNING CEREAL & SODA",
    category: "cereal-soda",
    categoryLabel: "BREAKFAST CEREAL SPOT",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
  {
    id: "retro-ad-fastfood",
    label: "MIDNIGHT REEL · 90s PIZZA & FAST FOOD",
    category: "fast-food",
    categoryLabel: "LATE NIGHT AD",
    url: "https://media.w3.org/2010/05/video/movie_300.mp4",
  },
  {
    id: "cablecast-station-id",
    label: "CABLECAST NETWORK ID · STAY TUNED",
    category: "station-id",
    categoryLabel: "NETWORK STATION ID",
    url: "https://vjs.zencdn.net/v/oceans.mp4",
  },
  {
    id: "standby-intermission",
    label: "STAND BY · PROGRAMMING RESUMES SHORTLY",
    category: "station-id",
    categoryLabel: "STATION INTERMISSION",
    url: "https://media.w3.org/2010/05/bunny/trailer.mp4",
  },
  {
    id: "cablecast-vhs-promo",
    label: "FEATURE PRESENTATION · CABLECAST RETRO VAULT",
    category: "vhs-promo",
    categoryLabel: "HOME VIDEO PROMO",
    url: "https://vjs.zencdn.net/v/oceans.mp4",
  },
  {
    id: "station-break",
    label: "STATION BREAK · WE'LL BE RIGHT BACK",
    category: "station-id",
    categoryLabel: "BROADCAST COMMERCIAL BREAK",
    url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
  },
];

/** Picks a random bumper or commercial, avoiding immediate repeats of `excludeId`. */
export function getRandomBumper(excludeId?: string, preferredCategory?: BumperCategory): Bumper {
  let pool = excludeId ? BUMPERS.filter((bumper) => bumper.id !== excludeId) : BUMPERS;
  if (preferredCategory) {
    const categoryFiltered = pool.filter((b) => b.category === preferredCategory);
    if (categoryFiltered.length > 0) pool = categoryFiltered;
  }
  const list = pool.length > 0 ? pool : BUMPERS;
  return list[Math.floor(Math.random() * list.length)];
}
