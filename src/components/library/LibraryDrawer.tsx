"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  CalendarCheck2,
  Clock,
  Compass,
  Heart,
  Key,
  Loader2,
  Package,
  Radio,
  Search,
  Star,
  Tag,
  Ticket,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import type { LibraryMediaItem, LibraryTabKey } from "@/types/library";
import { toMediaSearchResult } from "@/types/library";
import type { MediaSearchResult } from "@/types/media";
import { useToast } from "@/components/ui/ToastProvider";

interface LibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  collection: LibraryMediaItem[];
  owned: LibraryMediaItem[];
  rented: LibraryMediaItem[];
  onAddToBroadcast?: (media: MediaSearchResult, season?: number) => void;
  onRemoveItem?: (mediaId: number | string, seasonNumber?: number | null) => Promise<boolean>;
  isScheduled?: (tmdbId: number, seasonNumber?: number) => boolean;
  onOpenBroadcastStudio?: () => void;
  onSelectMedia?: (media: MediaSearchResult, season?: number) => void;
}

function formatRemainingTime(expiresAt?: string | null): string {
  if (!expiresAt) return "Active Rental";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const totalHours = Math.max(1, Math.ceil(diff / (1000 * 60 * 60)));
  return `${totalHours} hr remaining`;
}

export function LibraryDrawer({
  isOpen,
  onClose,
  collection,
  owned,
  rented,
  onAddToBroadcast,
  onRemoveItem,
  isScheduled,
  onOpenBroadcastStudio,
  onSelectMedia,
}: LibraryDrawerProps) {
  const { toast, confirm } = useToast();
  const [activeTab, setActiveTab] = useState<LibraryTabKey>("COLLECTION");
  const [filterQuery, setFilterQuery] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Dynamic search placeholder based on active tab
  const getSearchPlaceholder = () => {
    switch (activeTab) {
      case "COLLECTION":
        return "Search collection...";
      case "OWNED":
        return "Search owned...";
      case "RENTED":
        return "Search rented...";
      default:
        return "Search collection...";
    }
  };

  // Active items list based on tab
  const getActiveItems = () => {
    switch (activeTab) {
      case "COLLECTION":
        return collection;
      case "OWNED":
        return owned;
      case "RENTED":
        return rented;
      default:
        return collection;
    }
  };

  const filteredItems = getActiveItems().filter((item) =>
    item.title.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleDeleteItem = async (item: LibraryMediaItem) => {
    const isRented = item.ownershipType === "RENTED";
    const itemDisplayName =
      item.mediaType === "tv" && item.seasonNumber && item.seasonNumber > 0
        ? `${item.title} (Season ${item.seasonNumber})`
        : item.title;

    const ok = await confirm({
      title: isRented ? "Return Rental Tape" : "Remove from Vault",
      message: isRented
        ? `Return the rental pass for "${itemDisplayName}" early? This tape will be removed from your active library.`
        : `Remove "${itemDisplayName}" from your personal vault? You will need to re-purchase or redeem a code to add it again.`,
      confirmLabel: isRented ? "Return Tape" : "Remove Tape",
      isDestructive: true,
    });

    if (!ok) return;

    const key = `${item.tmdbId}_${item.seasonNumber ?? 0}`;
    setDeletingKey(key);
    try {
      const success = await onRemoveItem?.(item.tmdbId, item.seasonNumber);
      if (success) {
        toast.success(
          isRented ? `Returned "${itemDisplayName}".` : `Removed "${itemDisplayName}" from vault.`,
          isRented ? "Tape Returned" : "Vault Updated"
        );
      } else {
        toast.error("Failed to remove item from vault.", "Action Failed");
      }
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/85 backdrop-blur-md animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-drawer-title"
    >
      {/* Click outside backdrop to close */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close library drawer"
      />

      <div className="relative z-10 flex h-full w-full max-w-full sm:max-w-xl flex-col border-0 sm:border-l border-neutral-800 bg-neutral-950 shadow-2xl animate-in slide-in-from-right">
        {/* Top Header - Unified Breadcrumb & Subtitle matching Cablecast Admin & Broadcast Studio */}
        <header className="border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Back to Cablecast</span>
              </button>
              <span className="text-neutral-700 leading-none select-none">/</span>
              <span
                id="library-drawer-title"
                className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate"
              >
                Library
              </span>
            </div>
          </div>

          {/* Subtitle Row matching Personal Broadcast Studio Header */}
          <div className="flex items-center justify-between gap-2 border-t border-neutral-900/60 pt-2.5 sm:border-t-0 sm:pt-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-amber-400 shadow">
                <Package className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
                Personal Vault
              </h1>
            </div>
          </div>
        </header>

        {/* Top Segmented Feature Switcher (3 Tabs: COLLECTION, OWNED, RENTED) */}
        <div className="border-b border-neutral-900 bg-black px-4 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800 gap-1 overflow-x-auto no-scrollbar">
            {/* 1. COLLECTION */}
            <button
              type="button"
              onClick={() => setActiveTab("COLLECTION")}
              className={`flex flex-1 justify-center items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "COLLECTION"
                  ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Package className={`h-3.5 w-3.5 shrink-0 ${activeTab === "COLLECTION" ? "text-blue-500" : "text-neutral-500"}`} />
              <span>Collection</span>
              {collection.length > 0 && (
                <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-300">
                  {collection.length}
                </span>
              )}
            </button>

            {/* 2. OWNED */}
            <button
              type="button"
              onClick={() => setActiveTab("OWNED")}
              className={`flex flex-1 justify-center items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "OWNED"
                  ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Key className={`h-3.5 w-3.5 shrink-0 ${activeTab === "OWNED" ? "text-emerald-400" : "text-neutral-500"}`} />
              <span>Owned</span>
              {owned.length > 0 && (
                <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-300">
                  {owned.length}
                </span>
              )}
            </button>

            {/* 3. RENTED */}
            <button
              type="button"
              onClick={() => setActiveTab("RENTED")}
              className={`flex flex-1 justify-center items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "RENTED"
                  ? "bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Clock className={`h-3.5 w-3.5 shrink-0 ${activeTab === "RENTED" ? "text-amber-400" : "text-neutral-500"}`} />
              <span>Rented</span>
              {rented.length > 0 && (
                <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold text-neutral-300">
                  {rented.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search & Actions Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-900 bg-neutral-950 px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder={getSearchPlaceholder()}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/90 py-2.5 pl-10 pr-8 text-xs text-neutral-100 placeholder-neutral-500 transition-colors hover:border-neutral-700 focus:border-neutral-500 focus:bg-black focus:outline-none shadow-inner font-sans"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content List Area */}
        <div className="no-scrollbar flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 flex flex-col">
          {filteredItems.length === 0 ? (
            <EmptyState tabKey={activeTab} hasQuery={Boolean(filterQuery)} onExplore={onClose} />
          ) : (
            <div key={activeTab} className="grid grid-cols-1 gap-3.5 animate-in fade-in duration-150">
              {filteredItems.map((item) => {
                const media = toMediaSearchResult(item);
                const isTv = item.mediaType === "tv";
                const posterUrl = item.posterPath
                  ? item.posterPath.startsWith("http")
                    ? item.posterPath
                    : `https://image.tmdb.org/t/p/w185${item.posterPath}`
                  : item.backdropUrl;

                const isRented = item.ownershipType === "RENTED";
                const isOwned = item.ownershipType === "OWNED";

                return (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-colors hover:border-neutral-700"
                  >
                    <div className="flex items-center gap-4">
                      {/* Clickable Info Area */}
                      <div
                        className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer group/info"
                        onClick={() => {
                          onClose();
                          onSelectMedia?.(media, item.seasonNumber || 1);
                        }}
                      >
                        {/* Poster Thumbnail */}
                        <div className="relative h-16 w-11 shrink-0 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 shadow transition-transform group-hover/info:scale-105">
                          {posterUrl ? (
                            <Image
                              src={posterUrl}
                              alt={item.title}
                              fill
                              sizes="44px"
                              className="object-cover object-center"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-neutral-600">
                              <Tv className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                          {/* 1. Media Type & Rental Remaining Time */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-neutral-200 border border-neutral-800">
                              {isTv ? "SHOW" : "MOVIE"}
                            </span>

                            {isRented && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-950/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300">
                                <Clock className="h-2.5 w-2.5 text-amber-400" />
                                {formatRemainingTime(item.expiresAt)}
                              </span>
                            )}

                            {isOwned && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-950/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                                <Key className="h-2.5 w-2.5" />
                                Owned
                              </span>
                            )}

                            {item.ownershipType === "SAVED" && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-pink-500/60 bg-pink-950/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-pink-300">
                                <Heart className="h-2.5 w-2.5 text-pink-400 fill-pink-400" />
                                Saved
                              </span>
                            )}
                          </div>

                          {/* 2. Movie or Series Name with Season */}
                          <h4 className="text-sm font-bold text-white truncate group-hover/info:text-amber-400 transition-colors">
                            <span>{item.title}</span>
                            {isTv && item.seasonNumber && item.seasonNumber > 0 && !/season\s*\d+/i.test(item.title) ? (
                              <span className="text-neutral-400 font-normal ml-1.5 text-xs">
                                (Season {item.seasonNumber})
                              </span>
                            ) : null}
                          </h4>

                          {/* 3. Year of Release & Rating */}
                          <div className="flex items-center gap-2 text-xs text-neutral-400 flex-wrap">
                            <span>{item.releaseYear ?? "—"}</span>
                            {item.voteAverage ? (
                              <>
                                <span className="text-neutral-600">•</span>
                                <span className="flex items-center gap-1 font-medium text-amber-400">
                                  <Star className="h-3 w-3 fill-amber-400" />
                                  {item.voteAverage.toFixed(1)} Rating
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Primary CTA: Add to Broadcast & Trash Action */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isScheduled?.(item.tmdbId, item.seasonNumber || 1) ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenBroadcastStudio?.();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/60 bg-purple-900/80 hover:bg-purple-800/90 p-2 sm:px-3 sm:py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:border-purple-300 cursor-pointer active:scale-95"
                            title="View on Personal Broadcast Lineup"
                            aria-label="Scheduled on Personal Broadcast Lineup"
                          >
                            <CalendarCheck2 className="h-3.5 w-3.5 text-purple-300" />
                            <span className="hidden sm:inline">Scheduled</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAddToBroadcast?.(media, item.seasonNumber || 1)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/50 bg-purple-950/40 hover:bg-purple-900/60 p-2 sm:px-3 sm:py-1.5 text-xs font-bold uppercase tracking-wider text-purple-200 shadow-sm transition-all hover:border-purple-400 hover:text-white cursor-pointer active:scale-95"
                            title="Add to Personal Broadcast Lineup"
                            aria-label="Add to Personal Broadcast Lineup"
                          >
                            <Radio className="h-3.5 w-3.5 text-purple-400" />
                            <span className="hidden sm:inline">Add to Broadcast</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={deletingKey === `${item.tmdbId}_${item.seasonNumber ?? 0}`}
                          onClick={() => handleDeleteItem(item)}
                          className="flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/80 p-2 text-neutral-400 transition-colors hover:border-red-800/60 hover:bg-red-950/30 hover:text-red-400 disabled:opacity-50 cursor-pointer active:scale-95"
                          title={
                            item.ownershipType === "RENTED"
                              ? `Return Rental Early${isTv && item.seasonNumber ? ` (Season ${item.seasonNumber})` : ""}`
                              : `Remove from Vault${isTv && item.seasonNumber ? ` (Season ${item.seasonNumber})` : ""}`
                          }
                          aria-label={item.ownershipType === "RENTED" ? "Return rental" : "Remove tape"}
                        >
                          {deletingKey === `${item.tmdbId}_${item.seasonNumber ?? 0}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state fallbacks with tailored messaging and icons for each category.
 */
function EmptyState({
  tabKey,
  hasQuery,
  onExplore,
}: {
  tabKey: LibraryTabKey;
  hasQuery: boolean;
  onExplore: () => void;
}) {
  if (hasQuery) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-600">
        <Search className="h-8 w-8 mx-auto mb-2 text-neutral-700" />
        <p className="text-sm font-semibold text-neutral-400">No matching titles found</p>
        <p className="mt-1 text-xs text-neutral-600">
          Try searching for a different title or clear your search filter.
        </p>
      </div>
    );
  }

  switch (tabKey) {
    case "COLLECTION":
      return (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-600">
          <Package className="h-8 w-8 mx-auto mb-2 text-neutral-700" />
          <p className="text-sm font-semibold text-neutral-400">Your collection is empty</p>
          <p className="mt-1 text-xs text-neutral-600">
            Purchased and rented titles will appear here.
          </p>
          <button
            type="button"
            onClick={onExplore}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white cursor-pointer"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Explore Catalog</span>
          </button>
        </div>
      );

    case "OWNED":
      return (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-600">
          <Tag className="h-8 w-8 mx-auto mb-2 text-neutral-700" />
          <p className="text-sm font-semibold text-neutral-400">No owned titles yet</p>
          <p className="mt-1 text-xs text-neutral-600">
            Media you buy permanently will be stored here.
          </p>
          <button
            type="button"
            onClick={onExplore}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white cursor-pointer"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Explore Catalog</span>
          </button>
        </div>
      );

    case "RENTED":
      return (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-600">
          <Ticket className="h-8 w-8 mx-auto mb-2 text-neutral-700" />
          <p className="text-sm font-semibold text-neutral-400">No active rentals</p>
          <p className="mt-1 text-xs text-neutral-600">
            Rented titles will show up here along with their remaining rental window.
          </p>
          <button
            type="button"
            onClick={onExplore}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white cursor-pointer"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Browse VHS Tapes</span>
          </button>
        </div>
      );

    default:
      return null;
  }
}
