import { Client, Receiver } from "@upstash/qstash";

export function getAppBaseUrl(requestOrigin?: string | null): string {
  if (requestOrigin && !requestOrigin.includes("localhost") && !requestOrigin.includes("127.0.0.1")) {
    return requestOrigin.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    let url = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return url;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "");
    return host.startsWith("http") ? host : `https://${host}`;
  }
  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.replace(/\/$/, "");
    return host.startsWith("http") ? host : `https://${host}`;
  }
  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

let qstashClient: Client | null = null;
let qstashReceiver: Receiver | null = null;

export function resetQStashClients(): void {
  qstashClient = null;
  qstashReceiver = null;
}

export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

export function getQStashClient(): Client | null {
  if (!process.env.QSTASH_TOKEN) return null;
  if (!qstashClient) {
    qstashClient = new Client({
      token: process.env.QSTASH_TOKEN,
      // Do NOT pass baseUrl — the SDK default (https://qstash.upstash.io) is the correct
      // public API. Regional subdomains like qstash-eu-central-1.upstash.io are internal
      // Upstash routing and will cause publishJSON to silently fail.
    });
  }
  return qstashClient;
}

export function getQStashReceiver(): Receiver | null {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return null;
  }
  if (!qstashReceiver) {
    qstashReceiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    });
  }
  return qstashReceiver;
}

export interface ScheduleAlertParams {
  scheduleId: string;
  alertTime: Date;
  requestOrigin?: string | null;
}

/**
 * Publishes a delayed broadcast alert to Upstash QStash.
 * Fires at the exact target alertTime (10 minutes before showtime)
 * with automatic retries and zero continuous cron polling.
 */
export async function scheduleDelayedBroadcastAlert(
  params: ScheduleAlertParams,
): Promise<{ success: boolean; messageId?: string; mode: "qstash" | "dev_timer" | "noop" }> {
  const { scheduleId, alertTime, requestOrigin } = params;
  const now = new Date();
  const notBeforeEpoch = Math.max(
    Math.floor(Date.now() / 1000),
    Math.floor(alertTime.getTime() / 1000),
  );

  const client = getQStashClient();
  const baseUrl = getAppBaseUrl(requestOrigin);
  const destinationUrl = `${baseUrl}/api/notifications/dispatch-appointment`;

  // 1. Cloud QStash execution (Production or Public URL)
  console.log(`[QStash] scheduleDelayedBroadcastAlert: baseUrl="${baseUrl}", destination="${destinationUrl}", alertTime=${alertTime.toISOString()}, hasClient=${Boolean(client)}, notBefore=${notBeforeEpoch}`);

  if (client && !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
    try {
      const res = await client.publishJSON({
        url: destinationUrl,
        body: {
          scheduleId,
          type: "starting_soon",
          scheduledFor: alertTime.toISOString(),
        },
        notBefore: notBeforeEpoch,
        retries: 3,
      });

      console.log(`[QStash] Successfully scheduled delayed alert for slot ${scheduleId} to ${destinationUrl} at ${alertTime.toISOString()} (msg: ${res.messageId})`);
      return { success: true, messageId: res.messageId, mode: "qstash" };
    } catch (error) {
      console.error(`[QStash] Failed to publish delayed alert to ${destinationUrl}:`, error);
    }
  } else if (!client) {
    console.warn("[QStash] Skipping: QSTASH_TOKEN is not set.");
  } else {
    console.log(`[QStash] Skipping cloud delivery: baseUrl is localhost. Using dev_timer fallback.`);
  }

  // 2. Development mode timer fallback (for testing on localhost without an ngrok tunnel)
  if (process.env.NODE_ENV === "development" || baseUrl.includes("localhost")) {
    const delayMs = Math.max(0, alertTime.getTime() - now.getTime());
    // Only set in-process timer if alert is within 4 hours
    if (delayMs < 4 * 60 * 60 * 1000) {
      setTimeout(async () => {
        try {
          const { dispatchStartingSoonForSlot } = await import("./notificationDispatcher");
          await dispatchStartingSoonForSlot(scheduleId, alertTime);
        } catch (err) {
          console.error("[DevTimer] Delayed alert dispatch failed:", err);
        }
      }, delayMs);

      return { success: true, mode: "dev_timer" };
    }
  }

  return { success: false, mode: "noop" };
}
