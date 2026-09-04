"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  RotateCw,
  Clock,
  Film,
  Sparkles,
  Check,
  Loader2,
  ShoppingBag,
  Layers,
  Calendar,
  ArrowLeft,
  X,
} from "lucide-react";
import type { VhsMetadata } from "@/types/vhs";
import { useToast } from "@/components/ui/ToastProvider";
import { notifyLibraryMutation, notifyBroadcastMutation } from "@/lib/syncEvents";

interface VhsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: number | string;
  mediaType: "MOVIE" | "TV" | "movie" | "tv";
  initialSeason?: number;
  totalSeasons?: number;
  title?: string;
  initialAction?: "RENT" | "BUY";
}

/**
 * Generates dynamic SVG Barcode lines based on mediaId and seasonNumber.
 */
function VhsBarcode({ mediaId, seasonNumber }: { mediaId: number | string; seasonNumber?: number }) {
  const seed = `${mediaId}${seasonNumber ?? 1}`.padEnd(12, "7");
  const codeDigits = seed.slice(0, 12);

  // Generate bar widths from seed digits deterministically
  const bars: number[] = [];
  for (let i = 0; i < codeDigits.length; i++) {
    const val = parseInt(codeDigits[i], 10) || 3;
    bars.push((val % 3) + 1);
    bars.push(((val + 1) % 2) + 1);
    bars.push(((val * 2) % 4) + 1);
  }

  return (
    <div className="flex flex-col items-center justify-center p-1 rounded bg-white text-black font-mono select-none h-7 w-full shrink-0">
      <div className="flex items-end justify-center h-4 gap-[1.5px] w-full max-w-[150px]">
        {/* Guard bars */}
        <span className="w-[1.5px] h-4 bg-black shrink-0" />
        <span className="w-[1px] h-4 bg-white shrink-0" />
        <span className="w-[1.5px] h-4 bg-black shrink-0" />

        {bars.slice(0, 20).map((width, idx) => (
          <span
            key={idx}
            className="bg-black shrink-0"
            style={{
              width: `${Math.min(width, 2)}px`,
              height: idx % 5 === 0 ? "16px" : "13px",
            }}
          />
        ))}

        {/* Center guard */}
        <span className="w-[1.5px] h-4 bg-black shrink-0" />
        <span className="w-[1px] h-4 bg-white shrink-0" />
        <span className="w-[1.5px] h-4 bg-black shrink-0" />

        {bars.slice(20, 40).map((width, idx) => (
          <span
            key={`r-${idx}`}
            className="bg-black shrink-0"
            style={{
              width: `${Math.min(width, 2)}px`,
              height: idx % 4 === 0 ? "16px" : "13px",
            }}
          />
        ))}

        {/* End guard */}
        <span className="w-[1.5px] h-4 bg-black shrink-0" />
        <span className="w-[1px] h-4 bg-white shrink-0" />
        <span className="w-[1.5px] h-4 bg-black shrink-0" />
      </div>
      <span className="text-[7px] font-bold tracking-[0.2em] -mt-0.5 text-neutral-800 leading-none">
        0 {codeDigits.slice(0, 6)} {codeDigits.slice(6, 12)} 4
      </span>
    </div>
  );
}

