"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Cablecast Global Error]:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4 py-16 text-center font-mono select-none">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/40 bg-red-950/30 text-red-400 shadow-[0_0_30px_rgba(239,68,68,0.25)]">
        <AlertTriangle className="h-8 w-8 animate-pulse text-red-500" />
      </div>

      <div className="max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Signal Interrupted</p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wider text-white">Temporary Broadcast Error</h1>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          An unexpected glitch occurred in the transmission feed. Try reloading the feed or tune back to the live guide.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload Signal
          </button>

          <Link
            href="/home"
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
          >
            Live Guide
          </Link>
        </div>
      </div>
    </div>
  );
}
