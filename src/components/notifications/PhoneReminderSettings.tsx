"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, MessageSquare, Check, Loader2, AlertCircle } from "lucide-react";

interface PhoneSettings {
  phoneNumber: string;
  callEnabled: boolean;
  smsEnabled: boolean;
  verifiedAt: string | null;
}

interface ApiState {
  configured: boolean;
  twilioReady: boolean;
  settings: PhoneSettings | null;
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
        checked ? "bg-amber-500" : "bg-neutral-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PhoneReminderSettings() {
  const [apiState, setApiState] = useState<ApiState | null>(null);
  const [phone, setPhone] = useState("");
  const [callEnabled, setCallEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"call" | "sms" | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user/phone-settings");
      const data: ApiState = await res.json();
      setApiState(data);
      if (data.settings) {
        setPhone(data.settings.phoneNumber ?? "");
        setCallEnabled(data.settings.callEnabled);
        setSmsEnabled(data.settings.smsEnabled);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/user/phone-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone.trim(), callEnabled, smsEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg({ type: "err", text: data.error ?? "Failed to save." });
      } else {
        setSaveMsg({ type: "ok", text: "Saved successfully" });
        await load();
      }
    } catch {
      setSaveMsg({ type: "err", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(action: "test-call" | "test-sms") {
    setTesting(action === "test-call" ? "call" : "sms");
    setTestMsg(null);
    try {
      const res = await fetch(`/api/user/phone-settings?action=${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestMsg({ type: "err", text: data.error ?? "Test failed." });
      } else {
        setTestMsg({
          type: "ok",
          text:
            action === "test-call"
              ? "📞 Incoming call on its way! Pick up in a few seconds."
              : "📩 SMS sent! Check your messages.",
        });
      }
    } catch {
      setTestMsg({ type: "err", text: "Network error." });
    } finally {
      setTesting(null);
    }
  }

  // Loading skeleton
  if (!apiState) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-1/2 rounded-lg bg-neutral-800" />
        <div className="h-10 rounded-xl bg-neutral-800" />
        <div className="h-4 w-3/4 rounded-lg bg-neutral-800" />
      </div>
    );
  }

  // Twilio not configured
  if (!apiState.twilioReady) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-300">Twilio Not Configured</p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Add these three environment variables to enable phone reminders:
          </p>
          <div className="mt-2 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 font-mono text-[11px] text-neutral-300 space-y-1">
            <div>TWILIO_ACCOUNT_SID=<span className="text-neutral-500">ACxxxxxxxx...</span></div>
            <div>TWILIO_AUTH_TOKEN=<span className="text-neutral-500">your_token</span></div>
            <div>TWILIO_FROM_NUMBER=<span className="text-neutral-500">+12015550123</span></div>
          </div>
        </div>
      </div>
    );
  }

  const isVerified = Boolean(apiState.settings?.verifiedAt);
  const phoneDirty = phone !== (apiState.settings?.phoneNumber ?? "");
  const toggleDirty =
    callEnabled !== (apiState.settings?.callEnabled ?? true) ||
    smsEnabled !== (apiState.settings?.smsEnabled ?? true);
  const isDirty = phoneDirty || toggleDirty;
  const hasPhone = Boolean(apiState.settings?.phoneNumber);

  return (
    <div className="space-y-5">
      {/* Phone number input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="prs-phone" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Your Phone Number
          </label>
          {isVerified && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <Check className="h-3 w-3" /> Verified
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            id="prs-phone"
            type="tel"
            placeholder="+923001234567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaveMsg(null);
            }}
            autoComplete="tel"
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
          />
          <button
            type="button"
            id="prs-save-btn"
            disabled={saving || !isDirty || !phone.trim()}
            onClick={save}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-xs font-semibold text-neutral-200 transition-all hover:border-amber-500/50 hover:bg-amber-950/30 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Use E.164 format with country code. E.g. <span className="font-mono text-neutral-400">+923001234567</span> for Pakistan, <span className="font-mono text-neutral-400">+12015551234</span> for USA.
        </p>
        {saveMsg && (
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              saveMsg.type === "ok" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {saveMsg.type === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {saveMsg.text}
          </div>
        )}
      </div>

      {/* Toggle row: Voice call */}
      <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
        <label className="flex items-center justify-between gap-4 cursor-pointer" htmlFor="prs-call-toggle">
          <span className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-950/30 text-amber-400">
              <Phone className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-white">Voice Call</span>
              <span className="block text-[11px] text-neutral-500">10 minutes before your show starts</span>
            </span>
          </span>
          <Toggle id="prs-call-toggle" checked={callEnabled} onChange={(v) => { setCallEnabled(v); setSaveMsg(null); }} />
        </label>

        <div className="border-t border-neutral-800/60" />

        <label className="flex items-center justify-between gap-4 cursor-pointer" htmlFor="prs-sms-toggle">
          <span className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-emerald-400">
              <MessageSquare className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-white">SMS Texts</span>
              <span className="block text-[11px] text-neutral-500">10 min reminder text, missed shows &amp; expiring rentals</span>
            </span>
          </span>
          <Toggle id="prs-sms-toggle" checked={smsEnabled} onChange={(v) => { setSmsEnabled(v); setSaveMsg(null); }} />
        </label>
      </div>

      {/* Test buttons — only show once a number is saved */}
      {hasPhone && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Test your setup</p>
          <div className="flex gap-2">
            <button
              id="prs-test-call-btn"
              type="button"
              disabled={!!testing || !callEnabled}
              onClick={() => sendTest("test-call")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {testing === "call" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
              {testing === "call" ? "Calling…" : "Test Call"}
            </button>
            <button
              id="prs-test-sms-btn"
              type="button"
              disabled={!!testing || !smsEnabled}
              onClick={() => sendTest("test-sms")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-3 py-2 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {testing === "sms" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
              {testing === "sms" ? "Sending…" : "Test SMS"}
            </button>
          </div>
          {testMsg && (
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                testMsg.type === "ok"
                  ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                  : "border-red-500/30 bg-red-950/20 text-red-300"
              }`}
            >
              {testMsg.type === "ok" ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {testMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
