import webpush from "web-push";

function sanitizeVapidKey(val?: string): string {
  if (!val) return "";
  return val.trim().replace(/^["']|["']$/g, "").trim();
}

export const VAPID_PUBLIC_KEY =
  sanitizeVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
export const VAPID_PRIVATE_KEY =
  sanitizeVapidKey(process.env.VAPID_PRIVATE_KEY);
export const VAPID_SUBJECT =
  sanitizeVapidKey(process.env.VAPID_SUBJECT) || "mailto:support@cablecast.tv";

let isConfigured = false;

export function ensureVapidConfigured(): boolean {
  if (isConfigured) return true;

  const pubKey =
    sanitizeVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) || VAPID_PUBLIC_KEY;
  const privKey =
    sanitizeVapidKey(process.env.VAPID_PRIVATE_KEY) || VAPID_PRIVATE_KEY;
  const subject =
    sanitizeVapidKey(process.env.VAPID_SUBJECT) || VAPID_SUBJECT || "mailto:support@cablecast.tv";

  if (pubKey && privKey) {
    try {
      webpush.setVapidDetails(subject, pubKey, privKey);
      isConfigured = true;
      return true;
    } catch (err) {
      console.error("[webpush] Failed to set VAPID details:", err);
      return false;
    }
  }
  return false;
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  ensureVapidConfigured();
}

export interface PushNotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  badge?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
  vibrate?: number[];
  actions?: PushNotificationAction[];
  data: {
    url: string;
    type?: "STARTING_SOON" | "MISSED_BROADCAST" | "TAPE_EXPIRING";
    actionUrls?: Record<string, string>;
    [key: string]: unknown;
  };
}

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a web push notification to a specific client subscription.
 * Returns { success: true } or { success: false, statusCode, shouldRemove }.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushNotificationPayload,
): Promise<{ success: boolean; statusCode?: number; shouldRemove?: boolean; error?: string }> {
  if (!ensureVapidConfigured()) {
    return {
      success: false,
      error: "WebPush not configured with valid VAPID keys. Ensure VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY are configured in server environment variables.",
    };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    const stringified = JSON.stringify(payload);
    await webpush.sendNotification(pushSubscription, stringified, {
      TTL: 3600,
      urgency: "high",
    });
    return { success: true };
  } catch (error: any) {
    const statusCode = error?.statusCode;
    // 404 Not Found or 410 Gone means user unsubscribed or revoked permission in browser
    const shouldRemove = statusCode === 404 || statusCode === 410;

    return {
      success: false,
      statusCode,
      shouldRemove,
      error: error?.body ? `${error.message} (${error.body})` : (error?.message || "Failed to deliver push notification."),
    };
  }
}
