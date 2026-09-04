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

export interface Bumper {
  id: string;
  /** Retro "station ID" caption shown over the filler reel. */
  label: string;
  url: string;
}

export const BUMPERS: Bumper[] = [
  {
    id: "big-buck-bunny",
    label: "CABLECAST NETWORK ID",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    id: "elephants-dream",
    label: "STAND BY FOR PROGRAMMING",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  {
    id: "for-bigger-blazes",
    label: "WE'LL BE RIGHT BACK",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  },
  {
    id: "for-bigger-fun",
    label: "STATION BREAK",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  },
  {
    id: "for-bigger-joyrides",
    label: "CABLECAST PRESENTS",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  },
  {
    id: "sintel",
    label: "THANKS FOR WATCHING",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
];

/** Picks a random bumper, optionally avoiding an immediate repeat of `excludeId`. */
export function getRandomBumper(excludeId?: string): Bumper {
  const pool = excludeId ? BUMPERS.filter((bumper) => bumper.id !== excludeId) : BUMPERS;
  const list = pool.length > 0 ? pool : BUMPERS;
  return list[Math.floor(Math.random() * list.length)];
}
