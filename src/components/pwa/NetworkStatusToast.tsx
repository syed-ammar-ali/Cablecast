"use client";

import { useEffect, useState } from "react";
import { WifiOff, Radio } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export function NetworkStatusToast() {
  const [isOnline, setIsOnline] = useState(true);
  const [showRestored, setShowRestored] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      setHasInteracted(true);
      triggerHaptic(15);
      const timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
      setHasInteracted(true);
      triggerHaptic(25);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Do not render anything if online and not in the "just restored" grace period
  if (isOnline && (!showRestored || !hasInteracted)) {
    return null;
  }

  return (
    <aside
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4.25rem))] md:bottom-6 left-1/2 -translate-x-1/2 z-[9980] flex items-center justify-center animate-in fade-in zoom-in-95 duration-200"
    >
      {!isOnline ? (
        <div className="flex items-center gap-2 rounded-full border border-amber-500/50 bg-black/90 px-3.5 py-1.5 shadow-xl shadow-amber-950/40 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <WifiOff className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-300">
            Signal Lost · Off-Air
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/50 bg-black/90 px-3.5 py-1.5 shadow-xl shadow-emerald-950/40 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            Signal Restored · On-Air
          </span>
        </div>
      )}
    </aside>
  );
}
