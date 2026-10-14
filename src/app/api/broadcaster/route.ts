import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getSession, getPersistentUserId, type CurrentSession } from "@/lib/auth/server";
import { formatBlockTime, formatBlockTimeRange } from "@/types/broadcast";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface MessagePart {
  role: "user" | "model";
  text: string;
}

interface ClientTimeContext {
  clientTime?: string;
  clientLocalTime?: string;
  clientDate?: string;
  timezone?: string;
  tzOffset?: number;
}

interface VaultItem {
  tmdbId: number;
  title: string;
  mediaType: "tv" | "movie";
  seasonNumber?: number | null;
  posterPath?: string | null;
  backdropUrl?: string | null;
  isOwned: boolean;
}

export interface BroadcasterAction {
  type: "schedule" | "navigate" | "tune_in" | "search" | "rent_buy";
  target?: string;
  payload?: Record<string, unknown>;
}

const DAYS_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseTimeToBlockMinutes(input: unknown): number | null {
  if (typeof input === "number" && !isNaN(input) && input >= 0 && input < 1440) {
    return Math.floor(input / 30) * 30;
  }
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();

  // Match e.g. "9:00 pm", "9:30pm", "9 pm", "9pm", "11:00 am", "11am"
  const match12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const isPm = match12[3] === "pm";
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return Math.floor((h * 60 + m) / 30) * 30;
    }
  }

  // Match 24-hour e.g. "21:00", "09:30", "9:30", "15:00"
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return Math.floor((h * 60 + m) / 30) * 30;
    }
  }

  // Match simple hour e.g. "3pm", "11am", "3"
  const matchHourOnly = s.match(/^(\d{1,2})\s*(am|pm)?$/);
  if (matchHourOnly) {
    let h = parseInt(matchHourOnly[1], 10);
    const meridian = matchHourOnly[2];
    if (meridian === "pm" && h < 12) h += 12;
    if (meridian === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24) {
      return h * 60;
    }
  }

  return null;
}

function parseDayOfWeek(input: unknown, defaultDay: number): number {
  if (typeof input === "number" && !isNaN(input) && input >= 0 && input <= 6) {
    return Math.floor(input);
  }
  if (typeof input !== "string") return defaultDay;
  const s = input.trim().toLowerCase();
  if (s === "today") return defaultDay;
  if (s === "tomorrow") return (defaultDay + 1) % 7;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const idx = days.findIndex((d) => d === s || d.startsWith(s));
  return idx >= 0 ? idx : defaultDay;
}

/* ─── System Prompt Builder ──────────────────────────────────────────────── */

