"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check support and current subscription status on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const iosDetected =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(iosDetected);

    const standaloneDetected =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standaloneDetected));

    if (
      !("serviceWorker" in navigator) ||
      !("Notification" in window) ||
      !("PushManager" in window)
    ) {
      setIsSupported(false);
      setIsLoading(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    async function checkSubscription() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          setIsSubscribed(true);
        } else {
          // Also verify with backend
          const res = await fetch("/api/notifications/subscribe");
          if (res.ok) {
            const data = await res.json();
            setIsSubscribed(Boolean(data.isSubscribed));
          }
        }
      } catch (err) {
        console.error("[usePushNotifications] Error checking subscription:", err);
      } finally {
        setIsLoading(false);
      }
    }

    checkSubscription();
  }, []);

  // Background sync heartbeat: checks notifications while the user has Cablecast open
  useEffect(() => {
    if (!isSubscribed) return;

    // Ping on mount
    fetch("/api/cron/notifications", { method: "POST" }).catch(() => {});

    // Periodic heartbeat every 4 minutes while app tab is open
    const interval = setInterval(() => {
      fetch("/api/cron/notifications", { method: "POST" }).catch(() => {});
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isSubscribed]);

  const subscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isSupported) {
      if (isIOS && !isStandalone) {
        return {
          success: false,
          error: "On iPhone, tap the Share icon (⎋) and select 'Add to Home Screen' to enable push notifications.",
        };
      }
      return { success: false, error: "Push notifications are not supported by this browser." };
    }

    setIsLoading(true);
    try {
      // 1. Request user permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setIsLoading(false);
        return {
          success: false,
          error: "Notification permission was not granted. Please allow notifications in your browser settings.",
        };
      }

      // 2. Fetch public key
      const keyRes = await fetch("/api/notifications/subscribe");
      const keyData = await keyRes.json();
      const publicKey =
        keyData.publicKey ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        "BDkweSurB0QTH8HH9yMgH1_bEiQdEMqqTW7fwlefnuAbtexNrSXwlRLv1sclHaa1dvIfbaTf4mqevj7ZS9ibUwk";

      if (!publicKey) {
        setIsLoading(false);
        return { success: false, error: "VAPID public key is missing on the server." };
      }

      // 3. Register with PushManager
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        });
      }

      // 4. Extract client timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const timezoneOffset = new Date().getTimezoneOffset(); // offset in minutes (e.g. -330 for IST)

      // 5. Send subscription to backend
      const rawSub = subscription.toJSON();
      const saveRes = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: rawSub.keys?.p256dh,
              auth: rawSub.keys?.auth,
            },
          },
          timezone,
          timezoneOffset,
        }),
      });

      if (!saveRes.ok) {
        throw new Error("Failed to save push subscription on the server.");
      }

      setIsSubscribed(true);
      return { success: true };
    } catch (err: any) {
      console.error("[usePushNotifications] Failed to subscribe:", err);
      return { success: false, error: err.message || "Failed to subscribe to notifications." };
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isIOS, isStandalone]);

  const unsubscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }

      setIsSubscribed(false);
      return { success: true };
    } catch (err: any) {
      console.error("[usePushNotifications] Failed to unsubscribe:", err);
      return { success: false, error: err.message || "Failed to unsubscribe." };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendTestNotification = useCallback(async (): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "Failed to deliver test alert." };
      }
      return { success: true, message: data.message || "Test alert delivered!" };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error sending test notification." };
    }
  }, []);

  return {
    isSupported,
    isIOS,
    isStandalone,
    needsHomeScreenInstall: isIOS && !isStandalone,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
