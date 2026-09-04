"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Laptop, Loader2, Lock, Smartphone, User, KeyRound } from "lucide-react";

/** Uppercases as-typed and auto-inserts the "-" after 4 characters — mirrors the calendar's type-ahead formatting. */
function formatCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const first = cleaned.slice(0, 4);
  const second = cleaned.slice(4, 8);
  return [first, second].filter(Boolean).join("-");
}

interface ActiveSessionItem {
  id: string;
  deviceLabel: string;
  lastSeenAgo: string;
  isCurrentDevice?: boolean;
}

function GateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext !== "/" ? rawNext : "/home";
  const initialAdmin = searchParams.get("admin") === "1" || next === "/admin" || next.startsWith("/admin");

  const [mode, setMode] = useState<"viewer" | "admin">(initialAdmin ? "admin" : "viewer");
  const [step, setStep] = useState<"code" | "name" | "device_limit">("code");
  const [targetRedirect, setTargetRedirect] = useState<string>(next);

  // Viewer state
  const [code, setCode] = useState("");
  const [viewerName, setViewerName] = useState("");
  const [savedViewerName, setSavedViewerName] = useState("");

  // Device Limit Conflict State
  const [activeSessions, setActiveSessions] = useState<ActiveSessionItem[]>([]);
  const [deviceLimit, setDeviceLimit] = useState(2);
  const [selectedDisconnectId, setSelectedDisconnectId] = useState("");

  // Admin state
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [savedAdminName, setSavedAdminName] = useState("");

  const isRevoked = searchParams.get("error") === "revoked";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    isRevoked ? "Your access code or session was revoked by the station administrator." : null,
  );

  // Restore remembered names from device localStorage (strictly role-isolated)
  useEffect(() => {
    try {
      // Purge legacy shared key if it existed
      localStorage.removeItem("cablecast_user_name");
      localStorage.removeItem("cablecast_last_code");

      const storedViewer = localStorage.getItem("cablecast_viewer_name");
      const storedAdmin = localStorage.getItem("cablecast_admin_name");

      if (storedViewer) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSavedViewerName(storedViewer);
        setViewerName(storedViewer);
      }
      if (storedAdmin) {
        setSavedAdminName(storedAdmin);
        setAdminName(storedAdmin);
      }
    } catch {
      // non-critical if storage is disabled
    }
  }, []);

  async function handleRedeem(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          displayName: savedViewerName || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.error === "DEVICE_LIMIT_REACHED") {
        setActiveSessions(data.activeSessions || []);
        setDeviceLimit(data.limit || 2);
        setSelectedDisconnectId(data.activeSessions?.[0]?.id || "");
        setStep("device_limit");
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError(data.error || "That code isn't recognized.");
        setIsSubmitting(false);
        return;
      }

      // If the code has a server-assigned label or device remembered viewer name, bypass step 2
      if (data.hasName && data.displayName) {
        try {
          localStorage.setItem("cablecast_viewer_name", data.displayName);
        } catch {
          // ignore
        }
        router.push(next);
        router.refresh();
        return;
      }

      // Fallback: First time without a name — ask once
      setIsSubmitting(false);
      setTargetRedirect(next);
      setStep("name");
    } catch {
      setError("Something went wrong. Try again.");
      setIsSubmitting(false);
    }
  }

  async function handleDisconnectAndRedeem(sessionIdToDisconnect: string) {
    if (!sessionIdToDisconnect || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          displayName: savedViewerName || undefined,
          disconnectSessionId: sessionIdToDisconnect,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Failed to replace active session.");
        setIsSubmitting(false);
        return;
      }

      if (data.hasName && data.displayName) {
        try {
          localStorage.setItem("cablecast_viewer_name", data.displayName);
        } catch {}
        router.push(next);
        router.refresh();
        return;
      }

      setIsSubmitting(false);
      setTargetRedirect(next);
      setStep("name");
    } catch {
      setError("Something went wrong. Try again.");
      setIsSubmitting(false);
    }
  }

  async function handleAdminLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!adminPassword.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
          displayName: savedAdminName || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Incorrect admin password.");
        setIsSubmitting(false);
        return;
      }

      // If the device already has a saved admin name, route straight to main page (/)
      if (data.hasName && data.displayName) {
        try {
          localStorage.setItem("cablecast_admin_name", data.displayName);
        } catch {
          // ignore
        }
        router.push(targetRedirect || "/home");
        router.refresh();
        return;
      }

      // First time admin login without saved admin name: ask once, then route to main page (/home)
      setIsSubmitting(false);
      setTargetRedirect(targetRedirect || "/home");
      setStep("name");
    } catch {
      setError("Something went wrong. Try again.");
      setIsSubmitting(false);
    }
  }

  async function finish(nameToSave: string) {
    setIsSubmitting(true);
    const cleanName = nameToSave.trim().replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 30);
    try {
      if (cleanName) {
        await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: cleanName }),
        });
        if (mode === "admin") {
          localStorage.setItem("cablecast_admin_name", cleanName);
        } else {
          localStorage.setItem("cablecast_viewer_name", cleanName);
        }
      }
    } catch {
      // Cosmetic fallback
    }
    router.push(targetRedirect || "/home");
    router.refresh();
  }

  // ── 0. Device Limit Resolution Screen ──────────────────────────────────────────
  if (step === "device_limit") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-black px-4">
        <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950/80 p-6 sm:p-8 shadow-2xl shadow-black/80">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-yellow-400 shadow">
              <Laptop className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold uppercase tracking-wide text-white">Device Limit Reached</h1>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              This access code is active on all <span className="font-mono font-bold text-neutral-200">{deviceLimit}</span> available device slots. Select a device below to disconnect and tune in on this device.
            </p>
          </div>

          <div className="space-y-2.5 mb-6 max-h-60 overflow-y-auto no-scrollbar">
            {activeSessions.map((session) => {
              const isSelected = selectedDisconnectId === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedDisconnectId(session.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-yellow-500/70 bg-yellow-500/10 shadow-md ring-1 ring-yellow-500/40"
                      : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-900 text-neutral-400"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        isSelected
                          ? "border-yellow-500/50 bg-yellow-500/20 text-yellow-300"
                          : "border-neutral-800 bg-neutral-950 text-neutral-500"
                      }`}
                    >
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? "text-white" : "text-neutral-300"}`}>
                        {session.deviceLabel}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        Last active: {session.lastSeenAgo}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? "border-yellow-400 bg-yellow-400 text-black" : "border-neutral-700 bg-neutral-950"
                    }`}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p className="mb-4 text-center text-xs text-red-400">{error}</p>}

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={isSubmitting || !selectedDisconnectId}
              onClick={() => handleDisconnectAndRedeem(selectedDisconnectId)}
              className="flex items-center justify-center gap-2 rounded-lg bg-white py-3 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect Selected & Continue"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("code");
                setError(null);
              }}
              className="py-2 text-center text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Cancel & Use Different Code
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 1. One-time Name Setup Screen ──────────────────────────────────────────
  if (step === "name") {
    const isSettingAdmin = mode === "admin";
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-black px-4">
        <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950/60 p-8 shadow-2xl shadow-black/60">
          <div className="mb-8 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">
              {isSettingAdmin ? "Station Control" : "Cablecast"}
            </p>
            <h1 className="mt-3 text-2xl font-bold uppercase tracking-wide text-white">
              {isSettingAdmin ? "Admin Profile" : "You're In"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              {isSettingAdmin
                ? "What should we display as your Admin name on the station dashboard?"
                : "What should we call you? This only shows up in your own header — remembered on this device."}
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!isSubmitting) finish(isSettingAdmin ? adminName : viewerName);
            }}
            className="flex flex-col gap-3"
          >
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                autoFocus
                autoComplete="off"
                maxLength={30}
                value={isSettingAdmin ? adminName : viewerName}
                onChange={(event) => {
                  if (isSettingAdmin) setAdminName(event.target.value);
                  else setViewerName(event.target.value);
                }}
                placeholder={isSettingAdmin ? "Station Admin" : "Your name"}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 py-3 pl-10 pr-10 text-center text-base text-neutral-100 placeholder:text-neutral-700 focus:border-neutral-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 rounded-md border border-transparent bg-white py-3 text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-neutral-500"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-neutral-600">
            <button
              type="button"
              onClick={() => !isSubmitting && finish(isSettingAdmin ? "Station Admin" : "")}
              className="transition-colors hover:text-neutral-400"
            >
              Skip for now
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── 2. Station Admin Password Screen ───────────────────────────────────────
  if (mode === "admin") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-black px-4">
        <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950/60 p-8 shadow-2xl shadow-black/60">
          <div className="mb-8 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">Cablecast Control</p>
            <h1 className="mt-3 text-2xl font-bold uppercase tracking-wide text-white">Admin Sign-In</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Enter the station master password to access configuration, show codes, and sessions.
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="flex flex-col gap-3">
            {/* Honeypot Bot Trap (Invisible to humans, caught by automated scrapers) */}
            <input
              type="text"
              name="hp_auth"
              tabIndex={-1}
              autoComplete="off"
              className="absolute -left-[9999px] h-0 w-0 opacity-0 pointer-events-none -z-50"
              aria-hidden="true"
            />

            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={adminPassword}
                onChange={(event) => {
                  setAdminPassword(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="Station Password"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 py-3 pl-10 pr-10 text-center font-mono text-base text-neutral-100 placeholder:text-neutral-700 placeholder:font-sans focus:border-neutral-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !adminPassword.trim()}
              className="flex items-center justify-center gap-2 rounded-md border border-transparent bg-white py-3 text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-neutral-500"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
            </button>
          </form>

          {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

          <p className="mt-8 text-center text-xs text-neutral-600">
            <button
              type="button"
              onClick={() => {
                setMode("viewer");
                setError(null);
              }}
              className="group inline-flex items-center gap-1.5 transition-colors hover:text-neutral-400"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to viewer access code</span>
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── 3. Viewer Access Code Screen ───────────────────────────────────────────
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950/60 p-8 shadow-2xl shadow-black/60">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-neutral-500">Cablecast</p>
          <h1 className="mt-3 text-2xl font-bold uppercase tracking-wide text-white">Private Access</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            This is an invite-only preview. Enter the access code you were given to tune in.
          </p>
        </div>

        <form onSubmit={handleRedeem} className="flex flex-col gap-3">
          {/* Honeypot Bot Trap */}
          <input
            type="text"
            name="hp_auth"
            tabIndex={-1}
            autoComplete="off"
            className="absolute -left-[9999px] h-0 w-0 opacity-0 pointer-events-none -z-50"
            aria-hidden="true"
          />

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              inputMode="text"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              value={code}
              onChange={(event) => {
                setCode(formatCodeInput(event.target.value));
                if (error) setError(null);
              }}
              placeholder="XXXX-XXXX"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 py-3 pl-10 pr-10 text-center font-mono text-lg tracking-widest text-neutral-100 placeholder:text-neutral-700 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="flex items-center justify-center gap-2 rounded-md border border-transparent bg-white py-3 text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-neutral-500"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tune In"}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

        <p className="mt-8 text-center text-xs text-neutral-600">
          Need an invite? Reach out to the station admin.
        </p>

        <p className="mt-3 text-center text-xs text-neutral-700">
          <button
            type="button"
            onClick={() => {
              setMode("admin");
              setError(null);
            }}
            className="transition-colors hover:text-neutral-400"
          >
            Station admin sign-in →
          </button>
        </p>
      </div>
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
        </div>
      }
    >
      <GateForm />
    </Suspense>
  );
}