export function VhsModal({
  isOpen,
  onClose,
  mediaId,
  mediaType: rawMediaType,
  initialSeason = 1,
  totalSeasons = 1,
  title,
  initialAction,
}: VhsModalProps) {
  const { toast } = useToast();
  const normalizedType = rawMediaType.toUpperCase() === "TV" ? "TV" : "MOVIE";
  const isTv = normalizedType === "TV";

  const [isFlipped, setIsFlipped] = useState(false);
  const [activeSeasonIndex, setActiveSeasonIndex] = useState(
    Math.max(0, (initialSeason || 1) - 1)
  );
  const [metadata, setMetadata] = useState<VhsMetadata | null>(null);
  const [seasonCache, setSeasonCache] = useState<Record<number, VhsMetadata>>({});
  const seasonCacheRef = useRef<Record<number, VhsMetadata>>({});
  seasonCacheRef.current = seasonCache;
  const [isLoading, setIsLoading] = useState(false);
  const [ownershipStatus, setOwnershipStatus] = useState<"OWNED" | "RENTED" | "EXPIRED" | "NONE">("NONE");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  // Rental Duration Dialog State
  const isDirectRentalMode = initialAction === "RENT";
  const [isRentalModalOpen, setIsRentalModalOpen] = useState(isDirectRentalMode);
  const [selectedDurationHours, setSelectedDurationHours] = useState(48);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState(3);
  const [customUnit, setCustomUnit] = useState<"hours" | "days">("days");

  // Automatically open rental duration modal if initialAction is "RENT"
  useEffect(() => {
    if (isOpen && initialAction === "RENT") {
      setIsRentalModalOpen(true);
    }
  }, [isOpen, initialAction]);

  const isRentalActive = isDirectRentalMode || isRentalModalOpen;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isProgrammaticScrollRef = useRef(false);
  const scrollDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const numSeasons = metadata?.totalSeasons || (metadata?.seasons?.length ? metadata.seasons.length : Math.max(totalSeasons, 1));
  const isMultiSeason = isTv && numSeasons > 1;
  const selectedSeason = activeSeasonIndex + 1;

  // Preload all season poster images as soon as seasons list is known
  useEffect(() => {
    if (metadata?.seasons && Array.isArray(metadata.seasons)) {
      metadata.seasons.forEach((s) => {
        if (s.posterPath) {
          const img = new Image();
          img.src = s.posterPath;
        }
      });
    }
  }, [metadata?.seasons]);

  // Lock document body scroll when modal is open to eliminate all page-level scrollbars
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Sync initial season if modal opens with a different initial season
  useEffect(() => {
    setActiveSeasonIndex(Math.max(0, (initialSeason || 1) - 1));
    setIsFlipped(false);
  }, [initialSeason, isOpen]);

  // Smoothly scroll active card into center without layout thrashing
  const scrollToActiveCard = useCallback((index: number) => {
    const cardEl = cardRefs.current[index];
    if (cardEl && scrollContainerRef.current) {
      isProgrammaticScrollRef.current = true;
      cardEl.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 400);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !isMultiSeason) return;
    scrollToActiveCard(activeSeasonIndex);
  }, [activeSeasonIndex, isOpen, isMultiSeason, scrollToActiveCard]);

  // Debounced scroll listener: only changes active season AFTER manual scroll stops
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current || !scrollContainerRef.current) return;

    if (scrollDebounceTimerRef.current) {
      clearTimeout(scrollDebounceTimerRef.current);
    }

    scrollDebounceTimerRef.current = setTimeout(() => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closestIndex = activeSeasonIndex;
      let minDistance = Infinity;

      cardRefs.current.forEach((cardEl, idx) => {
        if (!cardEl) return;
        const cardCenter = cardEl.offsetLeft + cardEl.clientWidth / 2;
        const dist = Math.abs(containerCenter - cardCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = idx;
        }
      });

      if (closestIndex !== activeSeasonIndex) {
        setActiveSeasonIndex(closestIndex);
        setIsFlipped(false);
      }
    }, 100);
  }, [activeSeasonIndex]);

  // Fetch live VHS metadata from API with local caching
  const fetchMetadata = useCallback(async () => {
    if (!isOpen || !mediaId) return;

    // Check cache first
    if (normalizedType === "TV" && seasonCacheRef.current[selectedSeason]) {
      setMetadata(seasonCacheRef.current[selectedSeason]);
      return;
    }

    setIsLoading(true);
    try {
      const url = new URL(
        `/api/vhs/${normalizedType.toLowerCase()}/${mediaId}`,
        window.location.origin
      );
      if (normalizedType === "TV") {
        url.searchParams.set("season", String(selectedSeason));
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error("Failed to retrieve VHS metadata");
      }
      const data: VhsMetadata = await res.json();
      setMetadata(data);
      if (normalizedType === "TV") {
        setSeasonCache((prev) => ({ ...prev, [selectedSeason]: data }));
      }
    } catch (err) {
      console.error("[VhsModal] Metadata fetch error:", err);
      toast.error("Could not fetch sleeve metadata from vault", "Archive Lookup Error");
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, mediaId, normalizedType, selectedSeason, toast]);

  // Fetch ownership status
  const fetchOwnership = useCallback(async () => {
    if (!isOpen || !mediaId) return;
    try {
      const url = new URL("/api/vhs/action", window.location.origin);
      url.searchParams.set("mediaId", String(mediaId));
      if (normalizedType === "TV") {
        url.searchParams.set("season", String(selectedSeason));
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "OWNED" || data.isOwned) {
          setOwnershipStatus("OWNED");
          setExpiresAt(null);
        } else if (data.status === "RENTED" || data.isRented) {
          setOwnershipStatus("RENTED");
          setExpiresAt(data.expiresAt || null);
        } else if (data.status === "EXPIRED") {
          setOwnershipStatus("EXPIRED");
          setExpiresAt(null);
        } else {
          setOwnershipStatus("NONE");
          setExpiresAt(null);
        }
      }
    } catch (err) {
      console.error("[VhsModal] Ownership check error:", err);
    }
  }, [isOpen, mediaId, normalizedType, selectedSeason]);

  useEffect(() => {
    if (isOpen) {
      fetchMetadata();
      fetchOwnership();
    }
  }, [isOpen, fetchMetadata, fetchOwnership]);

  // Keyboard shortcuts: Esc to close / return, Space/F to flip, Arrow keys to scroll seasons
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isRentalModalOpen && !isDirectRentalMode) {
          setIsRentalModalOpen(false);
        } else {
          handleClose();
        }
      } else if (e.key === "f" || e.key === "F") {
        if (!isRentalActive) {
          setIsFlipped((prev) => !prev);
        }
      } else if (isMultiSeason && e.key === "ArrowRight") {
        if (!isRentalActive && activeSeasonIndex < numSeasons - 1) {
          setActiveSeasonIndex((prev) => prev + 1);
          setIsFlipped(false);
        }
      } else if (isMultiSeason && e.key === "ArrowLeft") {
        if (!isRentalActive && activeSeasonIndex > 0) {
          setActiveSeasonIndex((prev) => prev - 1);
          setIsFlipped(false);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isMultiSeason, numSeasons, activeSeasonIndex, isRentalModalOpen, isDirectRentalMode, isRentalActive, handleClose]);

  // Handle Confirmed Rental Action with Custom Duration
  async function handleConfirmRent(hours: number) {
    setIsMutating(true);
    try {
      const res = await fetch("/api/vhs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RENT",
          mediaId,
          mediaType: normalizedType,
          seasonNumber: normalizedType === "TV" ? selectedSeason : 0,
          durationHours: hours,
          meta: {
            title: title || null,
            posterPath: metadata?.frontPosterPath || null,
            overview: metadata?.synopsis || null,
            releaseYear: metadata?.releaseYear || null,
            voteAverage: metadata?.voteAverage != null ? metadata.voteAverage : null,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rent media.");

      setOwnershipStatus("RENTED");
      setExpiresAt(data.expiresAt || data.rental?.expiresAt || null);
      setIsRentalModalOpen(false);
      notifyLibraryMutation();
      notifyBroadcastMutation();
      toast.success(
        `Rented for ${hours >= 24 ? `${Math.round(hours / 24)} days` : `${hours} hours`}! Added to Broadcast Vault.`,
        "Tape Checked Out"
      );
      if (isDirectRentalMode) {
        handleClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rental error", "Action Failed");
    } finally {
      setIsMutating(false);
    }
  }

  // Handle Buy Action
  async function handleBuy() {
    setIsMutating(true);
    try {
      const res = await fetch("/api/vhs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BUY",
          mediaId,
          mediaType: normalizedType,
          seasonNumber: normalizedType === "TV" ? selectedSeason : 0,
          meta: {
            title: title || null,
            posterPath: metadata?.frontPosterPath || null,
            overview: metadata?.synopsis || null,
            releaseYear: metadata?.releaseYear || null,
            voteAverage: metadata?.voteAverage != null ? metadata.voteAverage : null,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add to library.");

      setOwnershipStatus("OWNED");
      setExpiresAt(null);
      notifyLibraryMutation();
      notifyBroadcastMutation();
      toast.success("Added permanently to your personal VHS collection!", "Collection Updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purchase error", "Action Failed");
    } finally {
      setIsMutating(false);
    }
  }

  if (!isOpen) return null;

  const displayTitle = title || (isTv ? `Series #${mediaId}` : `Movie #${mediaId}`);
  const allSeasons = Array.from({ length: numSeasons }, (_, i) => i);
  const activeSeasonData = seasonCache[selectedSeason] || metadata;

  // Calculate formatted time remaining for active rental
  const timeRemainingStr = useMemo(() => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const totalHours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    if (days >= 1) {
      return `${days}d ${totalHours % 24}h left`;
    }
    return `${totalHours}h left`;
  }, [expiresAt]);

  // Effective rental hours for the picker
  const effectiveHours = isCustomMode
    ? customUnit === "days"
      ? Math.max(1, customAmount) * 24
      : Math.max(1, customAmount)
    : selectedDurationHours;

  const projectedDueDate = useMemo(
    () => new Date(Date.now() + effectiveHours * 3600 * 1000),
    [effectiveHours]
  );

  const closeRentalModal = useCallback(() => {
    if (isDirectRentalMode) {
      handleClose();
    } else {
      setIsRentalModalOpen(false);
    }
  }, [isDirectRentalMode, handleClose]);

  const rentalCheckoutContent = (
    <>
      {/* Top Breadcrumb Navigation Header */}
      <header className="border-b border-neutral-900 pb-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 mb-3">
          <button
            type="button"
            onClick={closeRentalModal}
            className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>{isDirectRentalMode ? "Back to Cablecast" : "Back to Sleeve"}</span>
          </button>
          <span className="text-neutral-700 leading-none select-none">/</span>
          <span className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate">
            Rental Checkout
          </span>
        </div>

        {/* Subtitle Row matching Cablecast Station Control */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-amber-400 shadow">
            <Clock className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
              VHS Rental Checkout
            </h3>
          </div>
        </div>
      </header>

      {/* Selected Show / Movie Preview Card */}
      <div className="flex items-center gap-3.5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 shadow">
          {activeSeasonData?.frontPosterPath || metadata?.frontPosterPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeSeasonData?.frontPosterPath || metadata?.frontPosterPath || ""}
              alt={displayTitle}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600">
              <Film className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-400 border border-neutral-800">
              {normalizedType}
            </span>
            {isTv && (
              <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-neutral-300 border border-neutral-800">
                SEASON {selectedSeason}
              </span>
            )}
            <h4 className="truncate text-sm font-bold text-white">{displayTitle}</h4>
          </div>

          <p className="text-xs text-neutral-400">
            {isTv
              ? `${activeSeasonData?.episodes?.length || 1} Episodes · Auto-Advancing`
              : `Feature Presentation · ${activeSeasonData?.calculatedRuntime || 120}m`}
          </p>
        </div>
      </div>

      {/* Duration Section */}
      <div className="space-y-3">
        <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-400">
          <Calendar className="h-3.5 w-3.5 text-neutral-500" />
          Rental Duration
        </label>

        {/* 6 Preset Cards Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {[
            { label: "24H", sub: "1 Day", hours: 24 },
            { label: "48H", sub: "2 Days", hours: 48 },
            { label: "72H", sub: "3 Days", hours: 72 },
            { label: "7D", sub: "1 Week", hours: 168 },
            { label: "14D", sub: "2 Weeks", hours: 336 },
            { label: "30D", sub: "1 Month", hours: 720 },
          ].map((preset) => {
            const isSelected = !isCustomMode && selectedDurationHours === preset.hours;
            return (
              <button
                key={preset.hours}
                type="button"
                onClick={() => {
                  setIsCustomMode(false);
                  setSelectedDurationHours(preset.hours);
                }}
                className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition-all cursor-pointer ${isSelected
                  ? "border border-neutral-700 bg-neutral-800 text-white shadow-md ring-1 ring-amber-500/40"
                  : "border border-neutral-800/80 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
                  }`}
              >
                <span className="font-mono text-xs font-bold">{preset.label}</span>
                <span className="text-[9px] text-neutral-500">{preset.sub}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Duration Segment */}
        <div className="pt-2 border-t border-neutral-900 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
              Custom Timing
            </label>

            {/* Segmented Switch (Hours / Days) */}
            <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true);
                  setCustomUnit("hours");
                }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${isCustomMode && customUnit === "hours"
                  ? "bg-neutral-800 text-white shadow-md"
                  : "text-neutral-400 hover:text-neutral-200"
                  }`}
              >
                <span>Hours</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true);
                  setCustomUnit("days");
                }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${isCustomMode && customUnit === "days"
                  ? "bg-neutral-800 text-white shadow-md"
                  : "text-neutral-400 hover:text-neutral-200"
                  }`}
              >
                <span>Days</span>
              </button>
            </div>
          </div>

          {isCustomMode && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 animate-in fade-in duration-150">
              <span className="text-xs text-neutral-400 font-mono">Amount:</span>
              <input
                type="number"
                min={1}
                max={customUnit === "days" ? 365 : 8760}
                value={customAmount}
                onChange={(e) => setCustomAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-mono font-bold text-white text-center focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-amber-400 font-mono font-bold">
                {customAmount} {customUnit} ({effectiveHours} total hours)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Calculated Return Due Date */}
      <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 font-mono text-xs">
        <div className="flex items-center gap-2 text-neutral-400">
          <Clock className="h-4 w-4 text-amber-400" />
          <span className="text-[10px] uppercase font-bold tracking-wider">EXPIRATION TIMESTAMP:</span>
        </div>
        <span className="text-amber-300 font-bold text-xs">
          {projectedDueDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={closeRentalModal}
          className="rounded-xl border border-neutral-800 bg-neutral-900/80 py-2.5 text-xs font-semibold text-neutral-300 hover:border-neutral-700 hover:text-white transition-all cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isMutating}
          onClick={() => handleConfirmRent(effectiveHours)}
          className="rounded-xl border border-amber-500/40 bg-white hover:bg-neutral-200 text-black py-2.5 text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer disabled:opacity-40"
        >
          {isMutating ? (
            <Loader2 className="h-4 w-4 animate-spin text-black" />
          ) : (
            <Check className="h-4 w-4 stroke-[2.5]" />
          )}
          <span>Check Out Tape</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-md overflow-hidden select-none animate-in fade-in"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest("[data-interactive='true']") ||
          target.closest("button")
        ) {
          return;
        }
        handleClose();
      }}
    >
      {/* ── UNIFIED MODAL BODY (Rental Checkout OR 3D VHS Sleeve) ─── */}
      {isRentalActive ? (
        <div
          data-interactive="true"
          className="relative z-50 w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:p-6 shadow-2xl backdrop-blur-xl flex flex-col gap-4 my-auto animate-in zoom-in-95"
        >
          {rentalCheckoutContent}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center relative z-50 my-auto w-full max-w-full animate-in zoom-in-95">
        {/* Floating Flip Button attached tightly above active card */}
        <button
          type="button"
          onClick={() => setIsFlipped((prev) => !prev)}
          className="mb-2 sm:mb-3 bg-neutral-900/95 hover:bg-neutral-800 text-neutral-200 hover:text-amber-300 border border-neutral-700/80 hover:border-amber-500/50 px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap z-40"
        >
          <RotateCw
            className={`w-3.5 h-3.5 transition-transform duration-500 ${isFlipped ? "rotate-180 text-amber-400" : ""
              }`}
          />
          <span>{isFlipped ? "Flip to Front Cover" : "Flip to Back Sleeve"}</span>
        </button>

        {/* ── CAROUSEL TRACK (SINGLE BOX OR NATIVE MULTI-SEASON SCROLLER) ───── */}
        {!isMultiSeason ? (
          // ── SINGLE CARD (Movie or Single Season TV) ──
          <div
            data-interactive="true"
            className="w-[86vw] max-w-[320px] sm:w-[370px] aspect-[2/3] max-h-[76vh] sm:max-h-[82vh] relative [perspective:1400px] mx-auto"
          >
            <div
              className={`h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d] relative ${isFlipped ? "[transform:rotateY(180deg)]" : ""
                }`}
            >
              {/* Front Cover View */}
              <div className="h-full w-full [backface-visibility:hidden] [-webkit-backface-visibility:hidden] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden absolute inset-0 flex flex-col justify-between">
                <div className="bg-gradient-to-r from-red-900/90 via-amber-900/90 to-blue-900/90 border-b border-neutral-800 px-3 py-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-neutral-200 shrink-0 z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-400 font-bold">VHS</span>
                    <span className="text-neutral-400">|</span>
                    <span>Hi-Fi STEREO</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[8px] text-neutral-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span>NTSC COLOR</span>
                  </div>
                </div>

                <div className="absolute inset-0 pt-7 bg-neutral-900 overflow-hidden flex items-center justify-center">
                  {metadata?.frontPosterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={metadata.frontPosterPath}
                      alt={displayTitle}
                      className="w-full h-full object-cover object-center"
                      loading="eager"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-600">
                      <Film className="h-12 w-12 stroke-[1.2] mb-2 text-neutral-700" />
                      <p className="text-xs font-mono">No cover art in vault</p>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-transparent" />

                  <div className="absolute top-9 left-3 flex items-center gap-1.5 z-10">
                    {ownershipStatus === "OWNED" && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-950/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 shadow-md backdrop-blur-md">
                        <Check className="h-3 w-3" />
                        In Collection
                      </span>
                    )}
                    {ownershipStatus === "RENTED" && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-950/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 shadow-md backdrop-blur-md">
                        <Clock className="h-3 w-3" />
                        <span>Rented {timeRemainingStr ? `• ${timeRemainingStr}` : ""}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 p-4 pt-12 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent flex flex-col gap-3 z-20">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-sans truncate w-full">
                    <span className="font-bold text-white truncate max-w-[140px] drop-shadow-sm">
                      {displayTitle}
                    </span>
                    <span className="text-neutral-500">•</span>
                    {metadata?.calculatedRuntime ? (
                      <span className="shrink-0 text-neutral-300 font-mono">
                        {metadata.calculatedRuntime}M
                      </span>
                    ) : (
                      <span className="shrink-0 text-neutral-400 font-mono">FEATURE</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 w-full">
                    <button
                      type="button"
                      disabled={isMutating || ownershipStatus === "OWNED"}
                      onClick={() => setIsRentalModalOpen(true)}
                      className="bg-amber-950/80 hover:bg-amber-900/90 text-amber-300 border border-amber-500/50 shadow-md rounded-xl py-2.5 px-3 text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer active:scale-95"
                    >
                      {isMutating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 text-amber-400" />}
                      <span>{ownershipStatus === "RENTED" ? "✓ Rented" : "Rent Tape"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isMutating || ownershipStatus === "OWNED"}
                      onClick={handleBuy}
                      className="bg-white hover:bg-neutral-200 text-black font-bold rounded-xl py-2.5 px-3 text-xs whitespace-nowrap flex items-center justify-center gap-1.5 shadow-lg transition-all disabled:opacity-40 cursor-pointer active:scale-95"
                    >
                      {isMutating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-black" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                      <span>{ownershipStatus === "OWNED" ? "✓ Owned" : "Buy Tape"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Back Cover View */}
              <div className="h-full w-full [transform:rotateY(180deg)] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] absolute inset-0 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 pb-12 sm:pb-14 shadow-2xl overflow-hidden flex flex-col justify-start gap-2.5">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4 text-amber-400" />
                    <span className="font-mono text-[10px] font-black uppercase tracking-widest text-neutral-300">
                      Cablecast Home Video
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-neutral-500 uppercase">
                    CAT NO. CC-{mediaId}
                  </span>
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                  <div className="space-y-0.5 shrink-0">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                      {"// PROGRAM SYNOPSIS"}
                    </span>
                    <p className="text-[11px] leading-relaxed text-neutral-300 font-sans line-clamp-3">
                      {metadata?.synopsis || "No program synopsis provided on sleeve jacket."}
                    </p>
                  </div>

                  <div className="shrink-0 pt-2 border-t border-neutral-800/80 text-[10.5px] font-mono text-neutral-400 leading-snug space-y-0.5">
                    <p className="flex items-center gap-1 truncate">
                      <span className="text-neutral-500 uppercase font-semibold text-[9.5px]">Created By: </span>
                      <span className="text-neutral-300 truncate">
                        {metadata?.credits?.creators?.join(", ") || "Production Team"}
                      </span>
                    </p>
                    <p className="leading-relaxed line-clamp-2">
                      <span className="text-neutral-500 uppercase font-semibold text-[9.5px]">Featuring: </span>
                      <span className="text-neutral-300">
                        {metadata?.credits?.mainCast?.join(", ") || "Cast"}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Fixed Pinned Barcode at Bottom */}
                <div className="absolute bottom-0 inset-x-0 p-2 sm:p-2.5 bg-neutral-950 border-t border-neutral-900 z-20">
                  <VhsBarcode mediaId={mediaId} seasonNumber={1} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          // ── MULTI-SEASON SMOOTH HORIZONTAL TRACK ──
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            className="w-full max-w-full overflow-x-auto overflow-y-hidden no-scrollbar flex items-center gap-8 sm:gap-8 px-[calc(50vw-min(43vw,160px))] sm:px-[calc(50vw-180px)] py-2 sm:py-4 scroll-smooth snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]"
          >
            {allSeasons.map((seasonIndex) => {
              const isSelected = seasonIndex === activeSeasonIndex;
              const seasonNum = seasonIndex + 1;
              const seasonPoster =
                metadata?.seasons?.find((s) => s.seasonNumber === seasonNum)?.posterPath ||
                seasonCache[seasonNum]?.frontPosterPath ||
                metadata?.frontPosterPath;

              if (isSelected) {
                // ── ACTIVE FLIPPABLE 3D CARD ──
                return (
                  <div
                    key={seasonNum}
                    data-interactive="true"
                    ref={(el) => {
                      cardRefs.current[seasonIndex] = el;
                    }}
                    className="shrink-0 snap-center w-[86vw] max-w-[320px] sm:w-[360px] aspect-[2/3] max-h-[76vh] sm:max-h-[82vh] relative [perspective:1400px] transition-transform transition-opacity duration-300 transform-gpu will-change-transform z-30 scale-100 opacity-100 outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]"
                  >
                    <div
                      className={`h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d] relative ${isFlipped ? "[transform:rotateY(180deg)]" : ""
                        }`}
                    >
                      {/* Front Face */}
                      <div className="h-full w-full [backface-visibility:hidden] [-webkit-backface-visibility:hidden] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden absolute inset-0 flex flex-col justify-between outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]">
                        <div className="bg-gradient-to-r from-red-900/90 via-amber-900/90 to-blue-900/90 border-b border-neutral-800 px-3 py-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-neutral-200 shrink-0 z-10">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-amber-400 font-bold">VHS</span>
                            <span className="text-neutral-400">|</span>
                            <span>Hi-Fi STEREO</span>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[8px] text-neutral-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span>NTSC COLOR</span>
                          </div>
                        </div>

                        <div className="absolute inset-0 pt-7 bg-neutral-900 overflow-hidden flex items-center justify-center">
                          {seasonPoster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={seasonPoster}
                              alt={displayTitle}
                              className="w-full h-full object-cover object-center"
                              loading="eager"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-600">
                              <Film className="h-12 w-12 stroke-[1.2] mb-2 text-neutral-700" />
                              <p className="text-xs font-mono">No cover art in vault</p>
                            </div>
                          )}

                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-transparent" />

                          <div className="absolute top-9 left-3 flex items-center gap-1.5 z-10">
                            {ownershipStatus === "OWNED" && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-950/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 shadow-md backdrop-blur-md">
                                <Check className="h-3 w-3" />
                                In Collection
                              </span>
                            )}
                            {ownershipStatus === "RENTED" && (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/60 bg-amber-950/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 shadow-md backdrop-blur-md">
                                <Clock className="h-3 w-3 text-amber-400" />
                                <span>Rented {timeRemainingStr ? `• ${timeRemainingStr}` : ""}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="absolute bottom-0 inset-x-0 p-4 pt-12 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent flex flex-col gap-3 z-20">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-sans truncate w-full">
                            <span className="font-bold text-white truncate max-w-[140px] drop-shadow-sm">
                              {displayTitle}
                            </span>
                            <span className="text-neutral-500">•</span>
                            <span className="font-bold text-white shrink-0">
                              Season {selectedSeason}
                            </span>
                            {activeSeasonData?.episodes && activeSeasonData.episodes.length > 0 && (
                              <>
                                <span className="text-neutral-500">•</span>
                                <span className="shrink-0 text-neutral-300">
                                  {activeSeasonData.episodes.length} {activeSeasonData.episodes.length === 1 ? "Ep" : "Eps"}
                                </span>
                              </>
                            )}
                            {activeSeasonData?.calculatedRuntime ? (
                              <>
                                <span className="text-neutral-500">•</span>
                                <span className="shrink-0 text-neutral-300 font-mono">
                                  {activeSeasonData.calculatedRuntime}M
                                </span>
                              </>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 w-full">
                            <button
                              type="button"
                              disabled={isMutating || ownershipStatus === "OWNED"}
                              onClick={() => setIsRentalModalOpen(true)}
                              className="bg-amber-950/80 hover:bg-amber-900/90 text-amber-300 border border-amber-500/50 shadow-md rounded-xl py-2.5 px-3 text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer active:scale-95"
                            >
                              {isMutating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-amber-400" />
                              )}
                              <span>
                                {ownershipStatus === "RENTED"
                                  ? "✓ Rented"
                                  : "Rent Season"}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={isMutating || ownershipStatus === "OWNED"}
                              onClick={handleBuy}
                              className="bg-white hover:bg-neutral-200 text-black font-bold rounded-xl py-2.5 px-3 text-xs whitespace-nowrap flex items-center justify-center gap-1.5 shadow-lg transition-all disabled:opacity-40 cursor-pointer active:scale-95"
                            >
                              {isMutating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                              ) : (
                                <ShoppingBag className="h-3.5 w-3.5" />
                              )}
                              <span>{ownershipStatus === "OWNED" ? "✓ Owned" : "Buy Season"}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Back Face */}
                      <div className="h-full w-full [transform:rotateY(180deg)] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] absolute inset-0 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 pb-12 sm:pb-14 shadow-2xl overflow-hidden flex flex-col justify-start gap-2.5 outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]">
                        <div className="flex items-center justify-between border-b border-neutral-800 pb-2 shrink-0">
                          <div className="flex items-center gap-2">
                            <Film className="h-4 w-4 text-amber-400" />
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-neutral-300">
                              Cablecast Home Video
                            </span>
                          </div>
                          <span className="font-mono text-[9px] text-neutral-500 uppercase">
                            CAT NO. CC-{mediaId}
                          </span>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                          <div className="space-y-0.5 shrink-0">
                            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                              {"// PROGRAM SYNOPSIS"}
                            </span>
                            <p className="text-[11px] leading-relaxed text-neutral-300 font-sans line-clamp-3">
                              {activeSeasonData?.synopsis || "No program synopsis provided on sleeve jacket."}
                            </p>
                          </div>

                          {activeSeasonData?.guestStars && activeSeasonData.guestStars.length > 0 && (
                            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-2 space-y-0.5 shrink-0">
                              <div className="flex items-center gap-1.5 text-amber-300 text-[9px] font-mono font-bold uppercase tracking-wider">
                                <Sparkles className="h-3 w-3" />
                                <span>Special Guest Appearances:</span>
                              </div>
                              <p className="text-[10.5px] text-neutral-300 font-medium leading-snug">
                                {activeSeasonData.guestStars.join(" • ")}
                              </p>
                            </div>
                          )}

                          <div className="flex-1 min-h-0 flex flex-col space-y-1 overflow-hidden">
                            <div className="flex items-center justify-between text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-900 pb-0.5 shrink-0">
                              <span>{"// EPISODE DIRECTORY"}</span>
                              <span className="text-neutral-500">{activeSeasonData?.episodes?.length || 1} Item(s)</span>
                            </div>

                            <div className="flex-1 min-h-[100px] overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[11px] scrollbar-none [&::-webkit-scrollbar]:hidden">
                              {activeSeasonData?.episodes?.map((ep) => (
                                <div
                                  key={ep.episodeNumber}
                                  className="flex items-center justify-between gap-1.5 rounded bg-neutral-900/80 py-1 px-2 border border-neutral-800/80 text-[11px]"
                                >
                                  <span className="text-amber-400/90 font-bold shrink-0">
                                    {String(ep.episodeNumber).padStart(2, "0")}.
                                  </span>
                                  <span className="text-neutral-200 truncate font-sans text-[11px] flex-1">
                                    {ep.name}
                                  </span>
                                  <span className="text-neutral-500 text-[9px] shrink-0 font-mono">
                                    {ep.runtime}m
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="shrink-0 pt-1.5 border-t border-neutral-800/80 text-[10.5px] font-mono text-neutral-400 leading-snug space-y-0.5">
                            <p className="flex items-center gap-1 truncate">
                              <span className="text-neutral-500 uppercase font-semibold text-[9.5px]">Created By: </span>
                              <span className="text-neutral-300 truncate">
                                {activeSeasonData?.credits?.creators?.join(", ") || "Production Team"}
                              </span>
                            </p>
                            <p className="leading-relaxed line-clamp-2">
                              <span className="text-neutral-500 uppercase font-semibold text-[9.5px]">Featuring: </span>
                              <span className="text-neutral-300">
                                {activeSeasonData?.credits?.mainCast?.join(", ") || "Cast"}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Fixed Pinned Barcode at Bottom */}
                        <div className="absolute bottom-0 inset-x-0 p-2 sm:p-2.5 bg-neutral-950 border-t border-neutral-900 z-20">
                          <VhsBarcode mediaId={mediaId} seasonNumber={selectedSeason} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── UNSELECTED PEEKING SEASON CARDS ──
              return (
                <div
                  key={seasonNum}
                  data-interactive="true"
                  ref={(el) => {
                    cardRefs.current[seasonIndex] = el;
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSeasonIndex(seasonIndex);
                    setIsFlipped(false);
                    scrollToActiveCard(seasonIndex);
                  }}
                  className="shrink-0 snap-center w-[86vw] max-w-[320px] sm:w-[360px] aspect-[2/3] max-h-[76vh] sm:max-h-[82vh] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl overflow-hidden flex flex-col justify-between group select-none cursor-pointer opacity-40 hover:opacity-90 scale-95 hover:scale-[0.98] transition-transform transition-opacity duration-300 transform-gpu will-change-transform outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]"
                  title={`Switch to Season ${seasonNum}`}
                >
                  <div className="bg-gradient-to-r from-red-900/60 via-amber-900/60 to-blue-900/60 border-b border-neutral-800/80 px-3 py-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-amber-400/90 shrink-0 z-10">
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      <span>VHS • HI-FI</span>
                    </div>
                    <span className="font-mono text-neutral-300">SEASON {seasonNum}</span>
                  </div>

                  <div className="absolute inset-0 pt-7 bg-neutral-900 overflow-hidden flex items-center justify-center">
                    {seasonPoster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={seasonPoster}
                        alt={`Season ${seasonNum}`}
                        className="w-full h-full object-cover object-center opacity-40 group-hover:opacity-75 transition-opacity duration-300 pointer-events-none"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-neutral-600">
                        <Film className="h-10 w-10 mb-1 text-neutral-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-black/60 pointer-events-none" />
                  </div>

                  {/* Clean Footer Label without arrows */}
                  <div className="relative z-10 p-2.5 bg-neutral-950/95 border-t border-neutral-900 flex items-center justify-between text-xs font-mono font-bold text-amber-300/90 px-3">
                    <span>SEASON {seasonNum}</span>
                    <span className="text-[10px] font-mono text-neutral-400 group-hover:text-amber-300 transition-colors">SELECT</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