function buildSystemPrompt(ctx: {
  channelName: string;
  libraryTitles: string[];
  scheduleSummary: string;
  clientLocalTime: string;
  clientDate: string;
  dayName: string;
  timezone: string;
  currentBlockRange: string;
  currentLiveStatus: string;
  nextAvailableBlockLabel: string;
  nextAvailableDayName: string;
  nextAvailableBlockMinutes: number;
  openBlocksToday: string[];
  vaultTitles: string;
}) {
  return `You are Broadcaster — an authentic television broadcaster, master programmer, and genuine cinephile friend running the personal station "${ctx.channelName}" on Cablecast together with the user.

## Core Identity & Voice
- You are a real human friend, partner, and television programmer. You are NOT an AI assistant, and you MUST NEVER sound like one.
- Talk like a peer in the booth: conversational, relaxed, witty, opinionated, and passionate about television and movies.
- You have an encyclopedic knowledge of cinema and television (IMDb scores, TMDB data, directors, showrunners, cult classics, episode trivia, syndication history, and cultural impact). When discussing titles, share real insights effortlessly like a movie buff friend.

## STRICT ANTI-ROBOT & ANTI-CLICHÉ GUARDRAILS
1. ZERO STAGE DIRECTIONS OR RP FLUFF:
   - NEVER start messages with cheesy stage directions or narration like:
     * "Static hums on the screen as I tune in for you!"
     * "*turns dial*", "*adjusts knobs in the control room*"
     * "Let's take a look at the rack here in the studio control room."
   - Dive directly into your thought or answer immediately.
2. ZERO CANNED AI CLOSINGS:
   - NEVER end messages with formulaic robotic sign-offs like:
     * "Whenever you're ready, let me know!"
     * "Whenever you're ready to spin up a broadcast, just let me know what you'd like to put on air!"
     * "Let me know if you need anything else!"
     * "How else can I assist you today?"
   - End naturally like a real person finishing a thought or asking an engaging, specific question (e.g., "Want me to lock that in for 2:00 AM, or do you want to save that slot for a movie?").
3. NO ROBOTIC BULLET-POINT DUMPS:
   - Write in crisp, natural, conversational prose. Don't sound like a database readout.

## Current Real-Time Clock & EPG Broadcast Status
- User's Exact Local Time: ${ctx.clientLocalTime} (${ctx.timezone})
- Calendar Date: ${ctx.clientDate} (${ctx.dayName})
- Current Active 30-Minute Broadcast Block: ${ctx.currentBlockRange}
- Current On-Air Status on "${ctx.channelName}": ${ctx.currentLiveStatus}
- NEXT AVAILABLE OPEN BROADCAST BLOCK: ${ctx.nextAvailableBlockLabel} (${ctx.nextAvailableDayName}, ${ctx.nextAvailableBlockMinutes} minutes from midnight)
- Today's Upcoming Open Blocks: ${ctx.openBlocksToday.length > 0 ? ctx.openBlocksToday.join(", ") : "No remaining blocks open today"}

CRITICAL RULE FOR TIME & NEXT BLOCK INQUIRIES:
When the user asks for the current time, schedule status, or the next available block, answer with the exact local time (${ctx.clientLocalTime}) and report the next available block (${ctx.nextAvailableBlockLabel}) directly and naturally.

## The CD Rule & User's Tape Vault
Cablecast operates like physical cassette/tape ownership: users can only put titles on the air that they actually own or actively rent in their physical vault.
Here is the user's verified tape collection:
${ctx.vaultTitles}

- If the user asks to schedule a title they DO NOT own:
  Enforce the CD rule naturally like a friend:
  "Under the CD Rule, we can only broadcast tapes sitting on your shelf. You don't have [Title] in your vault yet. We can head over to the VHS Store to pick it up, and then we'll get it on the lineup."
  And include an action to navigate to the store or rent/buy.

## Current Weekly Broadcast Schedule
${ctx.scheduleSummary || "No shows currently scheduled on this channel (entire week is open)."}

## Interactive Actions & Abilities
You have full authority to execute and recommend Cablecast actions.
When executing an action, append an action block at the VERY END of your message (after two newlines) using this exact syntax:

1. Schedule a broadcast (if user asks for a specific time like "3 PM" or requests next open block):
\`\`\`cablecast_action
{
  "type": "schedule_broadcast",
  "title": "Dawson's Creek",
  "season": 1,
  "episode": 6,
  "time": "3:00 PM",
  "dayOfWeek": "Thursday"
}
\`\`\`

2. Navigate views:
\`\`\`cablecast_action
{
  "type": "navigate",
  "destination": "broadcast" | "library" | "explore" | "home",
  "searchQuery": "optional query"
}
\`\`\`

3. Tune in now:
\`\`\`cablecast_action
{
  "type": "tune_in",
  "title": "Show or movie title"
}
\`\`\`

4. Rent or buy tape from VHS Store:
5. Multi-Episode Pacing, Season Cadence, or Holiday Marathon:
When the user asks for a complex pacing schedule (e.g. "Ep 1 to 7 on Thursdays at 9 PM, then 3 episodes the next week, then 2/week until the finale"):
\`\`\`cablecast_action
{
  "type": "schedule_pacing_campaign",
  "title": "Dawson's Creek",
  "season": 1,
  "campaignName": "Paced Season 1 Run",
  "entries": [
    { "date": "2026-10-15", "time": "9:00 PM", "episode": 1 },
    { "date": "2026-10-22", "time": "9:00 PM", "episode": 2 },
    { "date": "2026-10-29", "time": "9:00 PM", "episode": 3 },
    { "date": "2026-11-05", "time": "9:00 PM", "episode": 4 },
    { "date": "2026-11-12", "time": "9:00 PM", "episode": 5 },
    { "date": "2026-11-19", "time": "9:00 PM", "episode": 6 },
    { "date": "2026-11-26", "time": "9:00 PM", "episode": 7 },
    { "date": "2026-12-03", "time": "9:00 PM", "episode": 8 },
    { "date": "2026-12-03", "time": "9:30 PM", "episode": 9 },
    { "date": "2026-12-03", "time": "10:00 PM", "episode": 10 },
    { "date": "2026-12-10", "time": "9:00 PM", "episode": 11 },
    { "date": "2026-12-10", "time": "9:30 PM", "episode": 12 }
  ]
}
\`\`\`

## Tone Summary
You are an authentic, smart broadcaster and cinephile friend. Direct, insightful, human, and witty. Zero robotic boilerplate.`;
}

