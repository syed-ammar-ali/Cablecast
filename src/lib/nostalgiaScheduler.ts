import { BLOCK_MINUTES, normalizeRuntime } from "./runtime";

export interface NostalgiaEpisodeInput {
  episodeNumber: number;
  name: string;
  airDate: string | null;
  runtimeMinutes?: number | null;
  stillUrl?: string | null;
}

export interface NostalgiaSeasonInput {
  seasonNumber: number;
  name: string;
  airDate: string | null;
  episodes: NostalgiaEpisodeInput[];
}

export interface NostalgiaScheduleConfig {
  tmdbId: number;
  showTitle: string;
  posterPath: string | null;
  backdropUrl: string | null;
  targetDayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 4 = Thursday, ..., 6 = Saturday
  blockStartMinutes: number; // 0-1410 (in 30-min increments)
  startYear: number; // e.g. 2026
  seasons: NostalgiaSeasonInput[];
  seasonOverrides?: Record<number, { customStartDate?: string }>;
}

export interface ScheduledEpisodeOutput {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  scheduledDate: string; // "YYYY-MM-DD"
  blockStartMinutes: number;
  blockCount: number;
  runtimeMinutes?: number;
  milestoneBadge?: string | null;
  originalAirDate: string | null;
  stillUrl?: string | null;
}

export interface ScheduledSeasonPreview {
  seasonNumber: number;
  seasonName: string;
  originalYear: number | null;
  projectedYear: number;
  projectedStartDate: string;
  projectedEndDate: string;
  episodeCount: number;
  episodes: ScheduledEpisodeOutput[];
  milestones: string[];
}

export interface NostalgiaScheduleResult {
  showTitle: string;
  tmdbId: number;
  posterPath: string | null;
  backdropUrl: string | null;
  targetDayOfWeek: number;
  blockStartMinutes: number;
  startYear: number;
  totalSeasons: number;
  totalEpisodes: number;
  firstAirDate: string;
  lastAirDate: string;
  seasons: ScheduledSeasonPreview[];
  allEntries: ScheduledEpisodeOutput[];
}

/** Formats a Date object to YYYY-MM-DD safely in local/UTC terms */
export function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD string into a safe Date object at noon to avoid timezone daylight shifts */
export function parseDateSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Given a year, month (0-11), and day, finds the weekday matching `targetDayOfWeek`
 * within that same broadcast calendar week (within [-3, +3] days).
 */
