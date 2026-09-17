"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Compass,
  LogOut,
  Loader2,
  Radio,
  Search,
  ShieldCheck,
  Tv,
  X,
} from "lucide-react";
const CountryPicker = dynamic(
  () => import("./CountryPicker").then((mod) => mod.CountryPicker),
  { ssr: false },
);
const DatePicker = dynamic(
  () => import("./DatePicker").then((mod) => mod.DatePicker),
  { ssr: false },
);

interface AppHeaderProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  isSearchLoading?: boolean;
  selectedDate: string;
  onDateChange: (value: string) => void;
  selectedCountry: string;
  onCountryChange: (value: string) => void;
  now: Date;
  onHomeClick?: () => void;
  onOpenLibrary?: () => void;
  onOpenBroadcastStudio?: () => void;
  onOpenExplore?: () => void;
  isExploreActive?: boolean;
  missedBroadcastCount?: number;
  onAuthLoaded?: (role: "admin" | "user" | null) => void;
}

/**
 * Explicit locale + `hour12` instead of the runtime default — Node (SSR)
 * and the browser (hydration) can resolve `undefined` to different formats
 * (e.g. 24h vs 12h) for the same `Date`, which trips React's hydration
 * mismatch check since the server- and client-rendered text differ.
 */
function formatHeaderTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Formats a Date to "YYYY-MM-DD" using local time components (not UTC). */
function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The app-wide top bar:
 * - On Mobile: Minimal clutter-free header with App Name/Logo on the left and Calendar Icon trigger on the right only.
 * - On Desktop: Full layout with identity slot, TMDB search bar, Broadcast/Library action triggers, Country picker, Date picker, and live clock.
 */
