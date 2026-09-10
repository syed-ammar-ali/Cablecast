"use client";

import { useEffect, useState } from "react";
import { Share, PlusSquare, X, Tv } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

const STORAGE_KEY = "cablecast_ios_install_dismissed";

export function IosInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if running on iOS Safari
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    // Check if already running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (!isIOS || isStandalone) return;

    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed === "true") return;
    } catch {
      return;
    }

    // Delay slightly to allow initial content to settle
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    triggerHaptic(10);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore
    }
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <aside
      aria-label="Install Cablecast on iPhone"
      className="fixed bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] inset-x-3 sm:inset-x-auto sm:right-6 sm:w-96 z-[9970] rounded-2xl border border-amber-500/40 bg-neutral-950/95 p-4 shadow-2xl shadow-black backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2.5 top-2.5 rounded-lg p-1 text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300 transition-colors"
        aria-label="Dismiss install prompt"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
          <Tv className="h-5 w-5" />
        </div>

        <div className="flex-1 pr-4">
          <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-amber-400">
            Install Cablecast TV
          </h3>
          <p className="mt-0.5 text-xs text-neutral-300 leading-snug">
            Add to your Home Screen to unlock lock-screen broadcast alerts and full-screen CRT playback.
          </p>
        </div>
      </div>

      <div className="mt-3.5 space-y-2 rounded-xl border border-neutral-800/80 bg-black/60 p-2.5 text-xs text-neutral-300">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-sky-400">
            <Share className="h-3.5 w-3.5" />
          </div>
          <span>1. Tap the <strong>Share</strong> button in Safari toolbar.</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-amber-400">
            <PlusSquare className="h-3.5 w-3.5" />
          </div>
          <span>2. Scroll down and tap <strong>Add to Home Screen</strong>.</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer"
        >
          Got It
        </button>
      </div>
    </aside>
  );
}
