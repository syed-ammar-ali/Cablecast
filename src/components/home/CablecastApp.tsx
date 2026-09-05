"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { MediaCard } from "@/components/search/MediaCard";
import { MobileSearchOverlay } from "@/components/search/MobileSearchOverlay";
import { AppHeader } from "@/components/home/AppHeader";
import { HeroBanner } from "@/components/home/HeroBanner";
import type { EpisodeSelection } from "@/components/media/MediaDetailsModal";
import { VhsShelf } from "@/components/vhs/VhsShelf";
import type { DirectBroadcast } from "@/components/player/PlayerModal";
import { TvGrid } from "@/components/schedule/TvGrid";
import { BottomNav } from "@/components/navigation/BottomNav";
import { useBroadcastSchedule } from "@/lib/useBroadcastSchedule";
import { useBroadcastResolver } from "@/lib/useBroadcastResolver";
import { useLibrary } from "@/lib/useLibrary";
import { usePersonalBroadcast } from "@/lib/usePersonalBroadcast";
import { formatLocalDate, isBroadcastLiveNow } from "@/lib/broadcastLive";
import { useToast } from "@/components/ui/ToastProvider";
import { notifyLibraryMutation, notifyBroadcastMutation } from "@/lib/syncEvents";
import type { MediaSearchResult } from "@/types/media";

// Dynamically imported heavy modals to minimize initial bundle size and boost Core Web Vitals
const PlayerModal = dynamic(
  () => import("@/components/player/PlayerModal").then((mod) => mod.PlayerModal),
  { ssr: false }
);
const VhsModal = dynamic(
  () => import("@/components/vhs/VhsModal").then((mod) => mod.VhsModal),
  { ssr: false }
);
const MediaDetailsModal = dynamic(
  () => import("@/components/media/MediaDetailsModal").then((mod) => mod.MediaDetailsModal),
  { ssr: false }
);
const LibraryDrawer = dynamic(
  () => import("@/components/library/LibraryDrawer").then((mod) => mod.LibraryDrawer),
  { ssr: false }
);
const PersonalBroadcastModal = dynamic(
  () => import("@/components/broadcast/PersonalBroadcastModal").then((mod) => mod.PersonalBroadcastModal),
  { ssr: false }
);
const ScheduleBroadcastModal = dynamic(
  () => import("@/components/broadcast/ScheduleBroadcastModal").then((mod) => mod.ScheduleBroadcastModal),
  { ssr: false }
);
const ChannelRemote = dynamic(
  () => import("@/components/remote/ChannelRemote").then((mod) => mod.ChannelRemote),
  { ssr: false }
);

const SEARCH_DEBOUNCE_MS = 400;
const CLOCK_TICK_MS = 20_000;

export type AppView = "home" | "explore" | "broadcast" | "library";

interface PlayerTarget {
  media: MediaSearchResult;
  initialSeason?: number;
  initialEpisode?: number;
  startOffsetSeconds?: number;
  startTime?: number | string | Date;
}

interface CablecastAppProps {
  initialView?: AppView;
}

