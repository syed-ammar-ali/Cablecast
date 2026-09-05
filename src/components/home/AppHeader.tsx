"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Loader2,
  Radio,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { COUNTRY_OPTIONS } from "@/config/countries";

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
  missedBroadcastCount?: number;
  isMobileSearchOpen?: boolean;
  onCloseMobileSearch?: () => void;
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

/** Formats a "YYYY-MM-DD" value as "DD-MM-YYYY" without going through `Date` (avoids TZ-shift off-by-one). */
function formatIsoDateDisplay(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

/** Parses a "YYYY-MM-DD" value into a local-midnight `Date` (avoids TZ-shift off-by-one from `new Date(iso)`). */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Formats a `Date` back to "YYYY-MM-DD" using its local components (not UTC, unlike `toISOString`). */
function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * Parses free-typed date text so the calendar input doubles as a fast jump
 * field, not just a display. Accepts our own display format (DD-MM-YYYY),
 * plain ISO (YYYY-MM-DD), and the same two shapes with "/" separators —
 * covering both the format we show and the one most people type by habit.
 * Rejects out-of-range values (e.g. day 32, month 13) instead of letting
 * `Date` silently roll them over into the next month/year.
 */
function parseFlexibleDate(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildValidatedDate(Number(year), Number(month), Number(day));
  }

  // DMY: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, p1, p2, year] = dmyMatch;
    // Try DMY first
    const dmyDate = buildValidatedDate(Number(year), Number(p2), Number(p1));
    if (dmyDate) return dmyDate;
    // Fallback to MDY
    const mdyDate = buildValidatedDate(Number(year), Number(p1), Number(p2));
    if (mdyDate) return mdyDate;
  }

  // Raw 8 digits
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    if (digits.startsWith("19") || digits.startsWith("20")) {
      const year = Number(digits.slice(0, 4));
      const month = Number(digits.slice(4, 6));
      const day = Number(digits.slice(6, 8));
      const d = buildValidatedDate(year, month, day);
      if (d) return d;
    }
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));
    const d = buildValidatedDate(year, month, day);
    if (d) return d;
  }

  return null;
}

/**
 * Auto-inserts the "-" separators as digits are typed, so the field always
 * reads as DD-MM-YYYY without the user having to type them.
 */
function formatDateInputValue(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.startsWith("19") || digits.startsWith("20")) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    return [day, month, year].filter(Boolean).join("-");
  }
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join("-");
}

function buildValidatedDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // `Date` rolls invalid days (e.g. Feb 30) into the next month instead of
  // rejecting them — catch that by checking the components round-trip.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Full 6x7 calendar grid for the month `viewDate` falls in, padded with adjacent-month days. */