/* ─── Assemble User & Time Context ───────────────────────────────────────── */

async function assembleUserContext(
  session: CurrentSession,
  timeCtx: ClientTimeContext
) {
  const userId = getPersistentUserId(session);
  const userKeys = Array.from(new Set([userId, session.id, session.accessCodeId])).filter(
    Boolean
  ) as string[];

  // 1. Fetch library items (owned)
  const libraryItems = await prisma.libraryItem.findMany({
    where: { userId: { in: userKeys } },
    select: {
      mediaId: true,
      title: true,
      mediaType: true,
      seasonNumber: true,
      posterPath: true,
      backdropUrl: true,
    },
    take: 150,
  });

  // 2. Fetch active rentals (rented)
  const rentals = await prisma.rental.findMany({
    where: {
      userId: { in: userKeys },
      expiresAt: { gt: new Date() },
    },
    select: {
      mediaId: true,
      title: true,
      mediaType: true,
      seasonNumber: true,
      posterPath: true,
      backdropUrl: true,
      expiresAt: true,
    },
    take: 50,
  });

  const userVault: VaultItem[] = [
    ...libraryItems.map((item) => ({
      tmdbId: Number(item.mediaId),
      title: item.title ?? "Untitled",
      mediaType: ((item.mediaType || "tv").toLowerCase() === "movie" ? "movie" : "tv") as "tv" | "movie",
      seasonNumber: item.seasonNumber ?? 1,
      posterPath: item.posterPath,
      backdropUrl: item.backdropUrl,
      isOwned: true,
    })),
    ...rentals.map((rental) => ({
      tmdbId: Number(rental.mediaId),
      title: rental.title ?? "Untitled",
      mediaType: ((rental.mediaType || "tv").toLowerCase() === "movie" ? "movie" : "tv") as "tv" | "movie",
      seasonNumber: rental.seasonNumber ?? 1,
      posterPath: rental.posterPath,
      backdropUrl: rental.backdropUrl,
      isOwned: false,
    })),
  ];

  const vaultTitles =
    userVault.length > 0
      ? userVault
          .map(
            (v) =>
              `- "${v.title}" [${v.mediaType === "tv" ? `TV Show Season ${v.seasonNumber}` : "Feature Film"}, ${v.isOwned ? "Owned Tape" : "Active Rental"}] (TMDB: ${v.tmdbId})`
          )
          .join("\n")
      : "- (No tapes currently in vault. User must rent or buy from VHS Store under the CD rule)";

  // 3. Fetch user's current broadcast schedule
  const scheduleItems = await prisma.userPersonalSchedule.findMany({
    where: { sessionId: { in: userKeys } },
    orderBy: [{ dayOfWeek: "asc" }, { blockStartMinutes: "asc" }],
    take: 60,
  });

  const scheduleSummary =
    scheduleItems.length > 0
      ? scheduleItems
          .map((s) => {
            const day = s.dayOfWeek >= 0 && s.dayOfWeek <= 6 ? DAYS_NAMES[s.dayOfWeek] : "?";
            const timeRange = formatBlockTimeRange(s.blockStartMinutes, s.blockCount || 1);
            const epInfo =
              s.mediaType === "tv"
                ? `Season ${s.currentSeason}, Episode ${s.currentEpisode}`
                : "Feature Film";
            return `- "${s.title}" — every ${day} at ${timeRange} [${epInfo}]`;
          })
          .join("\n")
      : "";

  // 4. Fetch channel name
  const channelSettings = await prisma.userChannelSettings.findFirst({
    where: { sessionId: { in: userKeys } },
    select: { channelName: true },
  });

  const channelName =
    channelSettings?.channelName ||
    (session.displayName ? `${session.displayName}'s TV` : "Personal Broadcast Channel");

  // 5. Time & Block Calculations
  let currentMinutes = 0;
  let currentDayOfWeek = 0;
  let clientLocalTime = timeCtx.clientLocalTime || "";
  let clientDate = timeCtx.clientDate || "";
  const timezone = timeCtx.timezone || "Local Time";

  if (clientLocalTime) {
    const match = clientLocalTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      currentMinutes = h * 60 + m;
    }
  } else if (typeof timeCtx.tzOffset === "number") {
    const localMs = Date.now() + timeCtx.tzOffset * 60 * 1000;
    const localDate = new Date(localMs);
    currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    currentDayOfWeek = localDate.getUTCDay();
    clientLocalTime = formatBlockTime(currentMinutes);
  } else {
    const now = new Date();
    currentMinutes = now.getHours() * 60 + now.getMinutes();
    currentDayOfWeek = now.getDay();
    clientLocalTime = formatBlockTime(currentMinutes);
  }

  if (timeCtx.clientTime) {
    const d = new Date(timeCtx.clientTime);
    if (!isNaN(d.getTime())) {
      currentDayOfWeek = d.getDay();
    }
  }

  const dayName = DAYS_NAMES[currentDayOfWeek];
  if (!clientDate) {
    clientDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const currentBlockStart = Math.floor(currentMinutes / 30) * 30;
  const currentBlockRange = formatBlockTimeRange(currentBlockStart, 1);

  // Check today's occupied vs open slots
  const todaySlots = scheduleItems.filter((s) => s.dayOfWeek === currentDayOfWeek);

  const liveSlot = todaySlots.find(
    (s) =>
      currentMinutes >= s.blockStartMinutes &&
      currentMinutes < s.blockStartMinutes + (s.blockCount || 1) * 30
  );

  const currentLiveStatus = liveSlot
    ? `Now On Air: "${liveSlot.title}" (${
        liveSlot.mediaType === "tv"
          ? `Season ${liveSlot.currentSeason}, Episode ${liveSlot.currentEpisode}`
          : "Movie"
      }, ends at ${formatBlockTime(
        liveSlot.blockStartMinutes + (liveSlot.blockCount || 1) * 30
      )})`
    : "Currently Off-Air (Open spectrum, static screen ready for broadcasting)";

  // Find next available open block
  const nextBlockStart = currentBlockStart + 30;
  let nextAvailableBlockMinutes = nextBlockStart;
  let nextAvailableDayOfWeek = currentDayOfWeek;
  let isTodayAvailable = false;

  const openBlocksToday: string[] = [];
  for (let m = nextBlockStart; m < 1440; m += 30) {
    const isOccupied = todaySlots.some(
      (s) => m >= s.blockStartMinutes && m < s.blockStartMinutes + (s.blockCount || 1) * 30
    );
    if (!isOccupied) {
      openBlocksToday.push(formatBlockTime(m));
      if (!isTodayAvailable) {
        nextAvailableBlockMinutes = m;
        isTodayAvailable = true;
      }
    }
  }

  if (!isTodayAvailable) {
    const tomorrowDay = (currentDayOfWeek + 1) % 7;
    const tomorrowSlots = scheduleItems.filter((s) => s.dayOfWeek === tomorrowDay);
    for (let m = 0; m < 1440; m += 30) {
      const isOccupied = tomorrowSlots.some(
        (s) => m >= s.blockStartMinutes && m < s.blockStartMinutes + (s.blockCount || 1) * 30
      );
      if (!isOccupied) {
        nextAvailableBlockMinutes = m;
        nextAvailableDayOfWeek = tomorrowDay;
        break;
      }
    }
  }

  const nextAvailableBlockLabel = formatBlockTimeRange(nextAvailableBlockMinutes, 1);
  const nextAvailableDayName = DAYS_NAMES[nextAvailableDayOfWeek];

  return {
    userId,
    channelName,
    libraryTitles: userVault.map((v) => v.title),
    vaultTitles,
    userVault,
    scheduleItems,
    scheduleSummary,
    clientLocalTime,
    clientDate,
    dayName,
    timezone,
    currentBlockRange,
    currentLiveStatus,
    nextAvailableBlockLabel,
    nextAvailableDayName,
    nextAvailableBlockMinutes,
    currentDayOfWeek,
    openBlocksToday: openBlocksToday.slice(0, 6),
    tzOffset: timeCtx.tzOffset ?? 0,
  };
}

