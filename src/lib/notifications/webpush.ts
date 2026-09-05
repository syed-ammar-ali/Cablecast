import webpush from "web-push";

export const DEFAULT_VAPID_PUBLIC_KEY =
  "BDkweSurB0QTH8HH9yMgH1_bEiQdEMqqTW7fwlefnuAbtexNrSXwlRLv1sclHaa1dvIfbaTf4mqevj7ZS9ibUwk";
export const DEFAULT_VAPID_PRIVATE_KEY =
  "CviFIGj460TcI-jkvZZ1vLwapePJnmZrgK1VhoLpUos";

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@cablecast.tv";

let isConfigured = false;
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  isConfigured = true;
} catch (err) {
  console.error("[webpush] Failed to set VAPID details:", err);
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data: {
    url: string;
    type?: "STARTING_SOON" | "MISSED_BROADCAST" | "TAPE_EXPIRING";
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
  if (!isConfigured) {
    return { success: false, error: "WebPush not configured with valid VAPID keys." };
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
    await webpush.sendNotification(pushSubscription, stringified);
    return { success: true };
  } catch (error: any) {
    const statusCode = error?.statusCode;
    // 404 Not Found or 410 Gone means user unsubscribed or revoked permission in browser
    const shouldRemove = statusCode === 404 || statusCode === 410;

    return {
      success: false,
      statusCode,
      shouldRemove,
      error: error?.message || "Failed to deliver push notification.",
    };
  }
}
