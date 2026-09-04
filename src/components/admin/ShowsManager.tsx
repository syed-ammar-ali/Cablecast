"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tv2,
  Zap,
  Trash2,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Hash,
  Layers,
  Calendar,
  Radio,
  ChevronDown,
  Check,
} from "lucide-react";
import { CHANNELS, getChannel, type Channel } from "@/config/channels";
import { useToast } from "@/components/ui/ToastProvider";
import { CABLECAST_ADMIN_MUTATION, notifyAdminMutation } from "@/lib/syncEvents";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface RegisteredShow {
  id: string;
  prefix: string;
  title: string;
  tmdbId: number;
  channelNumber: number;
  posterPath: string | null;
  totalSeasons: number;
  totalCodes: number;
  _count?: { episodeCodes: number };
  accessCodes?: { id: string; code: string; label: string | null }[];
}

interface SearchResult {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: string | null;
  mediaType: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function buildPosterUrl(path: string | null) {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w154${path}`;
}

/* ─── Custom Channel Selector Dropdown (matches Main UI Header Popover) ──── */

interface ChannelSelectorProps {
  selectedChannelNumber: number;
  onSelectChannel: (channelNumber: number) => void;
}

function ChannelSelector({ selectedChannelNumber, onSelectChannel }: ChannelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedChannel = useMemo(
    () => getChannel(selectedChannelNumber) ?? CHANNELS[0],
    [selectedChannelNumber],
  );

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
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button matching main app style */}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-neutral-800 bg-black/70 px-3.5 py-2.5 text-sm text-neutral-200 transition-all hover:border-neutral-700 hover:bg-neutral-900/80 focus:border-neutral-600 focus:outline-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: selectedChannel.accentColor,
              boxShadow: `0 0 8px ${selectedChannel.accentColor}80`,
            }}
          />
          <span className="font-semibold text-neutral-100 truncate">{selectedChannel.name}</span>
          <span className="hidden sm:inline-block rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 border border-neutral-800">
            {selectedChannel.genre}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-neutral-500 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Floating Popover matching AppHeader style */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 py-1.5 shadow-2xl shadow-black/90 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          {CHANNELS.map((channel: Channel) => {
            const isSelected = channel.number === selectedChannelNumber;
            return (
              <button
                key={channel.number}
                type="button"
                onClick={() => {
                  onSelectChannel(channel.number);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-neutral-900/90 text-white"
                    : "text-neutral-300 hover:bg-neutral-900/60 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: channel.accentColor,
                      boxShadow: isSelected ? `0 0 8px ${channel.accentColor}` : "none",
                    }}
                  />
                  <span className="font-medium text-neutral-200">{channel.name}</span>
                  <span className="rounded bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500 border border-neutral-800">
                    {channel.genre}
                  </span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-neutral-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export function ShowsManager() {
  const { toast, confirm } = useToast();
  const [shows, setShows] = useState<RegisteredShow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Registration form state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [prefix, setPrefix] = useState("");
  const [channelNumber, setChannelNumber] = useState(2);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerMsg, setRegisterMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Per-show generate state
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateResults, setGenerateResults] = useState<
    Record<string, { codesGenerated: number } | { error: string }>
  >({});

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadShows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shows");
      const text = await res.text();
      let data: { shows?: RegisteredShow[]; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server error (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error ?? `Failed to load shows (${res.status}).`);
      setShows(data.shows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShows();

    const handleMutation = () => {
      void loadShows();
    };

    window.addEventListener(CABLECAST_ADMIN_MUTATION, handleMutation);
    return () => {
      window.removeEventListener(CABLECAST_ADMIN_MUTATION, handleMutation);
    };
  }, [loadShows]);

  // Search TMDB as user types
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(searchQuery)}`);
        const text = await res.text();
        const data: { results?: SearchResult[] } = text ? JSON.parse(text) : {};
        setSearchResults((data.results ?? []).filter((r) => r.mediaType === "tv").slice(0, 6));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, [searchQuery]);

  // When a show is picked, suggest the first letter as prefix if empty
  const handleSelectShow = (r: SearchResult) => {
    setSelectedResult(r);
    setSearchQuery(r.title);
    setSearchResults([]);
    if (!prefix) {
      const cleanTitle = r.title.replace(/^The\s+/i, "");
      const suggested = cleanTitle.charAt(0).toUpperCase();
      if (/^[A-Z]$/.test(suggested)) {
        setPrefix(suggested);
      }
    }
  };

  async function handleRegister() {
    if (!selectedResult || !prefix) return;
    setIsRegistering(true);
    setRegisterMsg(null);
    try {
      const res = await fetch("/api/admin/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix: prefix.toUpperCase(),
          title: selectedResult.title,
          tmdbId: selectedResult.tmdbId,
          channelNumber,
          posterPath: selectedResult.posterPath,
        }),
      });
      const text = await res.text();
      let data: { show?: RegisteredShow; codesGenerated?: number; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error ?? "Registration failed.");
      const msgText = `"${selectedResult.title}" registered under ${selectedChannel?.name ?? `CH ${channelNumber}`} with ${data.codesGenerated ?? 0} episode codes synced & ready to dial!`;
      setRegisterMsg({
        type: "ok",
        text: msgText,
      });
      toast.success(msgText, "Show Registered");
      setSelectedResult(null);
      setPrefix("");
      setSearchQuery("");
      setSearchResults([]);
      void loadShows();
      notifyAdminMutation();
    } catch (e) {
      const errText = e instanceof Error ? e.message : "Error.";
      setRegisterMsg({ type: "err", text: errText });
      toast.error(errText, "Registration Failed");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleGenerate(show: RegisteredShow) {
    setGeneratingId(show.id);
    try {
      const res = await fetch(`/api/admin/shows/${show.id}/generate`, { method: "POST" });
      const text = await res.text();
      let data: { codesGenerated?: number; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server error (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      setGenerateResults((prev) => ({
        ...prev,
        [show.id]: { codesGenerated: data.codesGenerated ?? 0 },
      }));
      toast.success(`Synced ${data.codesGenerated ?? 0} episode codes for "${show.title}".`, "Codes Synced");
      void loadShows();
      notifyAdminMutation();
    } catch (e) {
      const errText = e instanceof Error ? e.message : "Error.";
      setGenerateResults((prev) => ({
        ...prev,
        [show.id]: { error: errText },
      }));
      toast.error(errText, "Sync Failed");
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleDelete(show: RegisteredShow) {
    const ok = await confirm({
      title: "Remove Show From Lineup",
      message: `Permanently delete "${show.title}" and all ${show.totalCodes} registered episode codes? This cannot be undone.`,
      confirmLabel: "Delete Show",
      isDestructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/shows/${show.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete show.", "Delete Failed");
        return;
      }
      toast.success(`Removed "${show.title}" and its episode codes.`, "Show Deleted");
      void loadShows();
      notifyAdminMutation();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete error", "Error");
    }
  }

  const selectedChannel = getChannel(channelNumber);

  /* ─── Render ─── */

  return (
    <div className="space-y-10">
      {/* ── Register New Show Section ── */}
      <section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-7 shadow-2xl">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-900 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200">
              <Tv2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Register TV Show
              </h3>
              <p className="text-xs text-neutral-500">
                Link a series to an EPG channel &amp; generate quick-dial episode codes
              </p>
            </div>
          </div>
        </div>

        {/* TMDB Search Input */}
        <div className="relative mb-5">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-400">
            1. Search TMDB Catalog
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedResult(null);
              }}
              placeholder="Search TV show (e.g. Friends, The Office, Modern Family)…"
              className="w-full rounded-xl border border-neutral-800 bg-black/60 py-2.5 pl-10 pr-4 text-sm text-neutral-100 placeholder-neutral-600 transition-colors hover:border-neutral-700 focus:border-neutral-500 focus:outline-none"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
            )}
          </div>
        </div>

        {/* Search Results Dropdown List */}
        {searchResults.length > 0 && !selectedResult && (
          <ul className="mb-5 divide-y divide-neutral-900 rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden shadow-2xl">
            {searchResults.map((r) => (
              <li key={r.tmdbId}>
                <button
                  type="button"
                  onClick={() => handleSelectShow(r)}
                  className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-neutral-900"
                >
                  {buildPosterUrl(r.posterPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={buildPosterUrl(r.posterPath)!}
                      alt=""
                      className="h-12 w-9 rounded-md object-cover shrink-0 border border-neutral-800"
                    />
                  ) : (
                    <div className="h-12 w-9 shrink-0 rounded-md bg-neutral-900 flex items-center justify-center text-neutral-600">
                      <Tv2 className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-100">{r.title}</p>
                    <p className="text-xs text-neutral-500">
                      First Aired: {r.releaseYear ?? "N/A"} · TMDB #{r.tmdbId}
                    </p>
                  </div>
                  <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
                    Select
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Selected Show Preview Card */}
        {selectedResult && (
          <div className="mb-5 flex items-center gap-3.5 rounded-xl border border-neutral-700 bg-neutral-900/60 p-3">
            {buildPosterUrl(selectedResult.posterPath) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={buildPosterUrl(selectedResult.posterPath)!}
                alt=""
                className="h-14 w-10 rounded-md object-cover shrink-0 border border-neutral-700 shadow"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{selectedResult.title}</p>
              <p className="mt-0.5 text-xs text-neutral-400">
                TMDB #{selectedResult.tmdbId} · Premiere: {selectedResult.releaseYear ?? "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedResult(null);
                setSearchQuery("");
              }}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              title="Change show"
            >
              ✕
            </button>
          </div>
        )}

        {/* Config Inputs: Prefix + Channel Selector (Using Main UI Dropdown Style) */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Show Prefix Input */}
          <div>
            <div className="mb-1.5 flex flex-col gap-0.5 md:flex-row md:items-center md:justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-neutral-500" />
                2. Show Prefix (1–4 Letters)
              </label>
              <span className="text-xs text-neutral-500">e.g. F for Friends</span>
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={4}
                value={prefix}
                onChange={(e) =>
                  setPrefix(
                    e.target.value
                      .replace(/[^a-zA-Z]/g, "")
                      .toUpperCase()
                      .slice(0, 4),
                  )
                }
                placeholder="F"
                className="w-full rounded-xl border border-neutral-800 bg-black/70 px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-widest text-neutral-100 placeholder-neutral-700 transition-colors hover:border-neutral-700 focus:border-neutral-500 focus:outline-none"
              />
              {prefix && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold text-neutral-300 border border-neutral-800">
                  {prefix}0101
                </span>
              )}
            </div>
          </div>

          {/* Channel Selector with Custom Main UI Dropdown Popover */}
          <div>
            <div className="mb-1.5 flex flex-col gap-0.5 md:flex-row md:items-center md:justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-neutral-500" />
                3. Cable Channel Lineup
              </label>
              <span className="text-xs text-neutral-500">TV Guide Slot</span>
            </div>
            <ChannelSelector
              selectedChannelNumber={channelNumber}
              onSelectChannel={setChannelNumber}
            />
          </div>
        </div>

        {/* Significance Explainer Box */}
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4 sm:p-3.5 text-[11px] sm:text-xs text-neutral-400">
          <HelpCircle className="h-4 w-4 shrink-0 text-neutral-400 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-neutral-200">How Channel Numbers Work:</strong> Shows are bound
            to a channel lineup slot (e.g.{" "}
            <span
              className="font-semibold"
              style={{ color: selectedChannel?.accentColor ?? "#facc15" }}
            >
              {selectedChannel?.name ?? `CH ${channelNumber}`}
            </span>
            ). Dialing an episode code (like{" "}
            <span className="font-mono font-bold text-neutral-200">{prefix || "F"}0101</span>) on the
            remote jumps the broadcast calendar to that episode’s original air date and focuses on
            this channel.
          </p>
        </div>

        {/* Status Feedback */}
        {registerMsg && (
          <div
            className={`mb-5 flex items-center gap-2.5 rounded-xl p-3 text-sm ${
              registerMsg.type === "ok"
                ? "border border-emerald-900/50 bg-emerald-950/30 text-emerald-400"
                : "border border-red-900/50 bg-red-950/30 text-red-400"
            }`}
          >
            {registerMsg.type === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{registerMsg.text}</span>
          </div>
        )}

        {/* Submit Register Button */}
        <button
          type="button"
          onClick={handleRegister}
          disabled={!selectedResult || !prefix || isRegistering}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 text-sm uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500 disabled:shadow-none"
        >
          {isRegistering ? (
            <Loader2 className="h-4 w-4 animate-spin text-black" />
          ) : (
            <>
              <Tv2 className="h-4 w-4" />
              Register Show &amp; Assign Code
            </>
          )}
        </button>
      </section>

      {/* ── Active Shows Directory List ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Layers className="h-4 w-4 text-neutral-400" />
              Active Show Lineup ({shows.length})
            </h3>
            <p className="text-xs text-neutral-500">
              Registered series available in the remote control dialer
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-neutral-600" />
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
            {error}
          </p>
        )}

        {!isLoading && !error && shows.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-neutral-600">
            <p className="text-sm">No shows registered yet.</p>
            <p className="mt-1 text-xs text-neutral-700">
              Search and register a show above to populate the lineup.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3.5">
          {shows.map((show) => {
            const genResult = generateResults[show.id];
            const isGen = generatingId === show.id;
            const channel = getChannel(show.channelNumber);

            return (
              <div
                key={show.id}
                className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-colors hover:border-neutral-700 sm:p-5"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {/* Poster Thumbnail */}
                  {buildPosterUrl(show.posterPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={buildPosterUrl(show.posterPath)!}
                      alt=""
                      className="h-16 w-11 shrink-0 rounded-lg object-cover border border-neutral-800 shadow"
                    />
                  ) : (
                    <div className="h-16 w-11 shrink-0 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-600">
                      <Tv2 className="h-5 w-5" />
                    </div>
                  )}

                  {/* Show Details */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="inline-flex items-center rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-neutral-200 border border-neutral-800">
                        {show.prefix}
                      </span>
                      <h4 className="text-sm font-bold text-white truncate">{show.title}</h4>

                      {/* Channel Badge with accent color dot */}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${channel?.accentColor ?? "#facc15"}15`,
                          color: channel?.accentColor ?? "#facc15",
                          border: `1px solid ${channel?.accentColor ?? "#facc15"}30`,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: channel?.accentColor ?? "#facc15" }}
                        />
                        {channel?.name ?? `CH ${show.channelNumber}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5 text-neutral-500" />
                        {show.totalSeasons} Seasons
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono font-medium text-neutral-300">
                        <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                        {show.totalCodes} Episode Codes
                      </span>
                      <span>•</span>
                      <span className="font-mono text-[11px] text-neutral-500">
                        Dial format: {show.prefix}0101 (S1E1)
                      </span>
                    </div>

                    {/* Assigned Access Codes Row */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-xs text-neutral-400">
                      <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
                        Allowed Users:
                      </span>
                      {show.accessCodes && show.accessCodes.length > 0 ? (
                        show.accessCodes.map((ac) => (
                          <span
                            key={ac.id}
                            className="inline-flex items-center gap-1 rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 border border-neutral-800"
                            title={ac.label ?? undefined}
                          >
                            {ac.code}
                            {ac.label && <span className="text-neutral-500 font-sans">({ac.label})</span>}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-neutral-500 italic">
                          All Full-Access Codes
                        </span>
                      )}
                    </div>

                    {genResult && (
                      <p
                        className={`text-xs font-medium pt-1 ${
                          "codesGenerated" in genResult ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {"codesGenerated" in genResult
                          ? `✓ Synced ${genResult.codesGenerated} episode air dates.`
                          : `✗ ${genResult.error}`}
                      </p>
                    )}
                  </div>

                  {/* Actions matching Admin buttons */}
                  <div className="flex sm:flex-col items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleGenerate(show)}
                      disabled={isGen || generatingId !== null}
                      title="Fetch all episode air dates and sync codes"
                      className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 disabled:opacity-40"
                    >
                      {isGen ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-yellow-400" />
                      )}
                      <span>{show.totalCodes > 0 ? "Re-sync" : "Sync"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(show)}
                      title="Delete show and all its codes"
                      className="flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:border-red-800/60 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
