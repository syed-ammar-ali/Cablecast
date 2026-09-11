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
  targetDayOfWeek?: number; // legacy backwards compatibility
  daysOfWeek?: number[]; // single or multiple days: 0 = Sun, 1 = Mon ... 6 = Sat
  blockStartMinutes: number; // 0-1410 (in 30-min increments)
  dailySlots?: number[]; // Array of start minutes for each episode of the day [slot1, slot2, slot3]
  episodesPerDay?: number; // 1, 2, or 3 episodes per airing day
  startYear: number; // e.g. 2026
  seasons: NostalgiaSeasonInput[];
  startSeason?: number;
  startEpisode?: number;
  endSeason?: number;
  includedSeasonNumbers?: number[];
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
  daysOfWeek: number[];
  blockStartMinutes: number;
  dailySlots: number[];
  episodesPerDay: number;
  startYear: number;
  startSeason: number;
  startEpisode: number;
  endSeason: number | null;
  includedSeasonNumbers: number[];
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
 * Given a date, finds the next calendar day whose day-of-week is in `targetDays`.
 */
export function getNextTargetWeekday(fromDate: Date, targetDays: number[]): Date {
  const next = new Date(fromDate.getTime());
  for (let i = 1; i <= 7; i++) {
    next.setDate(next.getDate() + 1);
    if (targetDays.includes(next.getDay())) {
      return next;
    }
  }
  return next;
}

/**
 * Given a year, month (0-11), and day, finds the weekday closest to that date matching one of `targetDays`.
 */
