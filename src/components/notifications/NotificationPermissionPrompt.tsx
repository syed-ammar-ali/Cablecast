"use client";

import { useEffect, useState } from "react";
import { Bell, X, Tv } from "lucide-react";
import { usePushNotifications } from "@/lib/usePushNotifications";

const PROMPT_STORAGE_KEY = "cablecast_notification_prompt_seen";

export function NotificationPermissionPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isSupported, isSubscribed, subscribe } = usePushNotifications();

  useEffect(() => {
    // Only prompt if push is supported, user has not subscribed yet, and hasn't dismissed before
    if (!isSupported || isSubscribed) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    try {
      const alreadySeen = localStorage.getItem(PROMPT_STORAGE_KEY);
      if (alreadySeen === "true") return;
    } catch {
      return;
    }

    // Gentle delay after first open
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1800);

    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(PROMPT_STORAGE_KEY, "true");
    } catch {
      // Ignore localStorage errors
    }
    setIsVisible(false);
  };

  const handleEnable = async () => {
    setIsSubmitting(true);
    try {
      await subscribe();
      try {
        localStorage.setItem(PROMPT_STORAGE_KEY, "true");
      } catch {
        // Ignore
      }
      setIsVisible(false);
    } catch {
      // Error handled inside usePushNotifications
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Notification permission prompt"
      className="fixed bottom-20 md:bottom-6 right-3 sm:right-6 z-50 max-w-sm w-[calc(100vw-1.5rem)] sm:w-96 rounded-2xl border border-amber-500/30 bg-neutral-950/95 p-4 sm:p-5 shadow-2xl shadow-black/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 rounded-lg p-1 text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300 transition-colors"
        aria-label="Close notification prompt"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-inner shadow-amber-500/20">
          <Bell className="h-5 w-5 animate-pulse" />
        </div>

        <div className="flex-1 pr-4">
          <div className="flex items-center gap-1.5">
            <h3 className="font-sans text-sm font-bold text-white tracking-tight">
              Never Miss a Broadcast
            </h3>
            <Tv className="h-3.5 w-3.5 text-amber-400/80" />
          </div>
          <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
            Get instant alerts on your lock screen 10 minutes before your scheduled shows and movie airings begin.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleEnable}
          disabled={isSubmitting}
          className="flex-1 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-2 text-xs font-bold text-black shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? "Enabling..." : "Turn On Notifications"}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-all cursor-pointer"
        >
          Maybe Later
        </button>
      </div>
    </aside>
  );
}