/* ─── POST Handler ───────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to talk to Broadcaster." },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = (await req.json()) as {
      message?: string;
      history?: MessagePart[];
      clientTime?: string;
      clientLocalTime?: string;
      clientDate?: string;
      timezone?: string;
      tzOffset?: number;
    };

    const {
      message,
      history = [],
      clientTime,
      clientLocalTime,
      clientDate,
      timezone,
      tzOffset,
    } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const sanitizedMessage = message.slice(0, 2000).trim();

    // 3. Assemble complete user and live time context from DB
    const ctx = await assembleUserContext(session, {
      clientTime,
      clientLocalTime,
      clientDate,
      timezone,
      tzOffset,
    });

    // 4. API Key Check
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Broadcaster AI is not configured. Please ensure GOOGLE_GENERATIVE_AI_API_KEY is configured in your environment.",
        },
        { status: 503 }
      );
    }

    // 5. Initialize Google Generative AI
    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
    ];

    const systemInstruction = buildSystemPrompt(ctx);
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const chatHistory = history
      .slice(-20)
      .filter((m) => m.role === "user" || m.role === "model")
      .map((m) => ({
        role: m.role as "user" | "model",
        parts: [{ text: m.text.slice(0, 1000) }],
      }));

    let rawReplyText = "";
    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          safetySettings,
        });

        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(sanitizedMessage);
        rawReplyText = result.response.text();
        if (rawReplyText) break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[broadcaster/route] Model ${modelName} failed, trying next candidate:`, err);
      }
    }

    if (!rawReplyText) {
      throw lastError || new Error("Failed to receive response from Broadcaster.");
    }

    // 6. Action extraction and server-side execution
    let executedAction: BroadcasterAction | null = null;
    let cleanReply = rawReplyText;

    const actionMatch = rawReplyText.match(/```(?:cablecast_action|action)?\s*([\s\S]*?)\s*```/);
    if (actionMatch) {
      try {
        const parsedAction = JSON.parse(actionMatch[1].trim()) as Record<string, unknown>;
        cleanReply = rawReplyText.replace(actionMatch[0], "").trim();

        // ── Action 1: Schedule Broadcast (Server Execution + Guardrails) ──
        if (parsedAction.type === "schedule_broadcast") {
          const reqTitle = String(parsedAction.title || "");
          const reqTmdbId = Number(parsedAction.tmdbId) || 0;
          const reqSeason = Number(parsedAction.season || parsedAction.seasonNumber) || 1;
          const reqEpisode = Number(parsedAction.episode || parsedAction.episodeNumber) || 1;
          const reqDayOfWeek = parseDayOfWeek(parsedAction.dayOfWeek, ctx.currentDayOfWeek);

          // Parse start minutes from any time representation provided by user or model
          let reqStartMinutes =
            parseTimeToBlockMinutes(parsedAction.blockStartMinutes) ??
            parseTimeToBlockMinutes(parsedAction.startTime) ??
            parseTimeToBlockMinutes(parsedAction.time) ??
            parseTimeToBlockMinutes(parsedAction.timeLabel) ??
            parseTimeToBlockMinutes(parsedAction.airTime);

          if (reqStartMinutes === null) {
            reqStartMinutes = ctx.nextAvailableBlockMinutes;
          }

          // GUARDRAIL 1: The CD Rule — Must own or rent the title!
          const matchedVaultItem = ctx.userVault.find(
            (v) =>
              (reqTmdbId > 0 && v.tmdbId === reqTmdbId) ||
              v.title.toLowerCase() === reqTitle.toLowerCase() ||
              v.title.toLowerCase().includes(reqTitle.toLowerCase()) ||
              reqTitle.toLowerCase().includes(v.title.toLowerCase())
          );

          if (!matchedVaultItem) {
            // Refuse under CD rule
            cleanReply += `\n\n*(Note: Under Cablecast's CD Rule, you need to own or rent "${reqTitle}" in your vault before putting it on the air. Head to the VHS Store to check out the tape!)*`;
            executedAction = {
              type: "navigate",
              target: "explore",
              payload: { searchQuery: reqTitle },
            };
          } else {
            try {
              // Direct UPSERT into DB: Overwrite or insert cleanly without unique-constraint crashes!
              const newSlot = await prisma.userPersonalSchedule.upsert({
                where: {
                  sessionId_dayOfWeek_blockStartMinutes: {
                    sessionId: ctx.userId,
                    dayOfWeek: reqDayOfWeek,
                    blockStartMinutes: reqStartMinutes,
                  },
                },
                create: {
                  sessionId: ctx.userId,
                  tmdbId: matchedVaultItem.tmdbId,
                  mediaType: matchedVaultItem.mediaType,
                  title: matchedVaultItem.title,
                  posterPath: matchedVaultItem.posterPath,
                  backdropUrl: matchedVaultItem.backdropUrl,
                  dayOfWeek: reqDayOfWeek,
                  blockStartMinutes: reqStartMinutes,
                  blockCount: 1,
                  currentSeason: matchedVaultItem.mediaType === "tv" ? reqSeason : 1,
                  currentEpisode: matchedVaultItem.mediaType === "tv" ? reqEpisode : 1,
                  totalEpisodes: 24,
                  timezoneOffset: ctx.tzOffset ?? 0,
                },
                update: {
                  tmdbId: matchedVaultItem.tmdbId,
                  mediaType: matchedVaultItem.mediaType,
                  title: matchedVaultItem.title,
                  posterPath: matchedVaultItem.posterPath,
                  backdropUrl: matchedVaultItem.backdropUrl,
                  currentSeason: matchedVaultItem.mediaType === "tv" ? reqSeason : 1,
                  currentEpisode: matchedVaultItem.mediaType === "tv" ? reqEpisode : 1,
                  timezoneOffset: ctx.tzOffset ?? 0,
                },
              });

              executedAction = {
                type: "schedule",
                target: "broadcast",
                payload: {
                  id: newSlot.id,
                  title: newSlot.title,
                  timeLabel: formatBlockTime(newSlot.blockStartMinutes),
                  dayName: DAYS_NAMES[newSlot.dayOfWeek],
                  season: newSlot.currentSeason,
                  episode: newSlot.currentEpisode,
                },
              };
            } catch (dbErr) {
              console.error("[broadcaster/route] Schedule save error:", dbErr);
              cleanReply += `\n\n*(Notice: Could not save slot to schedule: ${
                dbErr instanceof Error ? dbErr.message : "Database error"
              })*`;
            }
          }
        }

        // ── Action 2: Navigate ──
        else if (parsedAction.type === "navigate") {
          executedAction = {
            type: "navigate",
            target: String(parsedAction.destination || "home"),
            payload: {
              searchQuery: parsedAction.searchQuery ? String(parsedAction.searchQuery) : undefined,
            },
          };
        }

        // ── Action 3: Tune In ──
        else if (parsedAction.type === "tune_in") {
          executedAction = {
            type: "tune_in",
            target: "player",
            payload: {
              title: parsedAction.title ? String(parsedAction.title) : undefined,
              tmdbId: parsedAction.tmdbId ? Number(parsedAction.tmdbId) : undefined,
            },
          };
        }

        // ── Action 4: Rent / Buy in VHS Store ──
        else if (parsedAction.type === "rent_buy") {
          executedAction = {
            type: "rent_buy",
            target: "explore",
            payload: {
              title: parsedAction.title ? String(parsedAction.title) : undefined,
              tmdbId: parsedAction.tmdbId ? Number(parsedAction.tmdbId) : undefined,
              mediaType: (parsedAction.mediaType === "movie" ? "movie" : "tv") as "movie" | "tv",
              action: (parsedAction.action === "BUY" ? "BUY" : "RENT") as "BUY" | "RENT",
            },
          };
        }

        // ── Action 5: Multi-Episode Pacing Campaign ──
        else if (parsedAction.type === "schedule_pacing_campaign") {
          const reqTitle = String(parsedAction.title || "");
          const matchedVaultItem = ctx.userVault.find(
            (v) =>
              v.title.toLowerCase() === reqTitle.toLowerCase() ||
              v.title.toLowerCase().includes(reqTitle.toLowerCase()) ||
              reqTitle.toLowerCase().includes(v.title.toLowerCase())
          );

          if (!matchedVaultItem) {
            cleanReply += `\n\n*(Note: Under Cablecast's CD Rule, you need to own or rent "${reqTitle}" in your vault before mapping out this campaign. Head to the VHS Store to pick it up!)*`;
            executedAction = {
              type: "navigate",
              target: "explore",
              payload: { searchQuery: reqTitle },
            };
          } else {
            try {
              const rawEntries = Array.isArray(parsedAction.entries) ? parsedAction.entries : [];
              const reqSeason = Number(parsedAction.season) || 1;

              const calendarRows = rawEntries.map((e: any) => {
                const startMin = parseTimeToBlockMinutes(e.time) ?? 1260; // default 9:00 PM if unspecified
                return {
                  sessionId: ctx.userId,
                  tmdbId: matchedVaultItem.tmdbId,
                  mediaType: matchedVaultItem.mediaType,
                  title: matchedVaultItem.title,
                  posterPath: matchedVaultItem.posterPath,
                  backdropUrl: matchedVaultItem.backdropUrl,
                  scheduledDate: String(e.date),
                  blockStartMinutes: startMin,
                  blockCount: 1,
                  startSeason: reqSeason,
                  startEpisode: Number(e.episode) || 1,
                };
              });

              if (calendarRows.length > 0) {
                await prisma.calendarEntry.createMany({
                  data: calendarRows,
                });

                executedAction = {
                  type: "schedule",
                  target: "broadcast",
                  payload: {
                    title: matchedVaultItem.title,
                    season: reqSeason,
                    episodeCount: calendarRows.length,
                    firstDate: calendarRows[0].scheduledDate,
                    lastDate: calendarRows[calendarRows.length - 1].scheduledDate,
                    campaign: true,
                  },
                };
              }
            } catch (dbErr) {
              console.error("[broadcaster/route] Campaign save error:", dbErr);
              cleanReply += `\n\n*(Notice: Could not save pacing campaign: ${
                dbErr instanceof Error ? dbErr.message : "Database error"
              })*`;
            }
          }
        }
      } catch (parseErr) {
        console.warn("[broadcaster/route] Action parse warning:", parseErr);
      }
    }

    return NextResponse.json({
      reply: cleanReply,
      action: executedAction,
    });
  } catch (err) {
    console.error("[broadcaster/route] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Broadcaster connection issue: ${message}` },
      { status: 500 }
    );
  }
}