function getCalendarDays(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

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
  missedBroadcastCount,
  isMobileSearchOpen = false,
  onCloseMobileSearch,
  onAuthLoaded,
}: AppHeaderProps) {
  const isSearching = searchQuery.trim().length > 0;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { role: "admin" | "user" | null; displayName: string | null }) => {
        if (cancelled) return;
        setRole(data.role);
        onAuthLoaded?.(data.role);
        if (data.displayName) {
          setDisplayName(data.displayName);
        } else if (data.role) {
          setDisplayName(data.role === "admin" ? "Admin" : "Viewer");
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

  const handleHomeClick = () => {
    onSearchQueryChange("");
    onDateChange(formatIsoDate(now));
    onHomeClick?.();
  };

  return (
    <header className="border-b border-neutral-900 bg-black">
      {/* ── Mobile Viewport Header (< md): Left = Pure Name Text only, Right = Calendar Icon only ── */}
      <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3 md:hidden">
        {/* Left: User's Name — Pure text without any icon */}
        <button
          type="button"
          onClick={handleHomeClick}
          className="text-left cursor-pointer transition-colors active:scale-95"
          title="Home"
        >
          {isLoadingAuth ? (
            <span className="inline-block h-6 w-24 animate-pulse rounded bg-neutral-800" />
          ) : (
            <span className="text-xl font-bold tracking-tight text-white transition-colors hover:text-neutral-300">
              {displayName || (role === "admin" ? "Admin" : "Viewer")}
            </span>
          )}
        </button>

        {/* Right: Calendar Icon trigger only */}
        <div className="flex items-center">
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
          />
        </div>

        <div className="flex w-full max-w-md items-center gap-2 justify-self-center sm:w-[32rem]">
          {onOpenBroadcastStudio && (
            <button
              type="button"
              onClick={onOpenBroadcastStudio}
              title="Broadcast Studio (My Lineup & Reruns)"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-transparent text-neutral-300 transition-colors hover:border-purple-400/60 hover:text-purple-400"
            >
              <Radio className="h-4 w-4" />
              {missedBroadcastCount != null && missedBroadcastCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold text-white shadow animate-pulse">
                  {missedBroadcastCount}
                </span>
              )}
            </button>
          )}

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search movies & TV shows..."
              className="w-full rounded-full border border-neutral-700 bg-transparent py-2.5 pl-10 pr-4 text-base text-neutral-200 placeholder:text-neutral-500 transition-colors hover:border-sky-500/40 focus:border-sky-500/60 focus:outline-none"
            />
            {isSearchLoading && (
              <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-500" />
            )}
          </div>

          {onOpenLibrary && (
            <button
              type="button"
              onClick={onOpenLibrary}
              title="My Library (Favorites & History)"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-transparent text-neutral-300 transition-colors hover:border-yellow-400/50 hover:text-yellow-400"
            >
              <Bookmark className="h-4 w-4" />
            </button>
          )}
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
}: {
  onHomeClick?: () => void;
  displayName?: string | null;
  role?: "admin" | "user" | null;
  isLoading?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    try {
      localStorage.removeItem("cablecast_viewer_name");
      localStorage.removeItem("cablecast_admin_name");
    } catch {
      // ignore
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/gate");
    router.refresh();
  }

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
        {isLoading ? (
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
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="flex items-center justify-center rounded-full border border-neutral-800 p-1.5 text-neutral-500 transition-colors hover:border-red-500/50 hover:text-red-400"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CountryPicker({
  selectedCountry,
  onCountryChange,
}: {
  selectedCountry: string;
  onCountryChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = COUNTRY_OPTIONS.find((country) => country.code === selectedCountry);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="group flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-2 transition-colors hover:border-neutral-500"
        title={selected?.label ?? selectedCountry}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selected?.flag ?? `/flags/${selectedCountry.toLowerCase()}.png`}
          alt={selected?.label ?? selectedCountry}
          className="h-4 w-6 rounded-sm object-cover"
        />
        <ChevronDown className={`h-3.5 w-3.5 text-neutral-500 transition-transform group-hover:text-neutral-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 py-1 shadow-xl shadow-black/60">
          {COUNTRY_OPTIONS.map((country) => {
            const isSelected = country.code === selectedCountry;
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  onCountryChange(country.code);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${isSelected ? "text-white" : "text-neutral-300"
                  }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={country.flag}
                  alt={country.label}
                  className="h-4 w-6 rounded-sm object-cover"
                />
                <span className="flex-1">{country.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-neutral-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A custom-styled calendar popover for EPG Schedule / Date Selection.
 * On mobile, supports compact icon-only trigger with responsive popover sizing.
 */
function DatePicker({
  selectedDate,
  onDateChange,
  isMobileIconOnly = false,
}: {
  selectedDate: string;
  onDateChange: (value: string) => void;
  isMobileIconOnly?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = useMemo(() => parseIsoDate(selectedDate), [selectedDate]);
  const [viewDate, setViewDate] = useState(selected);
  const [inputValue, setInputValue] = useState(() => formatIsoDateDisplay(selectedDate));
  const [inputError, setInputError] = useState(false);
  const today = new Date();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(formatIsoDateDisplay(selectedDate));
    setViewDate(parseIsoDate(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const days = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function togglePicker() {
    setIsOpen((open) => {
      const next = !open;
      if (next) {
        setViewDate(selected);
        setInputValue(formatIsoDateDisplay(selectedDate));
        setInputError(false);
        // Focus after mount
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return next;
    });
  }

  function commitTypedDate() {
    const parsed = parseFlexibleDate(inputValue);
    if (!parsed || !isValidDate(parsed)) {
      setInputError(true);
      return;
    }
    setInputError(false);
    setViewDate(parsed);
    onDateChange(formatIsoDate(parsed));
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {isMobileIconOnly ? (
        <button
          type="button"
          onClick={togglePicker}
          className="group flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/80 text-neutral-200 transition-colors hover:border-indigo-400/60 hover:text-indigo-300 active:scale-95"
          title={`EPG Schedule Date (${formatIsoDateDisplay(selectedDate)})`}
          aria-label="Open Schedule Date Picker"
        >
          <CalendarDays className="h-4.5 w-4.5 text-neutral-300 transition-colors group-hover:text-indigo-400" />
        </button>
      ) : (
        <button
          type="button"
          onClick={togglePicker}
          className="group flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-base text-neutral-200 transition-colors hover:border-indigo-400/60 hover:text-indigo-300"
        >
          <CalendarDays className="h-5 w-5 text-neutral-500 transition-colors group-hover:text-indigo-400" />
          <span className="whitespace-nowrap tabular-nums">{formatIsoDateDisplay(selectedDate)}</span>
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-800 bg-neutral-950 p-3 shadow-2xl shadow-black/80">
          <div className="mb-3">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={inputValue}
              onChange={(event) => {
                setInputValue(formatDateInputValue(event.target.value));
                setInputError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTypedDate();
                }
              }}
              maxLength={10}
              onBlur={(event) => {
                if (containerRef.current?.contains(event.relatedTarget as Node)) return;
                commitTypedDate();
              }}
              placeholder="DD-MM-YYYY"
              className={`w-full rounded-md border bg-black px-3 py-1.5 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 focus:outline-none ${inputError ? "border-red-500/70" : "border-neutral-700 focus:border-neutral-500"
                }`}
            />
            {inputError && <p className="mt-1 text-[10px] text-red-400">Enter a valid date, e.g. 30-08-2026.</p>}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="rounded-sm p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-neutral-200">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="rounded-sm p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wide text-neutral-500">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} className="py-1">
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = day.getMonth() === viewDate.getMonth();
              const isSelected = isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              return (
                <div key={day.toISOString()} className="flex items-center justify-center py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDateChange(formatIsoDate(day));
                      setIsOpen(false);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors ${isSelected
                      ? "bg-white font-semibold text-black"
                      : isToday
                        ? "border border-neutral-500 text-neutral-100"
                        : inMonth
                          ? "text-neutral-200 hover:bg-white/10"
                          : "text-neutral-600 hover:bg-white/5"
                      }`}
                  >
                    {day.getDate()}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onDateChange(formatIsoDate(today));
              setIsOpen(false);
            }}
            className="mt-2 w-full rounded-md border border-neutral-800 py-1.5 text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
