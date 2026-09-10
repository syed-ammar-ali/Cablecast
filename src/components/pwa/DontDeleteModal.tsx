"use client";

import { useEffect } from "react";
import { Film, Heart, Radio, RotateCcw, Tv, X } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { useToast } from "@/components/ui/ToastProvider";

interface DontDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DontDeleteModal({ isOpen, onClose }: DontDeleteModalProps) {
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    triggerHaptic(25);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePledgeLove = () => {
    triggerHaptic(35);
    onClose();
    toast.success(
      "Phew! Cablecast lives to broadcast another day! Rewind fees waived for life. 📼✨",
      "You Saved Retro TV! ❤️"
    );
  };

  const handleDismiss = () => {
    triggerHaptic(15);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dont-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
      onClick={handleDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-500/40 bg-neutral-950 p-5 sm:p-6 text-neutral-100 shadow-2xl shadow-red-950/60 crt-flicker animate-in zoom-in-95 duration-200"
      >
        {/* Subtle retro scanline overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-30" />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200 transition-colors cursor-pointer active:scale-95"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Crying TV Header Icon */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-red-500/50 bg-red-950/40 text-red-400 shadow-inner shadow-red-500/30">
            <Tv className="h-7 w-7 animate-bounce" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] shadow">
              🥺
            </span>
          </div>

          <div>
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-950/60 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
              Emergency Broadcast
            </span>
            <h2 id="dont-delete-title" className="text-lg sm:text-xl font-black tracking-tight text-white mt-0.5">
              Wait! Don&apos;t Uninstall Me! 🥺
            </h2>
          </div>
        </div>

        {/* Melodramatic Plea Body */}
        <p className="text-xs text-neutral-300 leading-relaxed">
          Were you really about to delete <span className="font-semibold text-white">Cablecast</span>? Before you drag us to the digital junkyard, think about what happens next:
        </p>

        {/* Funny Guilt Trip Points */}
        <div className="my-4 space-y-2.5 rounded-xl border border-neutral-800/90 bg-neutral-900/60 p-3.5 text-xs">
          <div className="flex items-start gap-2.5">
            <RotateCcw className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-neutral-300">
              <strong className="text-white font-semibold">The tapes won&apos;t rewind themselves:</strong> Our Blockbuster late fees will reach billions of dollars.
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <Radio className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-neutral-300">
              <strong className="text-white font-semibold">Permanent Dead Air:</strong> Channel 03 will broadcast pure static into the empty void forever.
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <Film className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-neutral-300">
              <strong className="text-white font-semibold">2:00 AM Loneliness:</strong> Who is going to watch the vintage knife infomercials with you?
            </p>
          </div>
        </div>

        {/* Interactive Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={handlePledgeLove}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-red-950/60 hover:from-red-500 hover:to-rose-500 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Heart className="h-4 w-4 fill-white" />
            <span>I&apos;ll Keep You! ❤️</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:border-neutral-700 hover:text-white active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Just checking 😂</span>
          </button>
        </div>
      </div>
    </div>
  );
}
