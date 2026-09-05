import "server-only";
import type { BroadcastScheduleItem, TvMazeEpisodeRaw } from "@/types/tvmaze";

const TVMAZE_BASE_URL = "https://api.tvmaze.com";
const MAX_NETWORK_RETRIES = 2;
const RETRY_BACKOFF_MS = 150;

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, "").trim();
  return text.length > 0 ? text : null;
}

function formatCleanAirtime(rawAirtime?: string | null): string {
  if (!rawAirtime) return "00:00";
  const trimmed = rawAirtime.trim();
  const isPm = /pm/i.test(trimmed);
  const isAm = /am/i.test(trimmed);
  const clean = trimmed.replace(/[^0-9:]/g, "");
  const [hStr, mStr] = clean.split(":");
  let hours = parseInt(hStr || "0", 10);
  const minutes = parseInt(mStr || "0", 10) || 0;

  if (isPm && hours < 12) {
    hours += 12;
  } else if (isAm && hours === 12) {
    hours = 0;
  }

  const clampedH = Math.max(0, Math.min(23, hours));
  const clampedM = Math.max(0, Math.min(59, minutes));
  return `${String(clampedH).padStart(2, "0")}:${String(clampedM).padStart(2, "0")}`;
}

function normalizeEpisode(raw: TvMazeEpisodeRaw): BroadcastScheduleItem {
  const channel = raw.show.network ?? raw.show.webChannel;

  let episodeName: string | null = raw.name && raw.name !== raw.show.name ? raw.name.trim() : null;
  let episodeNumber: number | null = raw.number ?? null;
  const season: number | null = raw.season ?? null;

  // TVmaze often sets raw.name to "Ep. #9854", "Episode 9854", "Ep #13453", or "Episode 36 - Reunion"
  if (episodeName) {
    const epMatch = episodeName.match(/^ep(?:isode|\.)?\s*#?\s*(\d+)(?:\s*[-:–]\s*(.+))?$/i);
    if (epMatch) {
      const parsedNumber = parseInt(epMatch[1], 10);
      const subtitle = epMatch[2]?.trim() || null;

      if (!Number.isNaN(parsedNumber)) {
        episodeNumber = parsedNumber;
      }
      episodeName = subtitle;
    } else if (/^episode\s+\d+$/i.test(episodeName)) {
      episodeName = null;
    }
  }

  return {
    id: raw.id,
    airtime: formatCleanAirtime(raw.airtime),
    airdate: raw.airdate,
    airstamp: raw.airstamp,
    showName: raw.show.name,
    episodeName,
    season,
    episodeNumber,
    network: channel?.name ?? "Unknown Network",
    countryCode: channel?.country?.code ?? null,
    imageUrl: raw.image?.medium ?? raw.show.image?.medium ?? null,
    summary: stripHtml(raw.summary) ?? stripHtml(raw.show.summary),
    imdbId: raw.show.externals?.imdb ?? null,
    showType: raw.show.type,
    runtime: raw.runtime ?? null,
  };
}

/**
 * Fetches the real-world broadcast schedule for a country + date from
 * TVmaze's public, keyless `/schedule` endpoint. No API key required —
 * this is a free, openly documented metadata API (like TMDB), not a
 * streaming source.
 */
export async function getScheduleForCountryAndDate(
  country: string,
  date: string,
): Promise<BroadcastScheduleItem[]> {
  const url = new URL(`${TVMAZE_BASE_URL}/schedule`);
  url.searchParams.set("country", country);
  url.searchParams.set("date", date);

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(6000),
      });
    } catch (error) {
      if (attempt < MAX_NETWORK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
      const message = error instanceof Error ? error.message : "Unknown network error.";
      throw new Error(`Unable to reach broadcast listings: ${message}`);
    }

    if (!res.ok) {
      throw new Error(`Broadcast listings request failed with status ${res.status}`);
    }

    const raw = (await res.json()) as TvMazeEpisodeRaw[];

    // 1. Strictly filter to episodes that aired on the requested calendar date
    const dateFiltered = raw.filter((item) => !item.airdate || item.airdate === date);

    // 2. Normalize episode structures
    const normalized = dateFiltered.map(normalizeEpisode);

    // 3. Deduplicate duplicate broadcasts on the same network
    const seen = new Set<string>();
    const unique: BroadcastScheduleItem[] = [];

    for (const item of normalized) {
      const dedupeKey = `${item.network.toLowerCase()}|${item.showName.toLowerCase()}|${item.season ?? 0}|${item.episodeNumber ?? 0}|${item.airtime}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        unique.push(item);
      }
    }

    // 4. Sort by network, then airtime
    return unique.sort((a, b) => {
      const netCmp = a.network.localeCompare(b.network);
      if (netCmp !== 0) return netCmp;
      return a.airtime.localeCompare(b.airtime);
    });
  }

  throw new Error("Unable to connect to live broadcast listings.");
}
