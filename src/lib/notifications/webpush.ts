import webpush from "web-push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:support@cablecast.tv";

let isConfigured = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isConfigured = true;
  } catch (err) {
    console.error("[webpush] Failed to set VAPID details:", err);
  }
} else {
  console.warn("[webpush] Warning: NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing in environment.");
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
