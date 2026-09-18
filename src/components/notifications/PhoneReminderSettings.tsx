"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, MessageSquare, Check, Loader2, AlertCircle, Send, Sparkles } from "lucide-react";

interface PhoneSettings {
  phoneNumber: string;
  callEnabled: boolean;
  smsEnabled: boolean;
  telegramChatId: string | null;
  telegramEnabled: boolean;
  verifiedAt: string | null;
}

interface ApiState {
  configured: boolean;
  twilioReady: boolean;
  telegramReady: boolean;
  defaultTelegramChatId?: string;
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
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"call" | "sms" | "telegram" | "simulate" | null>(null);
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
        setTelegramChatId(data.settings.telegramChatId ?? data.defaultTelegramChatId ?? "");
        setTelegramEnabled(data.settings.telegramEnabled ?? true);
      } else if (data.defaultTelegramChatId) {
        setTelegramChatId(data.defaultTelegramChatId);
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
        body: JSON.stringify({
          phoneNumber: phone.trim(),
          callEnabled,
          smsEnabled,
          telegramChatId: telegramChatId.trim(),
          telegramEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg({ type: "err", text: data.error ?? "Failed to save." });
      } else {
        setSaveMsg({ type: "ok", text: "Settings saved successfully!" });
        await load();
      }
    } catch {
      setSaveMsg({ type: "err", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(action: "test-call" | "test-sms" | "test-telegram" | "simulate-10am") {
    setTesting(
      action === "test-call"
        ? "call"
        : action === "test-sms"
        ? "sms"
        : action === "simulate-10am"
        ? "simulate"
        : "telegram",
    );
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
            action === "simulate-10am"
              ? "⚡ 10:00 AM Broadcast card delivered to Telegram! Check your phone."
              : action === "test-telegram"
              ? "✈️ Telegram message delivered! Check your Telegram app."
              : action === "test-call"
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

  const phoneDirty = phone !== (apiState.settings?.phoneNumber ?? "");
  const telegramChatDirty = telegramChatId !== (apiState.settings?.telegramChatId ?? apiState.defaultTelegramChatId ?? "");
  const toggleDirty =
    callEnabled !== (apiState.settings?.callEnabled ?? true) ||
    smsEnabled !== (apiState.settings?.smsEnabled ?? true) ||
    telegramEnabled !== (apiState.settings?.telegramEnabled ?? true);
  const isDirty = phoneDirty || telegramChatDirty || toggleDirty;

  const hasTelegram = Boolean(telegramChatId.trim() || apiState.defaultTelegramChatId);
  const hasPhone = Boolean(apiState.settings?.phoneNumber && apiState.settings.phoneNumber.trim() !== "");

  return (
    <div className="space-y-6">
      {/* ── 1. Telegram Notifications (Free Forever) ── */}
      <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-b from-sky-950/30 to-neutral-900/60 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-950/50 text-sky-400 shadow-sm">
              <Send className="h-4 w-4 -rotate-12 translate-x-0.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Telegram Bot Reminders
                </span>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="h-2.5 w-2.5" /> Free Forever
                </span>
              </div>
              <span className="block text-[11px] text-neutral-400">
                Pushes instant alerts with movie/show posters 10 min before airtime
              </span>
            </div>
          </div>
          <Toggle
            id="prs-telegram-toggle"
            checked={telegramEnabled}
            onChange={(v) => {
              setTelegramEnabled(v);
              setSaveMsg(null);
            }}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="prs-telegram-chat" className="text-[11px] font-semibold text-neutral-300">
            Telegram Chat ID
          </label>
          <div className="flex gap-2">
            <input
              id="prs-telegram-chat"
              type="text"
              placeholder="e.g. 8703799442"
              value={telegramChatId}
              onChange={(e) => {
                setTelegramChatId(e.target.value);
                setSaveMsg(null);
              }}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-mono text-white placeholder-neutral-600 outline-none transition-colors focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30"
            />
            {hasTelegram && apiState.telegramReady && (
              <div className="flex gap-2">
                <button
                  type="button"
                  id="prs-test-telegram-btn"
                  disabled={!!testing || !telegramEnabled}
                  onClick={() => sendTest("test-telegram")}
                  className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-950/40 px-3.5 py-2 text-xs font-semibold text-sky-300 transition-all hover:bg-sky-900/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {testing === "telegram" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {testing === "telegram" ? "Sending…" : "Test Ping"}
                </button>
                <button
                  type="button"
                  id="prs-simulate-10am-btn"
                  disabled={!!testing || !telegramEnabled}
                  onClick={() => sendTest("simulate-10am")}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-amber-600/20 px-3.5 py-2 text-xs font-bold text-amber-200 transition-all hover:border-amber-400 hover:from-amber-500/30 hover:to-amber-600/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer shadow-sm"
                  title="Simulate a real 10:00 AM broadcast alert sent directly to your Telegram phone"
                >
                  {testing === "simulate" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  {testing === "simulate" ? "Simulating…" : "⚡ Simulate 10:00 AM Alert"}
                </button>
              </div>
            )}
          </div>
          <p className="text-[10.5px] text-neutral-400">
            Connected to your bot <span className="font-mono text-sky-300">@CableCast_69bot</span>. Click <span className="text-amber-300 font-semibold">&quot;Simulate 10:00 AM Alert&quot;</span> to see how an upcoming show notification arrives on your phone with cover art &amp; live buttons!
          </p>
        </div>
      </div>

      {/* ── 2. Twilio Phone Calls & SMS (Optional) ── */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">
              Phone Call &amp; SMS Reminders
            </span>
            <span className="block text-[11px] text-neutral-500">
              Robotic voice call &amp; SMS text (via Twilio)
            </span>
          </div>
          {!apiState.twilioReady && (
            <span className="text-[10px] text-neutral-500 font-mono bg-neutral-800/80 px-2 py-0.5 rounded">
              Twilio optional
            </span>
          )}
        </div>

        {apiState.twilioReady ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="prs-phone" className="text-[11px] font-semibold text-neutral-300">
                Mobile Number (E.164)
              </label>
              <input
                id="prs-phone"
                type="tel"
                placeholder="+923001234567"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setSaveMsg(null);
                }}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none transition-colors focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
              <label className="flex items-center justify-between gap-4 cursor-pointer" htmlFor="prs-call-toggle">
                <span className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-neutral-200">Voice Call (10 min before)</span>
                </span>
                <Toggle id="prs-call-toggle" checked={callEnabled} onChange={(v) => { setCallEnabled(v); setSaveMsg(null); }} />
              </label>
              <div className="border-t border-neutral-800/60" />
              <label className="flex items-center justify-between gap-4 cursor-pointer" htmlFor="prs-sms-toggle">
                <span className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-neutral-200">SMS Text (10 min, missed, expiring)</span>
                </span>
                <Toggle id="prs-sms-toggle" checked={smsEnabled} onChange={(v) => { setSmsEnabled(v); setSaveMsg(null); }} />
              </label>
            </div>

            {hasPhone && (
              <div className="flex gap-2">
                <button
                  type="button"
                  id="prs-test-call-btn"
                  disabled={!!testing || !callEnabled}
                  onClick={() => sendTest("test-call")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-950/40 disabled:opacity-40 cursor-pointer"
                >
                  {testing === "call" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}
                  Test Call
                </button>
                <button
                  type="button"
                  id="prs-test-sms-btn"
                  disabled={!!testing || !smsEnabled}
                  onClick={() => sendTest("test-sms")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-40 cursor-pointer"
                >
                  {testing === "sms" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                  Test SMS
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            Twilio is optional. Your Telegram reminders are fully active and free forever.
          </p>
        )}
      </div>

      {/* Save Button & Status */}
      <div className="flex items-center justify-between pt-1">
        <div>
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
          {testMsg && (
            <div
              className={`flex items-center gap-1.5 text-xs font-medium ${
                testMsg.type === "ok" ? "text-sky-400" : "text-red-400"
              }`}
            >
              {testMsg.type === "ok" ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {testMsg.text}
            </div>
          )}
        </div>

        <button
          type="button"
          id="prs-save-btn"
          disabled={saving || !isDirty}
          onClick={save}
          className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-xs font-bold text-neutral-200 transition-all hover:border-amber-500/50 hover:bg-amber-950/30 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer shadow-sm"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
