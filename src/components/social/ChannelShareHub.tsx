"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Share2,
  Copy,
  Check,
  Radio,
  Tv,
  Clock,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Film,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { notifyBroadcastMutation } from "@/lib/syncEvents";
import { formatBlockTime, DAYS_OF_WEEK } from "@/types/broadcast";

interface ChannelShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  itemCount: number;
}

/**
 * Modal to generate and copy a 24h shareable link for your broadcast lineup.
 */
export function ChannelShareModal({
  isOpen,
  onClose,
  channelName,
  itemCount,
}: ChannelShareModalProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareData, setShareData] = useState<{
    shareUrl: string;
    expiresAt: string;
    token: string;
  } | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/channels/share", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate link.");

      const fullUrl = `${window.location.origin}${data.shareUrl}`;
      setShareData({
        shareUrl: fullUrl,
        expiresAt: data.expiresAt,
        token: data.token,
      });
      toast.success("Share link created! Valid for 24 hours.", "Channel Ready to Share");
    } catch (err) {
      toast.error((err as Error).message || "Share error", "Could Not Generate Link");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareData) return;
    try {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setHasCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:p-6 shadow-2xl shadow-black space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Share Channel Lineup
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Info */}
        <div className="space-y-1">
          <h4 className="text-base font-bold text-white">{channelName}</h4>
          <p className="text-xs text-neutral-400">
            Share a snapshot of your {itemCount} scheduled broadcast slots via a secure, 24-hour link.
            Recipients can preview and add your lineup to their TV with one tap.
          </p>
        </div>

        {/* Share Link Generation or Display */}
        {!shareData ? (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || itemCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-neutral-200 text-black py-3 text-xs font-bold uppercase tracking-wider shadow-lg transition-all disabled:opacity-40 cursor-pointer active:scale-95"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                  <span>Packaging Snapshot...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-black" />
                  <span>Create 24h Share Link</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-black p-2.5">
              <input
                type="text"
                readOnly
                value={shareData.shareUrl}
                className="w-full bg-transparent text-xs font-mono text-purple-300 select-all outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer shadow-sm"
              >
                {hasCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span className="flex items-center gap-1 text-amber-400">
                <Clock className="h-3 w-3" />
                Valid for 24 hours
              </span>
              <span>One-click import enabled</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ChannelResolveViewProps {
  token: string;
}

/**
 * Landing page view when arriving from /share/[token].
 */
export function ChannelResolveView({ token }: ChannelResolveViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    channelName: string;
    sharedAt: string;
    items: Array<{
      tmdbId: number;
      mediaType: string;
      title: string;
      dayOfWeek: number;
      blockStartMinutes: number;
      blockCount: number;
      currentSeason?: number;
      currentEpisode?: number;
      posterPath?: string | null;
      backdropUrl?: string | null;
    }>;
  } | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    totalOffered: number;
  } | null>(null);

  useEffect(() => {
    async function resolveToken() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/channels/resolve/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to resolve link.");
        setSnapshot(data.snapshot);
      } catch (err) {
        setError((err as Error).message || "Link resolution error");
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      resolveToken();
    }
  }, [token]);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const res = await fetch(`/api/channels/resolve/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import lineup.");

      notifyBroadcastMutation();
      setImportResult({
        importedCount: data.importedCount,
        totalOffered: data.totalOffered,
      });
      toast.success(
        `Added "${data.channelName || snapshot?.channelName}" as a new channel on your TV Guide!`,
        "Channel Added",
      );
    } catch (err) {
      toast.error((err as Error).message || "Import failed", "Channel Error");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header Branding */}
        <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
          <div className="flex items-center gap-2">
            <Radio className="h-6 w-6 text-purple-400" />
            <h1 className="text-lg font-black uppercase tracking-wider text-white">Cablecast</h1>
          </div>
          <Link
            href="/home"
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Go to TV Home &rarr;
          </Link>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            <p className="text-xs font-mono uppercase tracking-widest text-neutral-400">
              Tuning Into Shared Broadcast Signal...
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-6 text-center space-y-4">
            <AlertCircle className="h-10 w-10 mx-auto text-red-400" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-red-200">Broadcast Link Unavailable</h3>
              <p className="text-xs text-neutral-400">{error}</p>
            </div>
            <Link
              href="/home"
              className="inline-block rounded-xl bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              Return to Cablecast Home
            </Link>
          </div>
        )}

        {/* Success / Imported View */}
        {importResult && (
          <div className="rounded-2xl border border-purple-500/50 bg-purple-950/20 p-6 text-center space-y-4 animate-in fade-in">
            <Check className="h-12 w-12 mx-auto text-purple-400" />
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Channel Added to Your TV Guide!</h3>
              <p className="text-xs text-neutral-300">
                &ldquo;{snapshot?.channelName}&rdquo; is now active as a standalone channel with {importResult.importedCount} scheduled broadcasts. Your personal lineup remains untouched.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => router.push("/home")}
                className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-neutral-200 text-black px-6 py-3 text-xs font-bold uppercase tracking-wider shadow-lg transition-all cursor-pointer active:scale-95"
              >
                <span>Watch on TV Guide</span>
                <ArrowRight className="h-4 w-4 text-black" />
              </button>
            </div>
          </div>
        )}

        {/* Preview of Shared Channels */}
        {!isLoading && !error && !importResult && snapshot && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-900 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-purple-400">
                  Shared Standalone Channel
                </span>
                <h2 className="text-xl font-black text-white">{snapshot.channelName}</h2>
                <p className="text-xs text-neutral-400">
                  {snapshot.items.length} Curated Broadcast Appointments · Adds as a new channel
                </p>
              </div>

              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-neutral-200 text-black px-6 py-3 text-xs font-bold uppercase tracking-wider shadow-lg transition-all disabled:opacity-40 cursor-pointer active:scale-95"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-black" />
                    <span>Adding Channel...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-black" />
                    <span>Add {snapshot.channelName} as Channel</span>
                  </>
                )}
              </button>
            </div>

            {/* List of items */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400">
                Scheduled Program Guide
              </h4>
              <div className="divide-y divide-neutral-900 rounded-xl border border-neutral-900 bg-neutral-950/60 overflow-hidden">
                {snapshot.items.map((item, idx) => {
                  const dayName = DAYS_OF_WEEK.find((d) => d.day === item.dayOfWeek)?.name || `Day ${item.dayOfWeek}`;
                  const timeStr = formatBlockTime(item.blockStartMinutes);

                  return (
                    <div key={idx} className="flex items-center justify-between gap-3 p-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-neutral-400">
                          {item.mediaType === "tv" ? <Tv className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate">{item.title}</p>
                          <p className="text-[11px] text-neutral-400">
                            {item.mediaType === "tv"
                              ? `Season ${item.currentSeason} · Episode ${item.currentEpisode}`
                              : `Feature Presentation (${item.blockCount * 30}m)`}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono text-neutral-400">
                        <span className="text-purple-300 font-semibold">{dayName}</span>
                        <span className="mx-1">@</span>
                        <span>{timeStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
