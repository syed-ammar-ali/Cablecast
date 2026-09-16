"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

/** Formats a "YYYY-MM-DD" value as "DD-MM-YYYY" without going through Date (avoids TZ-shift off-by-one). */
function formatIsoDateDisplay(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

/** Parses a "YYYY-MM-DD" value into a local-midnight Date (avoids TZ-shift off-by-one from new Date(iso)). */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Formats a Date back to "YYYY-MM-DD" using its local components (not UTC, unlike toISOString). */
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
    const dmyDate = buildValidatedDate(Number(year), Number(p2), Number(p1));
    if (dmyDate) return dmyDate;
    const mdyDate = buildValidatedDate(Number(year), Number(p1), Number(p2));
    if (mdyDate) return mdyDate;
  }

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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function getCalendarDays(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const WEEKDAY_LABELS = [
  { short: "S", full: "Sunday" },
  { short: "M", full: "Monday" },
  { short: "T", full: "Tuesday" },
  { short: "W", full: "Wednesday" },
  { short: "T", full: "Thursday" },
  { short: "F", full: "Friday" },
  { short: "S", full: "Saturday" },
];

export function DatePicker({
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
    setInputValue(formatIsoDateDisplay(selectedDate));
    setViewDate(parseIsoDate(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  const days = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function togglePicker() {
    setIsOpen((open) => {
      const next = !open;
      if (next) {
        setViewDate(selected);
        setInputValue(formatIsoDateDisplay(selectedDate));
        setInputError(false);
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
              className={`w-full rounded-md border bg-black px-3 py-1.5 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 focus:outline-none ${
                inputError ? "border-red-500/70" : "border-neutral-700 focus:border-neutral-500"
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
            {WEEKDAY_LABELS.map((item, i) => (
              <span key={i} className="py-1" aria-label={item.full} title={item.full}>
                {item.short}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = day.getMonth() === viewDate.getMonth();
              const isSelected = isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const dayKey = formatIsoDate(day);
              return (
                <div key={dayKey} className="flex items-center justify-center py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDateChange(formatIsoDate(day));
                      setIsOpen(false);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors ${
                      isSelected
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