export function findClosestTargetWeekday(year: number, month: number, day: number, targetDays: number[]): Date {
  if (targetDays.length === 1) {
    return findClosestWeekday(year, month, day, targetDays[0]);
  }

  const d = new Date(year, month, day, 12, 0, 0);
  if (targetDays.includes(d.getDay())) return d;

  let bestDate = findClosestWeekday(year, month, day, targetDays[0]);
  let bestDiff = Math.abs(bestDate.getTime() - d.getTime());

  for (let i = 1; i < targetDays.length; i++) {
    const candidate = findClosestWeekday(year, month, day, targetDays[i]);
    const diff = Math.abs(candidate.getTime() - d.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestDate = candidate;
    }
  }

  return bestDate;
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
    blockStartMinutes,
    startYear,
    seasons,
    startSeason = 1,
    startEpisode = 1,
    endSeason,
    includedSeasonNumbers,
    seasonOverrides = {},
  } = config;

  const rawDays = Array.isArray(config.daysOfWeek) && config.daysOfWeek.length > 0
    ? config.daysOfWeek
    : [config.targetDayOfWeek ?? 4];
  const targetDays = Array.from(
    new Set(rawDays.filter((d) => typeof d === "number" && d >= 0 && d <= 6)),
  ).sort((a, b) => a - b);
  if (targetDays.length === 0) targetDays.push(4);
  const targetDayOfWeek = targetDays[0];

  const rawEpisodesPerDay =
    config.episodesPerDay ??
    (Array.isArray(config.dailySlots) && config.dailySlots.length > 0 ? config.dailySlots.length : 1);
  const effectiveEpisodesPerDay = Math.max(1, Math.min(3, rawEpisodesPerDay));

  let effectiveDailySlots: number[];
  if (Array.isArray(config.dailySlots) && config.dailySlots.length > 0) {
    effectiveDailySlots = config.dailySlots.slice(0, effectiveEpisodesPerDay);
  } else {
    effectiveDailySlots = [blockStartMinutes];
  }
  while (effectiveDailySlots.length < effectiveEpisodesPerDay) {
    const last = effectiveDailySlots[effectiveDailySlots.length - 1];
    effectiveDailySlots.push((last + 30) % 1440);
  }

  const effectiveStartSeason = Math.max(1, startSeason);
  const effectiveStartEpisode = Math.max(1, startEpisode);

  // Filter valid seasons (seasonNumber > 0) and sort chronologically
  let validSeasons = seasons
    .filter((s) => s.seasonNumber > 0 && s.episodes && s.episodes.length > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  if (effectiveStartSeason > 1) {
    validSeasons = validSeasons.filter((s) => s.seasonNumber >= effectiveStartSeason);
  }
  if (endSeason && endSeason >= effectiveStartSeason) {
    validSeasons = validSeasons.filter((s) => s.seasonNumber <= endSeason);
  }
  if (Array.isArray(includedSeasonNumbers) && includedSeasonNumbers.length > 0) {
    validSeasons = validSeasons.filter((s) => includedSeasonNumbers.includes(s.seasonNumber));
  }

  if (validSeasons.length === 0) {
    return {
      showTitle,
      tmdbId,
      posterPath,
      backdropUrl,
      targetDayOfWeek,
      daysOfWeek: targetDays,
      blockStartMinutes,
      dailySlots: effectiveDailySlots,
      episodesPerDay: effectiveEpisodesPerDay,
      startYear,
      startSeason: effectiveStartSeason,
      startEpisode: effectiveStartEpisode,
      endSeason: endSeason ?? null,
      includedSeasonNumbers: [],
      totalSeasons: 0,
      totalEpisodes: 0,
      firstAirDate: "",
      lastAirDate: "",
      seasons: [],
      allEntries: [],
    };
  }

  // Determine the baseline premiere year from the first scheduled season
  const sFirst = validSeasons[0];
  const sFirstEpAir = sFirst.episodes.find((e) => Boolean(e.airDate))?.airDate || sFirst.airDate;
  const sFirstOrigYear = sFirstEpAir ? parseDateSafe(sFirstEpAir).getFullYear() : startYear;

  const scheduledSeasons: ScheduledSeasonPreview[] = [];
  const allEntries: ScheduledEpisodeOutput[] = [];

  for (let sIdx = 0; sIdx < validSeasons.length; sIdx++) {
    const season = validSeasons[sIdx];
    let episodes = [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);

    // If this is the starting season and user requested starting midway through the season
    if (sIdx === 0 && effectiveStartEpisode > 1) {
      const sliced = episodes.filter((ep) => ep.episodeNumber >= effectiveStartEpisode);
      if (sliced.length > 0) {
        episodes = sliced;
      }
    }

    // Original premiere date for this season
    const firstEpAir = episodes.find((e) => Boolean(e.airDate))?.airDate || season.airDate;
    const seasonOrigDate = firstEpAir ? parseDateSafe(firstEpAir) : null;
    const seasonOrigYear = seasonOrigDate ? seasonOrigDate.getFullYear() : sFirstOrigYear + sIdx;

    // Calculate projected target year: preserves gap years if a show took a multi-year break
    const projectedYear = startYear + (seasonOrigYear - sFirstOrigYear);

    // Calculate season premiere date
    let seasonPremiereDate: Date;
    const override = seasonOverrides[season.seasonNumber];

    if (override?.customStartDate) {
      seasonPremiereDate = parseDateSafe(override.customStartDate);
    } else if (seasonOrigDate) {
      // Snap to closest target weekday in the projected year
      seasonPremiereDate = findClosestTargetWeekday(
        projectedYear,
        seasonOrigDate.getMonth(),
        seasonOrigDate.getDate(),
        targetDays,
      );
    } else {
      // Fallback if no air date is known: start in September of that projected year
      seasonPremiereDate = findClosestTargetWeekday(projectedYear, 8, 20, targetDays);
    }

    // Schedule each episode in the season
    const scheduledEpisodes: ScheduledEpisodeOutput[] = [];
    const seasonMilestones = new Set<string>();

    // Baseline original episode date for calculating relative broadcast hiatuses
    const origBaseTime = seasonOrigDate ? seasonOrigDate.getTime() : null;
    let lastAssignedWeekOffset = 0;
    let sameDayEpCount = 0;
    let lastScheduledDateStr = "";
    let currentEpDate = new Date(seasonPremiereDate.getTime());

    for (let eIdx = 0; eIdx < episodes.length; eIdx++) {
      const ep = episodes[eIdx];
      const isPremiere = eIdx === 0;
      const isFinale = eIdx === episodes.length - 1;

      let scheduledDateStr: string;
      let epBlockStartMinutes: number;

      if (effectiveEpisodesPerDay === 1) {
        // Standard 1 episode per airing day
        if (targetDays.length === 1) {
          let weekOffset = eIdx;
          if (origBaseTime && ep.airDate) {
            const epOrigTime = parseDateSafe(ep.airDate).getTime();
            const diffMs = epOrigTime - origBaseTime;
            const rawWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
            weekOffset = Math.max(lastAssignedWeekOffset, rawWeeks);
          } else {
            weekOffset = lastAssignedWeekOffset + (eIdx > 0 ? 1 : 0);
          }
          lastAssignedWeekOffset = weekOffset;

          const epDate = new Date(seasonPremiereDate.getTime());
          epDate.setDate(seasonPremiereDate.getDate() + weekOffset * 7);
          scheduledDateStr = formatDateStr(epDate);
        } else {
          if (eIdx === 0) {
            scheduledDateStr = formatDateStr(currentEpDate);
          } else {
            const prevEp = episodes[eIdx - 1];
            const isSameDayStunt = Boolean(ep.airDate && prevEp.airDate && ep.airDate === prevEp.airDate);
            if (!isSameDayStunt) {
              currentEpDate = getNextTargetWeekday(currentEpDate, targetDays);
            }
            scheduledDateStr = formatDateStr(currentEpDate);
          }
        }

        // Handle same-day stunt episodes (e.g. 2-part premiere)
        if (scheduledDateStr === lastScheduledDateStr) {
          sameDayEpCount++;
          epBlockStartMinutes = (blockStartMinutes + sameDayEpCount * BLOCK_MINUTES) % 1440;
        } else {
          sameDayEpCount = 0;
          epBlockStartMinutes = blockStartMinutes;
          lastScheduledDateStr = scheduledDateStr;
        }
      } else {
        // Multi-episode per day mode (2 or 3 episodes per airing day)
        const slotIndex = eIdx % effectiveEpisodesPerDay;
        epBlockStartMinutes = effectiveDailySlots[slotIndex];

        if (targetDays.length === 1) {
          const weekOffset = Math.floor(eIdx / effectiveEpisodesPerDay);
          const epDate = new Date(seasonPremiereDate.getTime());
          epDate.setDate(seasonPremiereDate.getDate() + weekOffset * 7);
          scheduledDateStr = formatDateStr(epDate);
        } else {
          if (eIdx === 0) {
            scheduledDateStr = formatDateStr(currentEpDate);
          } else if (slotIndex === 0) {
            // First episode of a new broadcast day: advance to next target day
            currentEpDate = getNextTargetWeekday(currentEpDate, targetDays);
            scheduledDateStr = formatDateStr(currentEpDate);
          } else {
            // Consecutive episode on the same broadcast day
            scheduledDateStr = formatDateStr(currentEpDate);
          }
        }
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
    daysOfWeek: targetDays,
    blockStartMinutes,
    dailySlots: effectiveDailySlots,
    episodesPerDay: effectiveEpisodesPerDay,
    startYear,
    startSeason: effectiveStartSeason,
    startEpisode: effectiveStartEpisode,
    endSeason: endSeason ?? null,
    includedSeasonNumbers: validSeasons.map((s) => s.seasonNumber),
    totalSeasons: scheduledSeasons.length,
    totalEpisodes: allEntries.length,
    firstAirDate,
    lastAirDate,
    seasons: scheduledSeasons,
    allEntries,
  };
}