export function AppHeader({
  searchQuery,
  onSearchQueryChange,
  isSearchLoading,
  selectedDate,
  onDateChange,
  selectedCountry,
  onCountryChange,
  now,
  onHomeClick,
  onOpenLibrary,
  onOpenBroadcastStudio,
  onOpenExplore,
  isExploreActive,
  missedBroadcastCount,
  onAuthLoaded,
}: AppHeaderProps) {
  const isSearching = searchQuery.trim().length > 0;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const onAuthLoadedRef = useRef(onAuthLoaded);
  onAuthLoadedRef.current = onAuthLoaded;

  // Hydrate display name from localStorage on client only (after mount) so the
  // SSR and initial client renders match — avoids the React 19 hydration mismatch
  // that was crashing /library with the global error boundary.
  useEffect(() => {
    try {
      const cached =
        localStorage.getItem("cablecast_viewer_name") ||
        localStorage.getItem("cablecast_admin_name") ||
        null;
      if (cached) setDisplayName(cached);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { role: "admin" | "user" | null; displayName: string | null }) => {
        if (cancelled) return;
        setRole(data.role);
        onAuthLoadedRef.current?.(data.role);
        if (data.displayName) {
          setDisplayName(data.displayName);
          try {
            if (data.role === "admin") {
              localStorage.setItem("cablecast_admin_name", data.displayName);
            } else {
              localStorage.setItem("cablecast_viewer_name", data.displayName);
            }
          } catch {}
        } else if (data.role) {
          setDisplayName((prev) => prev || (data.role === "admin" ? "Admin" : "Viewer"));
        }
      })
      .catch(() => { })
      .finally(() => {
        if (!cancelled) setIsLoadingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    try {
      localStorage.removeItem("cablecast_viewer_name");
      localStorage.removeItem("cablecast_admin_name");
      localStorage.removeItem("cablecast_user_name");
      localStorage.removeItem("cablecast_last_code");
      sessionStorage.clear();
    } catch {
      // ignore
    }
    if (typeof document !== "undefined") {
      document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((el) => {
        try {
          el.pause();
          el.removeAttribute("src");
          el.load();
        } catch {}
      });
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/gate");
    router.refresh();
  }, [router]);

  const handleHomeClick = () => {
    onSearchQueryChange("");
    onDateChange(formatIsoDate(now));
    onCountryChange("US");
    onHomeClick?.();
  };

  return (
    <header className="border-b border-neutral-900 bg-black">
      {/* ── Mobile Viewport Header (< md): Left = Name + Admin Badge + Sign Out Icon, Right = Region & Calendar Icon ── */}
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 sm:px-6 sm:py-3 md:hidden">
        {/* Left: User's Name and Action Badge / Sign Out Icon */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleHomeClick}
            className="text-left cursor-pointer transition-colors active:scale-95 truncate max-w-[150px] sm:max-w-[200px]"
            title="Home"
          >
            {isLoadingAuth && !displayName ? (
              <span className="inline-block h-6 w-24 animate-pulse rounded bg-neutral-800" />
            ) : (
              <span className="text-lg sm:text-xl font-bold tracking-tight text-white transition-colors hover:text-neutral-300 truncate block">
                {displayName || (role === "admin" ? "Admin" : "Viewer")}
              </span>
            )}
          </button>

          {role === "admin" && (
            <Link
              href="/admin"
              className="flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-400 shrink-0"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              Admin
            </Link>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex items-center justify-center rounded-full border border-neutral-800 p-1.5 text-neutral-500 transition-colors hover:border-red-500/50 hover:text-red-400 cursor-pointer active:scale-95 shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: Region / Country Picker & Calendar Icon triggers */}
        <div className="flex items-center gap-2 shrink-0">
          <CountryPicker selectedCountry={selectedCountry} onCountryChange={onCountryChange} isMobile />
          <DatePicker selectedDate={selectedDate} onDateChange={onDateChange} isMobileIconOnly />
        </div>
      </div>

      {/* ── Desktop Viewport Header (>= md): Full Featured 3-Column Bar ── */}
      <div className="hidden h-20 grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 sm:gap-6 md:grid">
        <div className="flex items-center gap-3">
          <IdentityControls
            onHomeClick={handleHomeClick}
            displayName={displayName}
            role={role}
            isLoading={isLoadingAuth}
            onSignOut={handleSignOut}
          />
        </div>

        <div className="flex w-full max-w-2xl items-center gap-3 justify-self-center">
          {/* Desktop Navigation Links (Full parity with mobile BottomNav) */}
          <nav aria-label="Desktop Navigation" className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onSearchQueryChange("");
                onHomeClick?.();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                !isExploreActive && !searchQuery.trim()
                  ? "bg-neutral-800 text-white shadow ring-1 ring-neutral-700"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-900"
              }`}
              title="Home (Live TV & Guide)"
            >
              <Tv className="h-3.5 w-3.5 text-red-500" />
              <span>Home</span>
            </button>

            {onOpenBroadcastStudio && (
              <button
                type="button"
                onClick={onOpenBroadcastStudio}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-purple-300 hover:bg-purple-950/40 transition-all cursor-pointer"
                title="Broadcast Studio (My Lineup & Reruns)"
              >
                <Radio className="h-3.5 w-3.5 text-purple-400" />
                <span>Broadcast</span>
                {missedBroadcastCount != null && missedBroadcastCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold text-white shadow animate-pulse">
                    {missedBroadcastCount}
                  </span>
                )}
              </button>
            )}

            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-yellow-300 hover:bg-yellow-950/30 transition-all cursor-pointer"
                title="My Library (Personal Vault)"
              >
                <Bookmark className="h-3.5 w-3.5 text-yellow-400" />
                <span>Library</span>
              </button>
            )}
          </nav>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              (document.activeElement as HTMLElement)?.blur();
            }}
            className="relative flex-1"
          >
            {isExploreActive || searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => {
                  onSearchQueryChange("");
                  onHomeClick?.();
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-all cursor-pointer z-10"
                title="Back to Cablecast"
              >
                <ArrowLeft className="h-4 w-4 transition-transform hover:-translate-x-0.5" />
              </button>
            ) : (
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
            )}

            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onClick={onOpenExplore}
              onFocus={onOpenExplore}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search movies & TV shows..."
              className={`w-full rounded-full border bg-transparent py-2.5 pl-10 pr-9 text-base text-neutral-200 placeholder:text-neutral-500 transition-colors [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden ${
                isExploreActive
                  ? "border-sky-500/60 shadow-[0_0_15px_rgba(14,165,233,0.15)]"
                  : "border-neutral-700 hover:border-sky-500/40 focus:border-sky-500/60"
              } focus:outline-none`}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : isSearchLoading ? (
              <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-500" />
            ) : null}
          </form>
        </div>

        <div className="flex items-center justify-end gap-3 justify-self-end sm:gap-4">
          {!isSearching && (
            <>
              <CountryPicker selectedCountry={selectedCountry} onCountryChange={onCountryChange} />
              <DatePicker selectedDate={selectedDate} onDateChange={onDateChange} />
            </>
          )}
          {/* `now` ticks client-side after mount, so the very first server-
              rendered value legitimately differs by a few seconds — expected,
              not a real mismatch, hence `suppressHydrationWarning`. */}
          <span className="text-base tabular-nums text-neutral-300" suppressHydrationWarning>
            {formatHeaderTime(now)}
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * Fetches the current session's role + display name once on mount.
 * Renders the user name as a clean single text element on desktop.
 */
function IdentityControls({
  onHomeClick,
  displayName,
  role,
  isLoading,
  onSignOut,
}: {
  onHomeClick?: () => void;
  displayName?: string | null;
  role?: "admin" | "user" | null;
  isLoading?: boolean;
  onSignOut?: () => void;
}) {
  const name = displayName || (role === "admin" ? "Admin" : "Viewer");

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          onHomeClick?.();
        }}
        className="text-left cursor-pointer transition-colors active:scale-95"
        title="Home"
      >
        {isLoading && !displayName ? (
          <span className="inline-block h-7 w-28 animate-pulse rounded bg-neutral-800" />
        ) : (
          <span className="text-xl font-bold tracking-tight text-white transition-colors hover:text-neutral-300 sm:text-2xl">
            {name}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2">
        {role === "admin" && (
          <Link
            href="/admin"
            className="flex items-center gap-1 rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-400"
          >
            <ShieldCheck className="h-3 w-3" />
            Admin
          </Link>
        )}
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="flex items-center justify-center rounded-full border border-neutral-800 p-1.5 text-neutral-500 transition-colors hover:border-red-500/50 hover:text-red-400 cursor-pointer active:scale-95"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

