"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Loader2, Plus, RotateCcw, ShieldOff, Trash2, Tv, Settings2 } from "lucide-react";
import { ShowsManager } from "@/components/admin/ShowsManager";
import type { AdminAccessCode, AdminSession, AssignedShowSummary } from "@/types/admin";
import { getChannel } from "@/config/channels";
import { useToast } from "@/components/ui/ToastProvider";
import { CABLECAST_ADMIN_MUTATION, notifyAdminMutation } from "@/lib/syncEvents";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function truncate(text: string | null, max: number): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        active ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-400" : "border-neutral-700 bg-neutral-900 text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-sm p-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-white"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const { toast, confirm } = useToast();
  const [activeTab, setActiveTab] = useState<"shows" | "access">("shows");

  const [codes, setCodes] = useState<AdminAccessCode[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [availableShows, setAvailableShows] = useState<AssignedShowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMaxDevices, setNewMaxDevices] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [selectedShowIds, setSelectedShowIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);

  // Edit show assignment modal / popover state
  const [editingCode, setEditingCode] = useState<AdminAccessCode | null>(null);
  const [editShowIds, setEditShowIds] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isClearingRevoked, setIsClearingRevoked] = useState(false);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [codesRes, sessionsRes, showsRes] = await Promise.all([
        fetch("/api/admin/codes"),
        fetch("/api/admin/sessions"),
        fetch("/api/admin/shows"),
      ]);
      if (!codesRes.ok || !sessionsRes.ok) throw new Error("Failed to load admin data.");
      const codesData = (await codesRes.json()) as { codes: AdminAccessCode[] };
      const sessionsData = (await sessionsRes.json()) as { sessions: AdminSession[] };
      const showsData = showsRes.ok ? ((await showsRes.json()) as { shows: AssignedShowSummary[] }) : { shows: [] };

      setCodes(codesData.codes);
      setSessions(sessionsData.sessions);
      setAvailableShows(showsData.shows ?? []);
    } catch {
      setLoadError("Couldn't load access codes and sessions. Try refreshing.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    const handleMutation = () => {
      void loadData();
    };

    window.addEventListener(CABLECAST_ADMIN_MUTATION, handleMutation);
    return () => {
      window.removeEventListener(CABLECAST_ADMIN_MUTATION, handleMutation);
    };
  }, [loadData, activeTab]);

  async function handleCreateCode(event: React.FormEvent) {
    event.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim() || undefined,
          maxDevices: newMaxDevices ? Number(newMaxDevices) : undefined,
          expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : undefined,
          showIds: selectedShowIds.length > 0 ? selectedShowIds : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCreateError(data.error || "Couldn't create the code.");
        toast.error(data.error || "Couldn't create the code.", "Creation Failed");
        return;
      }
      setCodes((current) => [data.code, ...current]);
      setJustCreatedCode(data.code.code);
      setNewLabel("");
      setNewMaxDevices("");
      setNewExpiresAt("");
      setSelectedShowIds([]);
      setShowCreateForm(false);
      toast.success(`Access code ${data.code.code} generated successfully!`, "Code Created");
    } catch {
      setCreateError("Couldn't create the code.");
      toast.error("Couldn't create the code. Check server logs.", "Error");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveShowAssignments() {
    if (!editingCode) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/codes/${editingCode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showIds: editShowIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update assigned shows.");
      setCodes((current) => current.map((c) => (c.id === editingCode.id ? data.code : c)));
      setEditingCode(null);
      toast.success(`Show assignments updated for code ${editingCode.code}.`, "Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving assignments.", "Save Failed");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function toggleRevokeCode(code: AdminAccessCode) {
    setPendingIds((current) => new Set(current).add(code.id));
    try {
      const response = await fetch(`/api/admin/codes/${code.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: !code.revoked }),
      });
      if (response.ok) {
        const data = await response.json();
        setCodes((current) => current.map((c) => (c.id === code.id ? data.code : c)));
        if (!code.revoked) {
          toast.warning(`Access code ${code.code} has been revoked.`, "Revoked");
        } else {
          toast.success(`Access code ${code.code} has been reactivated.`, "Reactivated");
        }
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(code.id);
        return next;
      });
    }
  }

  async function deleteCode(code: AdminAccessCode) {
    const ok = await confirm({
      title: "Delete Access Code",
      message: `Permanently delete access code "${code.code}"? Any active sessions using this code will be disconnected.`,
      confirmLabel: "Delete Code",
      isDestructive: true,
    });
    if (!ok) return;

    setPendingIds((current) => new Set(current).add(code.id));
    try {
      const response = await fetch(`/api/admin/codes/${code.id}`, { method: "DELETE" });
      if (response.ok) {
        setCodes((current) => current.filter((c) => c.id !== code.id));
        toast.success(`Access code ${code.code} permanently deleted.`, "Deleted");
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(code.id);
        return next;
      });
    }
  }

  async function revokeSession(session: AdminSession) {
    if (session.role === "admin") {
      const ok = await confirm({
        title: "Disconnect Admin Session",
        message: "Disconnect this admin session? You will be signed out and need to log in again.",
        confirmLabel: "Disconnect",
        isDestructive: true,
      });
      if (!ok) return;
    }

    setPendingIds((current) => new Set(current).add(session.id));
    try {
      const response = await fetch(`/api/admin/sessions/${session.id}`, { method: "PATCH" });
      if (response.ok) {
        setSessions((current) =>
          current.map((s) => (s.id === session.id ? { ...s, isActive: false, revokedAt: new Date().toISOString() } : s)),
        );
        toast.warning("Session has been disconnected.", "Session Terminated");
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(session.id);
        return next;
      });
    }
  }

  async function deleteSession(session: AdminSession) {
    const ok = await confirm({
      title: "Delete Session Record",
      message: "Permanently delete this session record from history?",
      confirmLabel: "Delete",
      isDestructive: true,
    });
    if (!ok) return;

    setPendingIds((current) => new Set(current).add(session.id));
    try {
      const response = await fetch(`/api/admin/sessions/${session.id}`, { method: "DELETE" });
      if (response.ok) {
        setSessions((current) => current.filter((s) => s.id !== session.id));
        toast.success("Session record deleted.", "Purged");
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(session.id);
        return next;
      });
    }
  }

  async function clearRevokedSessions() {
    const ok = await confirm({
      title: "Clear Inactive Sessions",
      message: "Permanently purge all revoked, disconnected, and expired session records?",
      confirmLabel: "Clear All",
      isDestructive: true,
    });
    if (!ok) return;

    setIsClearingRevoked(true);
    try {
      const response = await fetch("/api/admin/sessions", { method: "DELETE" });
      if (response.ok) {
        const data = await response.json();
        setSessions((current) => current.filter((s) => s.isActive));
        toast.success(`Purged ${data.deletedCount ?? 0} inactive session records.`, "Cleaned Up");
      }
    } finally {
      setIsClearingRevoked(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/gate");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100">
      <header className="border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/home"
              className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Cablecast</span>
            </Link>
            <span className="text-neutral-700 leading-none select-none">/</span>
            <span className="text-[11px] sm:text-xs uppercase tracking-widest font-bold text-neutral-300 truncate">
              <span className="sm:hidden">Admin</span>
              <span className="hidden sm:inline">Admin Station Control</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-neutral-400 transition-colors hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-400 shrink-0"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Top Feature Tab Switcher: Stacked vertically on mobile, side-by-side on desktop */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
              Station Administration
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Manage TV show episode codes, broadcast channels, and viewer invite access.
            </p>
          </div>

          <div className="flex w-full md:w-auto items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab("shows")}
              className={`flex flex-1 md:flex-initial justify-center items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === "shows"
                  ? "bg-neutral-800 text-white shadow-md"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Tv className="h-4 w-4 text-cyan-400" />
              TV Codes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("access")}
              className={`flex flex-1 md:flex-initial justify-center items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === "access"
                  ? "bg-neutral-800 text-white shadow-md"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <ShieldOff className="h-4 w-4 text-emerald-400" />
              Access Codes
            </button>
          </div>
        </div>

        {/* Tab 1: Shows Manager */}
        {activeTab === "shows" && <ShowsManager />}

        {/* Tab 2: Access Codes */}
        {activeTab === "access" && (
          <div>
            {loadError && (
              <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
                {loadError}
              </div>
            )}

            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-neutral-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                {/* Access codes */}
                <section className="mb-12">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold uppercase tracking-wide text-white">Access Codes</h2>
                      <p className="text-xs text-neutral-500">
                        Generate invite codes and assign specific TV show lists to users.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm((open) => !open);
                        setCreateError(null);
                      }}
                      className="flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 sm:py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Generate Code
                    </button>
                  </div>

                  {justCreatedCode && (
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-emerald-700/50 bg-emerald-950/30 px-4 py-3">
                      <span className="text-sm text-emerald-200">
                        New code: <strong className="font-mono tracking-widest text-emerald-100">{justCreatedCode}</strong> — copy it now to hand out to the viewer.
                      </span>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <CopyButton value={justCreatedCode} />
                        <button
                          type="button"
                          onClick={() => setJustCreatedCode(null)}
                          className="text-xs text-emerald-400/70 hover:text-emerald-200"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {showCreateForm && (
                    <form
                      onSubmit={handleCreateCode}
                      className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
                        <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-1">
                          <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
                            Label / User Name (optional)
                          </label>
                          <input
                            type="text"
                            value={newLabel}
                            onChange={(event) => setNewLabel(event.target.value)}
                            placeholder="e.g. Syed (Retro Fan)"
                            className="rounded-lg border border-neutral-800 bg-black px-3 py-2 sm:py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1 w-full sm:w-auto">
                          <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
                            Max Devices (optional)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={newMaxDevices}
                            onChange={(event) => setNewMaxDevices(event.target.value)}
                            placeholder="Unlimited"
                            className="w-full sm:w-28 rounded-lg border border-neutral-800 bg-black px-3 py-2 sm:py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1 w-full sm:w-auto">
                          <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
                            Expires (optional)
                          </label>
                          <input
                            type="date"
                            value={newExpiresAt}
                            onChange={(event) => setNewExpiresAt(event.target.value)}
                            className="[color-scheme:dark] w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 sm:py-1.5 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isCreating}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                        >
                          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Access Code"}
                        </button>
                      </div>

                      {/* Show Assignment Selector in Form */}
                      {availableShows.length > 0 && (
                        <div className="border-t border-neutral-900 pt-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                              Assign Show Lineup to this Code:
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              {selectedShowIds.length === 0
                                ? "Full Lineup (All Shows Permitted)"
                                : `${selectedShowIds.length} of ${availableShows.length} Shows Selected`}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedShowIds([])}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                selectedShowIds.length === 0
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                                  : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-neutral-200"
                              }`}
                            >
                              ✓ All Shows (Full Access)
                            </button>

                            {availableShows.map((show) => {
                              const isChecked = selectedShowIds.includes(show.id);
                              const channel = getChannel(show.channelNumber);
                              return (
                                <button
                                  key={show.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedShowIds((prev) =>
                                      isChecked ? prev.filter((id) => id !== show.id) : [...prev, show.id],
                                    );
                                  }}
                                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                    isChecked
                                      ? "bg-cyan-950 text-cyan-200 border border-cyan-700"
                                      : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white"
                                  }`}
                                >
                                  <span className="font-mono text-[10px] text-cyan-400">[{show.prefix}]</span>
                                  <span>{show.title}</span>
                                  {channel && (
                                    <span
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{ backgroundColor: channel.accentColor }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {createError && <p className="text-xs text-red-400">{createError}</p>}
                    </form>
                  )}

                  {/* ── Mobile Card-Based View for Access Codes (< md) ── */}
                  <div className="space-y-3 md:hidden">
                    {codes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">
                        No access codes yet. Tap &ldquo;Generate Code&rdquo; above.
                      </div>
                    ) : (
                      codes.map((code) => {
                        const isPending = pendingIds.has(code.id);
                        const isExpired = Boolean(code.expiresAt && new Date(code.expiresAt) <= new Date());
                        const active = !code.revoked && !isExpired;
                        const assigned = code.assignedShows ?? [];

                        return (
                          <div
                            key={code.id}
                            className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3 shadow-lg"
                          >
                            {/* Top Row: Code + Status */}
                            <div className="flex items-center justify-between gap-2 border-b border-neutral-900 pb-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold tracking-widest text-white text-base">
                                  {code.code}
                                </span>
                                <CopyButton value={code.code} />
                              </div>
                              <StatusPill active={active} label={active ? "Active" : isExpired ? "Expired" : "Revoked"} />
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                                  Label
                                </span>
                                <span className="text-neutral-200 truncate block font-medium">
                                  {code.label || "—"}
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                                  Active Devices
                                </span>
                                <span className="text-neutral-300 font-mono">
                                  {code._count.sessions}{code.maxDevices ? ` / ${code.maxDevices}` : " (Unlimited)"}
                                </span>
                              </div>

                              <div className="col-span-2">
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                                  Expires
                                </span>
                                <span className="text-neutral-400 font-mono text-[11px] whitespace-nowrap">
                                  {formatDateTime(code.expiresAt)}
                                </span>
                              </div>

                              <div className="col-span-2 pt-1 border-t border-neutral-900">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                                    Assigned Shows
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCode(code);
                                      setEditShowIds(assigned.map((s) => s.id));
                                    }}
                                    className="flex items-center gap-1 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-white border border-neutral-800 transition-colors"
                                  >
                                    <Settings2 className="h-3 w-3" />
                                    Edit
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {assigned.length === 0 ? (
                                    <span className="rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-neutral-400 border border-neutral-800">
                                      All Shows (Full Lineup)
                                    </span>
                                  ) : (
                                    assigned.map((s) => (
                                      <span
                                        key={s.id}
                                        className="inline-flex items-center gap-1 rounded bg-cyan-950/80 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-800/50"
                                      >
                                        <span className="font-mono text-[9px] text-cyan-400">[{s.prefix}]</span>
                                        <span>{s.title}</span>
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
                              <button
                                type="button"
                                onClick={() => toggleRevokeCode(code)}
                                disabled={isPending}
                                className="flex-1 justify-center inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white disabled:opacity-50"
                              >
                                {isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : code.revoked ? (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                ) : (
                                  <ShieldOff className="h-3.5 w-3.5" />
                                )}
                                {code.revoked ? "Reactivate" : "Revoke"}
                              </button>

                              {code.revoked && (
                                <button
                                  type="button"
                                  onClick={() => deleteCode(code)}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-red-950/20 px-3 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:border-red-800/60 hover:text-red-400 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* ── Desktop Table View for Access Codes (>= md) ── */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Label</th>
                          <th className="px-4 py-3">Assigned Shows</th>
                          <th className="px-4 py-3 text-center">Active Devices</th>
                          <th className="px-4 py-3 text-center">Expires</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {codes.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-neutral-600">
                              No access codes yet. Click &ldquo;Generate Code&rdquo; above.
                            </td>
                          </tr>
                        ) : (
                          codes.map((code) => {
                            const isPending = pendingIds.has(code.id);
                            const isExpired = Boolean(code.expiresAt && new Date(code.expiresAt) <= new Date());
                            const active = !code.revoked && !isExpired;
                            const assigned = code.assignedShows ?? [];

                            return (
                              <tr key={code.id} className="border-t border-neutral-900 hover:bg-neutral-900/20">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="font-mono font-bold tracking-widest text-white">{code.code}</span>
                                    <CopyButton value={code.code} />
                                  </div>
                                </td>

                                <td className="truncate px-4 py-3 text-neutral-300" title={code.label ?? undefined}>
                                  {code.label ?? "—"}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {assigned.length === 0 ? (
                                      <span className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-400 border border-neutral-800">
                                        All Shows (Full Lineup)
                                      </span>
                                    ) : (
                                      assigned.map((s) => (
                                        <span
                                          key={s.id}
                                          className="inline-flex items-center gap-1 rounded bg-cyan-950/80 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-800/50"
                                        >
                                          <span className="font-mono text-[9px] text-cyan-400">[{s.prefix}]</span>
                                          <span>{s.title}</span>
                                        </span>
                                      ))
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCode(code);
                                        setEditShowIds(assigned.map((s) => s.id));
                                      }}
                                      className="rounded p-1 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                                      title="Edit show assignments"
                                    >
                                      <Settings2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>

                                <td className="px-4 py-3 tabular-nums text-neutral-300 font-mono text-xs text-center">
                                  {code._count.sessions}{code.maxDevices ? ` / ${code.maxDevices}` : " (Unlimited)"}
                                </td>

                                <td className="px-4 py-3 text-neutral-400 text-center">{formatDateTime(code.expiresAt)}</td>

                                <td className="px-4 py-3 text-center">
                                  <StatusPill active={active} label={active ? "Active" : isExpired ? "Expired" : "Revoked"} />
                                </td>

                                <td className="px-4 py-3 text-right">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleRevokeCode(code)}
                                      disabled={isPending}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white disabled:opacity-50"
                                    >
                                      {isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : code.revoked ? (
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      ) : (
                                        <ShieldOff className="h-3.5 w-3.5" />
                                      )}
                                      {code.revoked ? "Reactivate" : "Revoke"}
                                    </button>

                                    {code.revoked && (
                                      <button
                                        type="button"
                                        onClick={() => deleteCode(code)}
                                        disabled={isPending}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:border-red-800/60 hover:text-red-400 disabled:opacity-50"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Sessions */}
                <section>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold uppercase tracking-wide text-white">Active Sessions</h2>
                      <p className="text-xs text-neutral-500">Live browser sessions authenticated with access codes.</p>
                    </div>

                    <button
                      type="button"
                      onClick={clearRevokedSessions}
                      disabled={isClearingRevoked || !sessions.some((s) => !s.isActive)}
                      className="flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 sm:py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isClearingRevoked ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Clear Revoked Sessions
                    </button>
                  </div>

                  {/* ── Mobile Card-Based View for Sessions (< md) ── */}
                  <div className="space-y-3 md:hidden">
                    {sessions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">
                        No active viewer sessions.
                      </div>
                    ) : (
                      sessions.map((session) => {
                        const isPending = pendingIds.has(session.id);
                        return (
                          <div
                            key={session.id}
                            className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3 shadow-lg"
                          >
                            {/* Top Row: Role + Name + Status */}
                            <div className="flex items-center justify-between gap-2 border-b border-neutral-900 pb-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                    session.role === "admin"
                                      ? "bg-purple-950 text-purple-300 border border-purple-800"
                                      : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                                  }`}
                                >
                                  {session.role}
                                </span>
                                <span className="text-sm font-semibold text-white truncate">
                                  {session.displayName || "Anonymous Viewer"}
                                </span>
                              </div>
                              <StatusPill active={session.isActive} label={session.isActive ? "Active" : "Revoked"} />
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                                  Redeemed Code
                                </span>
                                <span className="font-mono font-bold text-neutral-300">
                                  {session.accessCode?.code ?? "—"}
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                                  Last Seen
                                </span>
                                <span className="text-neutral-400 font-mono text-[11px] whitespace-nowrap">
                                  {formatDateTime(session.lastSeenAt)}
                                </span>
                              </div>

                              <div className="col-span-2">
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                                  Device Info
                                </span>
                                <span
                                  className="text-neutral-200 text-xs truncate block font-medium"
                                  title={session.userAgent ?? undefined}
                                >
                                  {session.deviceLabel || truncate(session.userAgent, 40)}
                                </span>
                              </div>
                            </div>

                            {/* Bottom Actions */}
                            <div className="flex items-center justify-end pt-2 border-t border-neutral-900">
                              {session.isActive ? (
                                <button
                                  type="button"
                                  onClick={() => revokeSession(session)}
                                  disabled={isPending}
                                  className="w-full justify-center inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 text-xs font-semibold text-neutral-400 transition-colors hover:border-red-800/60 hover:text-red-400 disabled:opacity-50"
                                >
                                  {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <ShieldOff className="h-3.5 w-3.5" />
                                  )}
                                  Disconnect Session
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => deleteSession(session)}
                                  disabled={isPending}
                                  className="w-full justify-center inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 text-xs font-semibold text-neutral-500 transition-colors hover:border-red-800/60 hover:text-red-400 disabled:opacity-50"
                                >
                                  {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  Delete Session Record
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* ── Desktop Table View for Sessions (>= md) ── */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Name / Label</th>
                          <th className="px-4 py-3">Redeemed Code</th>
                          <th className="px-4 py-3">Last Seen</th>
                          <th className="px-4 py-3">Device</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-neutral-600">
                              No active viewer sessions.
                            </td>
                          </tr>
                        ) : (
                          sessions.map((session) => {
                            const isPending = pendingIds.has(session.id);
                            return (
                              <tr key={session.id} className="border-t border-neutral-900 hover:bg-neutral-900/20">
                                <td className="px-4 py-3">
                                  <span
                                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                      session.role === "admin"
                                        ? "bg-purple-950 text-purple-300 border border-purple-800"
                                        : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                                    }`}
                                  >
                                    {session.role}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-neutral-300">{session.displayName ?? "—"}</td>

                                <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                                  {session.accessCode?.code ?? "—"}
                                </td>

                                <td className="px-4 py-3 text-neutral-400">{formatDateTime(session.lastSeenAt)}</td>

                                <td className="truncate px-4 py-3 text-xs max-w-[200px]" title={session.userAgent ?? undefined}>
                                  <span className="text-neutral-200 font-medium block">
                                    {session.deviceLabel || "Unknown Device"}
                                  </span>
                                  <span className="text-neutral-500 text-[11px] block">
                                    {truncate(session.userAgent, 25)}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-center">
                                  <StatusPill active={session.isActive} label={session.isActive ? "Active" : "Revoked"} />
                                </td>

                                <td className="px-4 py-3 text-right">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    {session.isActive ? (
                                      <button
                                        type="button"
                                        onClick={() => revokeSession(session)}
                                        disabled={isPending}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:border-red-800/60 hover:text-red-400 disabled:opacity-50"
                                      >
                                        {isPending ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <ShieldOff className="h-3.5 w-3.5" />
                                        )}
                                        <span>Disconnect</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => deleteSession(session)}
                                        disabled={isPending}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:border-red-800/60 hover:text-red-400 disabled:opacity-50"
                                      >
                                        {isPending ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                        <span>Delete</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </main>

      {/* Edit Show Assignments Modal */}
      {editingCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-white">
                  Assign TV Shows for Code: <span className="font-mono text-emerald-400">{editingCode.code}</span>
                </h3>
                {editingCode.label && <p className="text-xs text-neutral-500">Label: {editingCode.label}</p>}
              </div>
              <button
                type="button"
                onClick={() => setEditingCode(null)}
                className="text-neutral-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-neutral-400">
                Select which registered TV shows this code user is permitted to browse and dial on the remote. If none are selected, all shows are accessible.
              </p>

              <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1 border border-neutral-900 rounded-xl bg-black/50">
                <button
                  type="button"
                  onClick={() => setEditShowIds([])}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    editShowIds.length === 0
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white"
                  }`}
                >
                  ✓ Full Lineup (All Shows)
                </button>

                {availableShows.map((show) => {
                  const isChecked = editShowIds.includes(show.id);
                  const channel = getChannel(show.channelNumber);
                  return (
                    <button
                      key={show.id}
                      type="button"
                      onClick={() => {
                        setEditShowIds((prev) =>
                          isChecked ? prev.filter((id) => id !== show.id) : [...prev, show.id],
                        );
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        isChecked
                          ? "bg-cyan-950 text-cyan-200 border border-cyan-700"
                          : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white"
                      }`}
                    >
                      <span className="font-mono text-[10px] text-cyan-400">[{show.prefix}]</span>
                      <span>{show.title}</span>
                      {channel && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: channel.accentColor }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-900">
              <button
                type="button"
                onClick={() => setEditingCode(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveShowAssignments}
                disabled={isSavingEdit}
                className="flex items-center gap-2 rounded-lg bg-white px-5 py-2 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
              >
                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Show Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
