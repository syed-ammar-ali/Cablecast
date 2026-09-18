import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { sendSms, makeCall, isTwilioConfigured } from "@/lib/notifications/twilio";
import {
  sendTelegramMessage,
  isTelegramConfigured,
  getDefaultTelegramChatId,
} from "@/lib/notifications/telegram";

/** Derive canonical userId the same way the dispatcher does */
async function getCanonicalUserId(session: { id: string; accessCodeId?: string | null; role: string }) {
  return session.role === "admin" ? "admin" : (session.accessCodeId ?? session.id);
}

/** Validates an E.164 phone number */
function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}

// ─── GET /api/user/phone-settings ────────────────────────────────────────────
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getCanonicalUserId(session);
  const settings = await prisma.userPhoneSettings.findUnique({ where: { userId } });
  const defaultChatId = getDefaultTelegramChatId();

  return NextResponse.json({
    configured: !!settings,
    twilioReady: isTwilioConfigured(),
    telegramReady: isTelegramConfigured(),
    defaultTelegramChatId: defaultChatId,
    settings: settings
      ? {
          phoneNumber: settings.phoneNumber,
          callEnabled: settings.callEnabled,
          smsEnabled: settings.smsEnabled,
          telegramChatId: settings.telegramChatId || defaultChatId || null,
          telegramEnabled: settings.telegramEnabled,
          verifiedAt: settings.verifiedAt,
        }
      : {
          phoneNumber: "",
          callEnabled: false,
          smsEnabled: false,
          telegramChatId: defaultChatId || null,
          telegramEnabled: true,
          verifiedAt: null,
        },
  });
}

// ─── PUT /api/user/phone-settings ────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    phoneNumber?: string;
    callEnabled?: boolean;
    smsEnabled?: boolean;
    telegramChatId?: string;
    telegramEnabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phoneNumber, callEnabled, smsEnabled, telegramChatId, telegramEnabled } = body;

  // Validate phone number if provided and not empty
  if (phoneNumber !== undefined && phoneNumber.trim() !== "") {
    if (!isValidE164(phoneNumber)) {
      return NextResponse.json(
        { error: "Phone number must be in E.164 format (e.g. +12015551234 or +923001234567)" },
        { status: 400 },
      );
    }
  }

  const userId = await getCanonicalUserId(session);
  const existing = await prisma.userPhoneSettings.findUnique({ where: { userId } });

  const phoneChanged =
    phoneNumber !== undefined &&
    existing?.phoneNumber !== undefined &&
    existing.phoneNumber !== phoneNumber.trim();

  const settings = await prisma.userPhoneSettings.upsert({
    where: { userId },
    create: {
      userId,
      phoneNumber: phoneNumber?.trim() ?? "",
      callEnabled: callEnabled ?? true,
      smsEnabled: smsEnabled ?? true,
      telegramChatId: telegramChatId?.trim() ?? getDefaultTelegramChatId() ?? null,
      telegramEnabled: telegramEnabled ?? true,
      verifiedAt: null,
    },
    update: {
      ...(phoneNumber !== undefined && { phoneNumber: phoneNumber.trim() }),
      ...(callEnabled !== undefined && { callEnabled }),
      ...(smsEnabled !== undefined && { smsEnabled }),
      ...(telegramChatId !== undefined && { telegramChatId: telegramChatId.trim() }),
      ...(telegramEnabled !== undefined && { telegramEnabled }),
      ...(phoneChanged && { verifiedAt: null }),
    },
  });

  return NextResponse.json({ success: true, settings });
}

// ─── POST /api/user/phone-settings/test ─ sends a live test message ──────────
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  const userId = await getCanonicalUserId(session);
  const settings = await prisma.userPhoneSettings.findUnique({ where: { userId } });

  // 1. Test Telegram
  if (action === "test-telegram") {
    if (!isTelegramConfigured()) {
      return NextResponse.json(
        { error: "Telegram bot is not configured on this server." },
        { status: 503 },
      );
    }

    const chatId = settings?.telegramChatId || getDefaultTelegramChatId();
    if (!chatId) {
      return NextResponse.json({ error: "No Telegram Chat ID found." }, { status: 400 });
    }

    const result = await sendTelegramMessage(
      chatId,
      "📺 <b>Cablecast Reminder Test</b>\n\nYour Telegram reminders are connected and working! You will receive alerts here 10 minutes before your scheduled broadcasts air.",
    );
    return NextResponse.json(result);
  }

  // 2. Simulate 10:00 AM Broadcast Alert
  if (action === "simulate-10am") {
    if (!isTelegramConfigured()) {
      return NextResponse.json(
        { error: "Telegram bot is not configured on this server." },
        { status: 503 },
      );
    }

    const chatId = settings?.telegramChatId || getDefaultTelegramChatId();
    if (!chatId) {
      return NextResponse.json({ error: "No Telegram Chat ID found." }, { status: 400 });
    }

    const posterUrl = "https://image.tmdb.org/t/p/w780/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg";
    const caption =
      `📺 <b>CABLECAST · APPOINTMENT BROADCAST</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔴 <b>AIRING IN 10 MINUTES · 10:00 AM</b>\n` +
      `📡 <b>Channel 04</b> · <i>Retro Mystery & Sci-Fi Lineup</i>\n\n` +
      `🎬 <b>The X-Files</b> (1993)\n` +
      `📼 <b>Season 1, Ep. 1 · "Pilot"</b>\n` +
      `⭐ <b>8.7 / 10</b>  ·  ⏱ <b>48 mins</b>  ·  🏷 <i>Sci-Fi, Cult Classic</i>\n\n` +
      `<blockquote>"Agent Dana Scully is assigned to debunk the FBI's anomalous unclassified cold cases alongside eccentric investigator Fox Mulder."</blockquote>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📼 <b>VHS Status:</b> Hi-Fi Stereo · 4:3 CRT Master\n` +
      `🔔 <i>Scheduled on your personal appointment matrix.</i>`;

    const { sendTelegramPhoto } = await import("@/lib/notifications/telegram");
    const result = await sendTelegramPhoto(chatId, posterUrl, caption, {
      buttons: [
        [{ text: "▶️ Tune In Live (Channel 04)", url: "https://cablecast.tv/?view=home#schedule" }],
        [
          { text: "📼 View VHS Sleeve", url: "https://cablecast.tv/library" },
          { text: "🗓 Full TV Guide", url: "https://cablecast.tv/broadcast" },
        ],
      ],
    });

    return NextResponse.json(result);
  }

  // 2. Twilio actions require Twilio to be configured
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured on this server." }, { status: 503 });
  }

  if (!settings?.phoneNumber) {
    return NextResponse.json({ error: "No phone number saved." }, { status: 400 });
  }

  if (action === "test-call") {
    const result = await makeCall(
      settings.phoneNumber,
      "This is a test call from Cablecast. Your voice reminder system is working correctly. Enjoy your shows!",
    );
    return NextResponse.json(result);
  }

  if (action === "test-sms") {
    const result = await sendSms(
      settings.phoneNumber,
      "📺 Cablecast test message: Your SMS reminders are working. You'll get a text when you miss a show or a rental expires.",
    );
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
