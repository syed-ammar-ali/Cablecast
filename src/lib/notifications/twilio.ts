/**
 * Twilio notification helpers — no SDK, raw fetch only.
 * Keeps bundle size zero-impact on Vercel.
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID   — ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN    — your auth token
 *   TWILIO_FROM_NUMBER   — your Twilio phone number in E.164 (+12015550123)
 */

const BASE_URL = `https://api.twilio.com/2010-04-01/Accounts`;

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not configured.");
  return { sid, auth: Buffer.from(`${sid}:${token}`).toString("base64") };
}

function fromNumber() {
  const n = process.env.TWILIO_FROM_NUMBER;
  if (!n) throw new Error("TWILIO_FROM_NUMBER not configured.");
  return n;
}

/**
 * Sends an SMS text message via Twilio.
 * @param to   E.164 destination number (e.g. "+12015551234")
 * @param body Message text (max 1600 chars)
 */
export async function sendSms(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const { sid, auth } = twilioAuth();
    const params = new URLSearchParams({
      To: to,
      From: fromNumber(),
      Body: body,
    });

    const res = await fetch(`${BASE_URL}/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[Twilio SMS] Error:", err);
      return { success: false, error: (err as any)?.message ?? `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, sid: data.sid };
  } catch (e) {
    console.error("[Twilio SMS] Unexpected error:", e);
    return { success: false, error: String(e) };
  }
}

/**
 * Initiates a Twilio voice call with a TTS message read by a robot voice.
 * Uses TwiML passed inline via the `Twiml` parameter (no external URL needed).
 * @param to      E.164 destination number
 * @param message Plain-text message to read aloud (keep it under ~300 chars)
 */
export async function makeCall(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const { sid, auth } = twilioAuth();

    // Inline TwiML — no external hosting needed
    const twiml = `<Response><Say voice="alice">${escapeXml(message)}</Say><Pause length="1"/><Say voice="alice">${escapeXml(message)}</Say></Response>`;

    const params = new URLSearchParams({
      To: to,
      From: fromNumber(),
      Twiml: twiml,
    });

    const res = await fetch(`${BASE_URL}/${sid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[Twilio Call] Error:", err);
      return { success: false, error: (err as any)?.message ?? `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, sid: data.sid };
  } catch (e) {
    console.error("[Twilio Call] Unexpected error:", e);
    return { success: false, error: String(e) };
  }
}

/** Escapes special XML characters for safe embedding in TwiML */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Returns true only if all 3 Twilio env vars are set */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER,
  );
}