export function CablecastApp({ initialView = "home" }: CablecastAppProps) {
  const { toast, confirm } = useToast();

  // World Guide's own controls — date/region drive the broadcast fetch.
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [selectedCountry, setSelectedCountry] = useState("US");
  const [now, setNow] = useState(() => new Date());

  // Library & Favourites state
  const library = useLibrary();
  const [isLibraryOpen, setIsLibraryOpen] = useState(initialView === "library");
  const [isAdmin, setIsAdmin] = useState(false);

  // Personalized Broadcast Schedule state
  const personalBroadcast = usePersonalBroadcast();
  const [isBroadcastStudioOpen, setIsBroadcastStudioOpen] = useState(initialView === "broadcast");
  const [broadcastInitialTab, setBroadcastInitialTab] = useState<"grid" | "lineup" | "missed" | undefined>(undefined);
  const [broadcastTargetMissedId, setBroadcastTargetMissedId] = useState<string | null>(null);
  const [schedulingTarget, setSchedulingTarget] = useState<{
    media: MediaSearchResult;
    season?: number;
  } | null>(null);

  // 3D VHS Modal state for search results inspection
  const [selectedMedia, setSelectedMedia] = useState<{
    id: string | number;
    type: "MOVIE" | "TV";
    title?: string;
    initialAction?: "RENT" | "BUY";
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Search / Explore states
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(initialView === "explore");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [playerTarget, setPlayerTarget] = useState<PlayerTarget | null>(null);
  const [directBroadcastTarget, setDirectBroadcastTarget] = useState<DirectBroadcast | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<MediaSearchResult | null>(null);

  const isScheduleEnabled = !isLibraryOpen && !isBroadcastStudioOpen;
  const { schedule, isLoading: isGuideLoading, error: guideError } = useBroadcastSchedule(
    selectedDate,
    selectedCountry,
    isScheduleEnabled,
  );

  const resolver = useBroadcastResolver({
    onSelectBroadcast: ({ media, season, episode, startOffsetSeconds, startTime }) =>
      setPlayerTarget({ media, initialSeason: season, initialEpisode: episode, startOffsetSeconds, startTime }),
    onSelectDirectBroadcast: setDirectBroadcastTarget,
  });

  // URL Navigation & View State Manager
  const navigateTo = useCallback(
    (view: AppView, push = true) => {
      const targetPath = `/${view}`;
      if (push && typeof window !== "undefined" && window.location.pathname !== targetPath) {
        window.history.pushState({ view }, "", targetPath);
      }

      if (view === "explore") {
        setIsMobileSearchOpen(true);
        setIsBroadcastStudioOpen(false);
        setIsLibraryOpen(false);
      } else if (view === "broadcast") {
        setIsBroadcastStudioOpen(true);
        setIsMobileSearchOpen(false);
        setIsLibraryOpen(false);
      } else if (view === "library") {
        setIsLibraryOpen(true);
        setIsBroadcastStudioOpen(false);
        setIsMobileSearchOpen(false);
      } else {
        // "home"
        setIsBroadcastStudioOpen(false);
        setIsLibraryOpen(false);
        setIsMobileSearchOpen(false);
        setQuery("");
        setDebouncedQuery("");
        setResults([]);
        setSearchError(null);
        setIsSearchLoading(false);
      }
    },
    [],
  );

  // Synchronize Browser Back / Forward buttons & URL state
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\//, "") || "home";
      if (path === "explore" || path === "broadcast" || path === "library" || path === "home") {
        navigateTo(path as AppView, false);
      } else {
        navigateTo("home", false);
      }
    };

    if (window.location.pathname === "/" || window.location.pathname === "") {
      window.history.replaceState({ view: "home" }, "", "/home");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigateTo]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Deep link listener for notification clicks and query params
  useEffect(() => {
    if (typeof window === "undefined") return;

    const parseDeepLinks = () => {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get("tab");
      const itemParam = url.searchParams.get("item") || url.searchParams.get("missedId");
      const focusParam = url.searchParams.get("focus");

      if (url.pathname.includes("broadcast") || tabParam === "missed") {
        setIsBroadcastStudioOpen(true);
        if (tabParam === "missed" || tabParam === "lineup" || tabParam === "grid") {
          setBroadcastInitialTab(tabParam as "grid" | "lineup" | "missed");
        }
        if (itemParam) {
          setBroadcastTargetMissedId(itemParam);
        }
      } else if (url.pathname.includes("library") || tabParam === "rented") {
        setIsLibraryOpen(true);
      }

      if (focusParam === "schedule" || window.location.hash === "#schedule") {
        setTimeout(() => {
          const el = document.getElementById("broadcast-schedule-grid");
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
          }
        }, 150);
      }
    };

    parseDeepLinks();
  }, []);

  const liveNow = useMemo(
    () => schedule.find((item) => isBroadcastLiveNow(item, now)) ?? null,
    [schedule, now],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      setDebouncedQuery(trimmed);
      if (trimmed && typeof window !== "undefined" && window.location.pathname === "/home") {
        window.history.pushState({ view: "explore" }, "", "/explore");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchLoading(true);
    setSearchError(null);

    fetch(`/api/tmdb/search?query=${encodeURIComponent(debouncedQuery)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed.");
        return data;
      })
      .then((data: { results: MediaSearchResult[] }) => {
        setResults(data.results);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setSearchError(err.message);
          setResults([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearchLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery]);

  const handleSearchCardClick = (media: MediaSearchResult) => {
    setIsLibraryOpen(false);
    setIsBroadcastStudioOpen(false);
    setIsMobileSearchOpen(false);
    setDetailsTarget(null);
    setSchedulingTarget(null);
    setSelectedMedia({
      id: media.tmdbId,
      type: media.mediaType.toUpperCase() as "MOVIE" | "TV",
      title: media.title,
    });
    setIsModalOpen(true);
  };

  const handleHeroRent = useCallback((media: MediaSearchResult) => {
    setIsLibraryOpen(false);
    setIsBroadcastStudioOpen(false);
    setIsMobileSearchOpen(false);
    setDetailsTarget(null);
    setSchedulingTarget(null);
    setSelectedMedia({
      id: media.tmdbId,
      type: media.mediaType.toUpperCase() as "MOVIE" | "TV",
      title: media.title,
      initialAction: "RENT",
    });
    setIsModalOpen(true);
  }, []);

  const handleHeroBuy = useCallback(
    async (media: MediaSearchResult) => {
      setIsLibraryOpen(false);
      setIsBroadcastStudioOpen(false);
      setIsMobileSearchOpen(false);
      setDetailsTarget(null);
      setSchedulingTarget(null);
      // If already owned, open VHS sleeve to view owned tape
      if (library.owned.some((item) => item.tmdbId === media.tmdbId)) {
        setSelectedMedia({
          id: media.tmdbId,
          type: media.mediaType.toUpperCase() as "MOVIE" | "TV",
          title: media.title,
        });
        setIsModalOpen(true);
        return;
      }

      const confirmed = await confirm({
        title: "Purchase VHS Tape",
        message: `Add "${media.title}" permanently to your VHS collection?`,
        confirmLabel: "Buy Tape",
        cancelLabel: "Cancel",
      });

      if (!confirmed) return;

      try {
        const res = await fetch("/api/vhs/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "BUY",
            mediaId: media.tmdbId,
            mediaType: media.mediaType,
            seasonNumber: 0,
            meta: {
              title: media.title,
              posterPath: media.posterPath || null,
              backdropUrl: media.backdropUrl || null,
              overview: media.overview || null,
              releaseYear: media.releaseYear || null,
              voteAverage: media.voteAverage || null,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to purchase tape.");

        notifyLibraryMutation();
        notifyBroadcastMutation();
        toast.success("Added permanently to your personal VHS collection!", "Collection Updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Purchase error", "Action Failed");
      }
    },
    [confirm, library.owned, toast],
  );

  const handleHomeClick = useCallback(() => {
    setSelectedDate(formatLocalDate(new Date()));
    setSelectedMedia(null);
    setIsModalOpen(false);
    setDetailsTarget(null);
    setSchedulingTarget(null);
    navigateTo("home");
  }, [navigateTo]);

  const isSearching = Boolean(debouncedQuery);

  return (
    <main className="min-h-screen bg-black pb-0">
      {/* Top Header */}
      <div className="sticky top-0 md:relative md:top-auto z-50 bg-black">
        <AppHeader
          searchQuery={query}
          onSearchQueryChange={setQuery}
          isSearchLoading={isSearchLoading}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedCountry={selectedCountry}
          onCountryChange={setSelectedCountry}
          now={now}
          onOpenLibrary={() => navigateTo("library")}
          onOpenBroadcastStudio={() => navigateTo("broadcast")}
          missedBroadcastCount={personalBroadcast.missed.length}
          isMobileSearchOpen={isMobileSearchOpen}
          onCloseMobileSearch={() => navigateTo("home")}
          onHomeClick={handleHomeClick}
          onAuthLoaded={(role) => setIsAdmin(role === "admin")}
        />
      </div>

      {isSearching ? (
        <div key="search-view" className="hidden md:block px-3 py-4 sm:px-4 pb-24 sm:pb-8 animate-in fade-in duration-150">
          <section className="min-h-[60vh]">
            {searchError && (
              <p className="mx-auto max-w-md rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-center text-sm text-red-300">
                {searchError}
              </p>
            )}

            {!searchError && !isSearchLoading && results.length === 0 && (
              <p className="text-center text-sm uppercase tracking-widest text-neutral-600">
                No results for &ldquo;{debouncedQuery}&rdquo;.
              </p>
            )}

            {results.length > 0 && (
              <VhsShelf
                results={results}
                onSelect={handleSearchCardClick}
                query={debouncedQuery}
              />
            )}
          </section>
        </div>
      ) : (
        <div key="home-view" className="animate-in fade-in duration-150">
          <div className="sticky top-14 sm:top-16 md:top-0 z-10 px-3 pt-2 sm:px-4 sm:pt-3">
            <HeroBanner
              liveNow={liveNow}
              onSelectLive={(item) => resolver.resolveBroadcast(item, now)}
              isLiveResolving={liveNow != null && resolver.resolvingId === liveNow.id}
              onRent={handleHeroRent}
              onBuy={handleHeroBuy}
              isOwned={(tmdbId) => library.owned.some((item) => item.tmdbId === tmdbId)}
              isRented={(tmdbId) => library.rented.some((item) => item.tmdbId === tmdbId)}
              enabled={isScheduleEnabled}
            />
          </div>

          <div className="relative z-20 h-auto">
            <div className="pointer-events-none h-16 bg-gradient-to-b from-transparent to-black" />

            <div id="broadcast-schedule-grid" className="bg-black px-0 md:px-4 pb-0 pt-2 h-auto">
              <TvGrid
                schedule={schedule}
                isLoading={isGuideLoading}
                error={guideError}
                selectedDate={selectedDate}
                now={now}
                resolver={resolver}
                personalSchedule={personalBroadcast.schedule}
                channelName={personalBroadcast.channelName}
                onPlayPersonalBroadcast={({ media, season, episode, startOffsetSeconds }) =>
                  setPlayerTarget({
                    media,
                    initialSeason: season,
                    initialEpisode: episode,
                    startOffsetSeconds,
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Media Details Modal */}
      {detailsTarget && (
        <MediaDetailsModal
          media={detailsTarget}
          onClose={() => setDetailsTarget(null)}
          isFavorite={library.isFavorite(detailsTarget.tmdbId, detailsTarget.mediaType)}
          onToggleFavorite={library.toggleFavorite}
          isScheduled={personalBroadcast.isScheduled(detailsTarget.tmdbId)}
          onOpenScheduleBroadcast={(media, season) => {
            setDetailsTarget(null);
            setSchedulingTarget({ media, season });
          }}
          onOpenBroadcastStudio={() => {
            setDetailsTarget(null);
            navigateTo("broadcast");
          }}
          onPlay={(selection: EpisodeSelection) => {
            setPlayerTarget({
              media: detailsTarget,
              initialSeason: selection.season,
              initialEpisode: selection.episode,
              startOffsetSeconds: selection.startOffsetSeconds || 0,
            });
            setDetailsTarget(null);
          }}
        />
      )}

      {/* Full Library Drawer (Collection, Owned, Rented) */}
      <LibraryDrawer
        isOpen={isLibraryOpen}
        onClose={() => navigateTo("home")}
        collection={library.collection}
        owned={library.owned}
        rented={library.rented}
        onAddToBroadcast={(media, season) => {
          setIsLibraryOpen(false);
          setSchedulingTarget({ media, season });
        }}
        onRemoveItem={library.removeItem}
        isScheduled={(tmdbId, season) => personalBroadcast.isScheduled(tmdbId, season)}
        onOpenBroadcastStudio={() => {
          setIsLibraryOpen(false);
          navigateTo("broadcast");
        }}
        onSelectMedia={(media) => {
          setIsLibraryOpen(false);
          setSelectedMedia({
            id: media.tmdbId,
            type: media.mediaType.toUpperCase() as "MOVIE" | "TV",
            title: media.title,
          });
          setIsModalOpen(true);
        }}
      />

      {/* Personal Broadcast Studio Modal */}
      <PersonalBroadcastModal
        isOpen={isBroadcastStudioOpen}
        onClose={() => navigateTo("home")}
        schedule={personalBroadcast.schedule}
        missed={personalBroadcast.missed}
        seasonAlerts={personalBroadcast.seasonAlerts}
        channelName={personalBroadcast.channelName}
        initialTab={broadcastInitialTab}
        targetMissedId={broadcastTargetMissedId}
        onUpdateChannelName={personalBroadcast.updateChannelName}
        onDismissSeasonAlert={personalBroadcast.dismissSeasonAlert}
        onScheduleNextSeason={(media, nextSeason) => {
          setIsBroadcastStudioOpen(false);
          setSchedulingTarget({ media, season: nextSeason });
        }}
        liveNow={personalBroadcast.liveNow}
        onRemoveSchedule={personalBroadcast.removeSchedule}
        onRemoveShowSchedule={personalBroadcast.removeShowSchedule}
        onRescheduleMissed={personalBroadcast.rescheduleMissed}
        onDismissMissed={personalBroadcast.dismissMissed}
        onPlay={({ media, season, episode, startOffsetSeconds }) => {
          setPlayerTarget({
            media,
            initialSeason: season,
            initialEpisode: episode,
            startOffsetSeconds,
          });
          navigateTo("home");
        }}
      />

      {/* Quick Schedule Broadcast Popover Modal */}
      {schedulingTarget && (
        <ScheduleBroadcastModal
          isOpen={Boolean(schedulingTarget)}
          onClose={() => setSchedulingTarget(null)}
          media={schedulingTarget.media}
          initialSeason={schedulingTarget.season}
          existingSchedule={personalBroadcast.schedule}
          onSchedule={personalBroadcast.addSchedule}
        />
      )}

      {playerTarget && (
        <PlayerModal
          media={playerTarget.media}
          initialSeason={playerTarget.initialSeason}
          initialEpisode={playerTarget.initialEpisode}
          startOffsetSeconds={playerTarget.startOffsetSeconds}
          startTime={playerTarget.startTime}
          onClose={() => setPlayerTarget(null)}
        />
      )}

      {directBroadcastTarget && (
        <PlayerModal
          directBroadcast={directBroadcastTarget}
          onClose={() => setDirectBroadcastTarget(null)}
        />
      )}

      {/* Dedicated Full-Screen Mobile Search Overlay */}
      <MobileSearchOverlay
        isOpen={isMobileSearchOpen}
        query={query}
        onQueryChange={setQuery}
        debouncedQuery={debouncedQuery}
        results={results}
        isLoading={isSearchLoading}
        error={searchError}
        onClose={() => navigateTo("home")}
        onSelectMedia={(media) => {
          navigateTo("home");
          handleSearchCardClick(media);
        }}
        isFavorite={library.isFavorite}
        onToggleFavorite={library.toggleFavorite}
      />

      {/* 3D VHS Inspection Modal */}
      {selectedMedia && (
        <VhsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMedia(null);
          }}
          mediaId={selectedMedia.id}
          mediaType={selectedMedia.type}
          title={selectedMedia.title}
          initialAction={selectedMedia.initialAction}
        />
      )}

      {/* Floating channel remote */}
      {!playerTarget &&
        !directBroadcastTarget &&
        !detailsTarget &&
        !isModalOpen &&
        !isLibraryOpen &&
        !isBroadcastStudioOpen &&
        !isMobileSearchOpen &&
        !schedulingTarget && (
          <ChannelRemote
            onTuneIn={(media, startOffsetSeconds) =>
              setPlayerTarget({ media, startOffsetSeconds })
            }
            onNavigateDate={(iso) => {
              setSelectedDate(iso);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        isAdmin={isAdmin}
        onOpenBroadcastStudio={() => navigateTo("broadcast")}
        onOpenLibrary={() => navigateTo("library")}
        onToggleSearch={() => {
          if (isMobileSearchOpen) {
            navigateTo("home");
          } else {
            navigateTo("explore");
          }
        }}
        missedBroadcastCount={personalBroadcast.missed.length}
        isBroadcastStudioOpen={isBroadcastStudioOpen}
        isLibraryOpen={isLibraryOpen}
        isSearchActive={isMobileSearchOpen}
      />
    </main>
  );
}