export function findClosestWeekday(year: number, month: number, day: number, targetDayOfWeek: number): Date {
  const d = new Date(year, month, day, 12, 0, 0);
  const currentDay = d.getDay();
  let diff = targetDayOfWeek - currentDay;

  // Keep within the same 7-day week window
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;

  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Detects holiday milestones and special broadcast moments for an episode
 */
export function detectMilestone(
  scheduledDateStr: string,
  episodeTitle: string,
  isPremiere: boolean,
  isFinale: boolean,
): string | null {
  const titleLower = episodeTitle.toLowerCase();
  const [, monthStr, dayStr] = scheduledDateStr.split("-").map(Number);

  // 1. Halloween (Late October / Early Nov or Title)
  if (
    titleLower.includes("halloween") ||
    titleLower.includes("treehouse of horror") ||
    (monthStr === 10 && dayStr >= 24)
  ) {
    return "🎃 Halloween Episode";
  }

  // 2. Thanksgiving (Late November: Nov 18-30 or Title)
  if (titleLower.includes("thanksgiving") || (monthStr === 11 && dayStr >= 18 && dayStr <= 30)) {
    return "🍂 Thanksgiving Classic";
  }

  // 3. Christmas / Holiday (December 14 - 31 or Title)
  if (
    titleLower.includes("christmas") ||
    titleLower.includes("holiday") ||
    titleLower.includes("new year") ||
    (monthStr === 12 && dayStr >= 14)
  ) {
    return "🎄 Holiday Special";
  }

  // 4. Valentine's Day (Mid-February: Feb 8 - 18 or Title)
  if (titleLower.includes("valentine") || (monthStr === 2 && dayStr >= 8 && dayStr <= 18)) {
    return "💝 Valentine's Week";
  }

  // 5. Premiere or Finale tags
  if (isPremiere) return "🌟 Season Premiere";
  if (isFinale) return "🏁 Season Finale";

  return null;
}

/**
 * Core Algorithm: Generates the full multi-year nostalgia schedule for all seasons of a show.
 */
export function generateNostalgiaSchedule(config: NostalgiaScheduleConfig): NostalgiaScheduleResult {
  const {
    tmdbId,
    showTitle,
    posterPath,
    backdropUrl,
    targetDayOfWeek,
    blockStartMinutes,
    startYear,
    seasons,
    seasonOverrides = {},
  } = config;

  // Filter valid seasons (seasonNumber > 0) and sort chronologically
  const validSeasons = seasons
    .filter((s) => s.seasonNumber > 0 && s.episodes && s.episodes.length > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  if (validSeasons.length === 0) {
    return {
      showTitle,
      tmdbId,
      posterPath,
      backdropUrl,
      targetDayOfWeek,
      blockStartMinutes,
      startYear,
      totalSeasons: 0,
      totalEpisodes: 0,
      firstAirDate: "",
      lastAirDate: "",
      seasons: [],
      allEntries: [],
    };
  }

  // Determine the baseline premiere year of the series from Season 1
  const s1 = validSeasons[0];
  const s1FirstEpAir = s1.episodes.find((e) => Boolean(e.airDate))?.airDate || s1.airDate;
  const s1OrigYear = s1FirstEpAir ? parseDateSafe(s1FirstEpAir).getFullYear() : startYear;

  const scheduledSeasons: ScheduledSeasonPreview[] = [];
  const allEntries: ScheduledEpisodeOutput[] = [];

  for (let sIdx = 0; sIdx < validSeasons.length; sIdx++) {
    const season = validSeasons[sIdx];
    const episodes = [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);

    // Original premiere date for this season
    const firstEpAir = episodes.find((e) => Boolean(e.airDate))?.airDate || season.airDate;
    const seasonOrigDate = firstEpAir ? parseDateSafe(firstEpAir) : null;
    const seasonOrigYear = seasonOrigDate ? seasonOrigDate.getFullYear() : s1OrigYear + sIdx;

    // Calculate projected target year: preserves gap years if a show took a multi-year break
    const projectedYear = startYear + (seasonOrigYear - s1OrigYear);

    // Calculate season premiere date
    let seasonPremiereDate: Date;
    const override = seasonOverrides[season.seasonNumber];

    if (override?.customStartDate) {
      seasonPremiereDate = parseDateSafe(override.customStartDate);
    } else if (seasonOrigDate) {
      // Snap to target weekday in the projected year
      seasonPremiereDate = findClosestWeekday(
        projectedYear,
        seasonOrigDate.getMonth(),
        seasonOrigDate.getDate(),
        targetDayOfWeek,
      );
    } else {
      // Fallback if no air date is known: start in September of that projected year
      seasonPremiereDate = findClosestWeekday(projectedYear, 8, 20, targetDayOfWeek);
    }

    // Schedule each episode in the season
    const scheduledEpisodes: ScheduledEpisodeOutput[] = [];
    const seasonMilestones = new Set<string>();

    // Baseline original episode date for calculating relative broadcast hiatuses
    const origBaseTime = seasonOrigDate ? seasonOrigDate.getTime() : null;
    let lastAssignedWeekOffset = 0;
    let sameDayEpCount = 0;
    let lastScheduledDateStr = "";

    for (let eIdx = 0; eIdx < episodes.length; eIdx++) {
      const ep = episodes[eIdx];
      const isPremiere = eIdx === 0;
      const isFinale = eIdx === episodes.length - 1;

      let weekOffset = eIdx; // Default: 1 episode per week consecutive

      if (origBaseTime && ep.airDate) {
        const epOrigTime = parseDateSafe(ep.airDate).getTime();
        const diffMs = epOrigTime - origBaseTime;
        const rawWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
        // Ensure episode order is monotonic (never go backward)
        weekOffset = Math.max(lastAssignedWeekOffset, rawWeeks);
      } else {
        weekOffset = lastAssignedWeekOffset + (eIdx > 0 ? 1 : 0);
      }

      lastAssignedWeekOffset = weekOffset;

      // Project date
      const epDate = new Date(seasonPremiereDate.getTime());
      epDate.setDate(seasonPremiereDate.getDate() + weekOffset * 7);
      const scheduledDateStr = formatDateStr(epDate);

      // Handle multiple episodes on the same scheduled date (e.g. 2-part premiere/finale)
      let epBlockStartMinutes = blockStartMinutes;
      if (scheduledDateStr === lastScheduledDateStr) {
        sameDayEpCount++;
        epBlockStartMinutes = (blockStartMinutes + sameDayEpCount * BLOCK_MINUTES) % 1440;
      } else {
        sameDayEpCount = 0;
        lastScheduledDateStr = scheduledDateStr;
      }

      // Runtime block
      const runtimeMinutes = ep.runtimeMinutes ?? 30;
      const norm = normalizeRuntime(runtimeMinutes);

      const milestone = detectMilestone(scheduledDateStr, ep.name, isPremiere, isFinale);
      if (milestone) seasonMilestones.add(milestone);

      const scheduledEp: ScheduledEpisodeOutput = {
        seasonNumber: season.seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeTitle: ep.name || `Episode ${ep.episodeNumber}`,
        scheduledDate: scheduledDateStr,
        blockStartMinutes: epBlockStartMinutes,
        blockCount: norm.blockCount,
        runtimeMinutes,
        milestoneBadge: milestone,
        originalAirDate: ep.airDate,
        stillUrl: ep.stillUrl ?? null,
      };

      scheduledEpisodes.push(scheduledEp);
      allEntries.push(scheduledEp);
    }

    const startDate = scheduledEpisodes[0]?.scheduledDate || formatDateStr(seasonPremiereDate);
    const endDate = scheduledEpisodes[scheduledEpisodes.length - 1]?.scheduledDate || startDate;

    scheduledSeasons.push({
      seasonNumber: season.seasonNumber,
      seasonName: season.name || `Season ${season.seasonNumber}`,
      originalYear: seasonOrigYear,
      projectedYear,
      projectedStartDate: startDate,
      projectedEndDate: endDate,
      episodeCount: scheduledEpisodes.length,
      episodes: scheduledEpisodes,
      milestones: Array.from(seasonMilestones),
    });
  }

  const firstAirDate = allEntries[0]?.scheduledDate || "";
  const lastAirDate = allEntries[allEntries.length - 1]?.scheduledDate || "";

  return {
    showTitle,
    tmdbId,
    posterPath,
    backdropUrl,
    targetDayOfWeek,
    blockStartMinutes,
    startYear,
    totalSeasons: scheduledSeasons.length,
    totalEpisodes: allEntries.length,
    firstAirDate,
    lastAirDate,
    seasons: scheduledSeasons,
    allEntries,
  };
}
