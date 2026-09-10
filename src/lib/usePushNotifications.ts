"use client";

import { useCallback, useEffect, useState } from "react";

function sanitizeKey(val?: string | null): string {
  if (!val || typeof val !== "string") return "";
  return val.trim().replace(/^["']|["']$/g, "").trim();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const cleaned = sanitizeKey(base64String);
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const FALLBACK_VAPID_PUBLIC_KEY =
  "BDkweSurB0QTH8HH9yMgH1_bEiQdEMqqTW7fwlefnuAbtexNrSXwlRLv1sclHaa1dvIfbaTf4mqevj7ZS9ibUwk";

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to sync an existing subscription to the server
  const syncSubscriptionToServer = useCallback(
    async (sub: PushSubscription): Promise<boolean> => {
      try {
        const rawSub = sub.toJSON();
        if (!sub.endpoint || !rawSub.keys?.p256dh || !rawSub.keys?.auth) {
          return false;
        }
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const timezoneOffset = new Date().getTimezoneOffset();

        const res = await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: {
              endpoint: sub.endpoint,
              keys: {
                p256dh: rawSub.keys.p256dh,
                auth: rawSub.keys.auth,
              },
            },
            timezone,
            timezoneOffset,
          }),
        });
        return res.ok;
      } catch (err) {
        console.warn("[usePushNotifications] Subscription sync warning:", err);
        return false;
      }
    },
    [],
  );

  // Check support, permissions, and subscription status on mount
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
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        }
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<ServiceWorkerRegistration | null>((_, reject) =>
            setTimeout(() => reject(new Error("ServiceWorker ready timeout")), 4000),
          ),
        ]).catch(() => null);

        let localSub: PushSubscription | null = null;
        if (readyReg) {
          localSub = await readyReg.pushManager.getSubscription();
        }

        // Query backend subscription state
        const res = await fetch("/api/notifications/subscribe");
        let serverSubscribed = false;
        if (res.ok) {
          const data = await res.json();
          serverSubscribed = Boolean(data.isSubscribed);
        }

        if (localSub) {
          // If browser has subscription, ensure backend is synchronized with it
          if (!serverSubscribed) {
            const synced = await syncSubscriptionToServer(localSub);
            setIsSubscribed(synced);
          } else {
            setIsSubscribed(true);
          }
        } else {
          setIsSubscribed(serverSubscribed);
        }
      } catch (err) {
        console.error("[usePushNotifications] Error checking subscription:", err);
      } finally {
        setIsLoading(false);
      }
    }

    void checkSubscription();
  }, [syncSubscriptionToServer]);

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

      // 2. Fetch server public key
      let publicKey = "";
      try {
        const keyRes = await fetch("/api/notifications/subscribe");
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          publicKey = sanitizeKey(keyData.publicKey);
        }
      } catch {
        // Fallback to client env or constant
      }

      if (!publicKey) {
        publicKey =
          sanitizeKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) || FALLBACK_VAPID_PUBLIC_KEY;
      }

      const serverKeyBytes = urlBase64ToUint8Array(publicKey);

      // 3. Register or get active Service Worker
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      const readyReg = await navigator.serviceWorker.ready;
      let subscription = await readyReg.pushManager.getSubscription();

      // If existing subscription has mismatched key, unsubscribe first
      if (subscription) {
        try {
          const rawExisting = subscription.options?.applicationServerKey;
          if (rawExisting) {
            const existingBytes = new Uint8Array(rawExisting);
            let matches = existingBytes.length === serverKeyBytes.length;
            if (matches) {
              for (let i = 0; i < existingBytes.length; i++) {
                if (existingBytes[i] !== serverKeyBytes[i]) {
                  matches = false;
                  break;
                }
              }
            }
            if (!matches) {
              await subscription.unsubscribe();
              subscription = null;
            }
          }
        } catch {
          // Continue
        }
      }

      // 4. Create fresh subscription with validated server key
      if (!subscription) {
        subscription = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKeyBytes as unknown as BufferSource,
        });
      }

      // 5. Send subscription to backend
      const synced = await syncSubscriptionToServer(subscription);
      if (!synced) {
        throw new Error("Failed to save push subscription on the server.");
      }

      setIsSubscribed(true);
      return { success: true };
    } catch (err: unknown) {
      console.error("[usePushNotifications] Failed to subscribe:", err);
      const message = err instanceof Error ? err.message : "Failed to subscribe to notifications.";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isIOS, isStandalone, syncSubscriptionToServer]);

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
    } catch (err: unknown) {
      console.error("[usePushNotifications] Failed to unsubscribe:", err);
      const message = err instanceof Error ? err.message : "Failed to unsubscribe.";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendTestNotification = useCallback(
    async (options?: { broadcast?: boolean }): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }> => {
      try {
        let endpoint: string | undefined = undefined;
        let subData: { endpoint: string; keys: { p256dh?: string; auth?: string } } | undefined =
          undefined;

        if (typeof window !== "undefined" && "serviceWorker" in navigator) {
          try {
            const readyReg = await navigator.serviceWorker.ready;
            const sub = await readyReg.pushManager.getSubscription();
            if (sub?.endpoint) {
              endpoint = sub.endpoint;
              const json = sub.toJSON();
              subData = {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: json.keys?.p256dh,
                  auth: json.keys?.auth,
                },
              };
            }
          } catch {
            // Continue without explicit subscription payload
          }
        }

        const res = await fetch("/api/notifications/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint,
            subscription: subData,
            broadcast: options?.broadcast || false,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || "Failed to deliver test alert." };
        }
        return { success: true, message: data.message || "Test alert delivered!" };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error sending test notification.";
        return { success: false, error: message };
      }
    },
    [],
  );

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
