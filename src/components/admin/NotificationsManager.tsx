"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Shield,
  Smartphone,
  Users,
  XCircle,
} from "lucide-react";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useToast } from "@/components/ui/ToastProvider";

interface SubscriptionRecord {
  id: string;
  userId: string;
  role?: "admin" | "user";
  displayName?: string;
  code?: string | null;
  label?: string | null;
  timezone: string | null;
  timezoneOffset: number | null;
  createdAt: string;
  updatedAt: string;
}

interface NotificationLogRecord {
  id: string;
  userId: string;
  role?: "admin" | "user";
  displayName?: string;
  code?: string | null;
  type: string;
  referenceId: string;
  sentAt: string;
}

export function NotificationsManager() {
  const { toast } = useToast();
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading: isPushHookLoading,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications();

  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [recentLogs, setRecentLogs] = useState<NotificationLogRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Action loading states
  const [isTestingSelf, setIsTestingSelf] = useState(false);
  const [isTestingBroadcast, setIsTestingBroadcast] = useState(false);
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const fetchAdminData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) {
        throw new Error("Failed to load notifications admin data.");
      }
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
      setRecentLogs(data.recentLogs || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching data";
      setDataError(msg);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdminData();
  }, [fetchAdminData]);

  const handleTestSelf = async () => {
    setIsTestingSelf(true);
    setFeedback(null);
    try {
      const res = await sendTestNotification();
      if (res.success) {
        setFeedback({
          type: "success",
          message: "🔔 Test alert sent to this device! Check your notification center.",
        });
        toast.success("Test alert dispatched to this device.", "Push Sent");
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to deliver test alert.",
        });
        toast.error(res.error || "Failed to deliver test alert.", "Delivery Failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsTestingSelf(false);
      void fetchAdminData();
    }
  };

  const handleTestBroadcast = async () => {
    setIsTestingBroadcast(true);
    setFeedback(null);
    try {
      const res = await sendTestNotification({ broadcast: true });
      if (res.success) {
        setFeedback({
          type: "success",
          message: `📢 Broadcast sent: ${res.message || "Delivered to all active devices."}`,
        });
        toast.success("Broadcast alert delivered to all active subscribers.", "Broadcast Success");
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to broadcast alert.",
        });
        toast.error(res.error || "Failed to broadcast alert.", "Broadcast Error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsTestingBroadcast(false);
      void fetchAdminData();
    }
  };

  const handleRunCron = async () => {
    setIsRunningCron(true);
    setCronResult(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_cron" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCronResult(data.message);
        toast.success(data.message, "Cron Triggered");
      } else {
        setCronResult(`Error: ${data.error || "Failed to execute cron."}`);
        toast.error(data.error || "Cron execution failed.", "Cron Error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setCronResult(`Error: ${msg}`);
    } finally {
      setIsRunningCron(false);
      void fetchAdminData();
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
            feedback.type === "success"
              ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200"
              : "border-red-700/50 bg-red-950/30 text-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 uppercase tracking-wider"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Controls Grid: Admin Device Control & Broadcast Testing */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1: Admin Device Status & Testing */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6 backdrop-blur flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">
                    This Admin Device
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                    Control and test push notifications directly on this current browser.
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider shrink-0 whitespace-nowrap ${
                  isSubscribed
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-400"
                    : "border-neutral-800 bg-neutral-900 text-neutral-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isSubscribed ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"}`}
                />
                {isSubscribed ? "Subscribed" : "Not Active"}
              </span>
            </div>

            <div className="mt-4 mb-5 grid grid-cols-2 gap-3 rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3.5 text-xs">
              <div>
                <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-semibold">
                  Browser Support
                </span>
                <span className="mt-1.5 block font-semibold text-neutral-200">
                  {isSupported ? "Supported (Push API)" : "Unsupported Browser"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-semibold">
                  OS Permission
                </span>
                <span
                  className={`mt-1.5 block font-semibold capitalize ${
                    permission === "granted"
                      ? "text-emerald-400"
                      : permission === "denied"
                        ? "text-red-400"
                        : "text-amber-400"
                  }`}
                >
                  {permission}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isSubscribed ? (
              <>
                <button
                  type="button"
                  onClick={handleTestSelf}
                  disabled={isTestingSelf || isPushHookLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-300 transition-all hover:bg-amber-500/30 active:scale-98 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-950/30"
                >
                  {isTestingSelf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>{isTestingSelf ? "Delivering..." : "Send Test to My Device"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => unsubscribe()}
                  disabled={isPushHookLoading}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-xs font-semibold text-neutral-400 hover:border-red-900/60 hover:text-red-400 transition-colors cursor-pointer"
                  title="Disable alerts on this device"
                >
                  Disable
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => subscribe()}
                disabled={isPushHookLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black transition-all hover:bg-amber-400 active:scale-98 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isPushHookLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                ) : (
                  <Bell className="h-4 w-4 text-black" />
                )}
                <span>Enable Alerts on this Device</span>
              </button>
            )}
          </div>
        </div>

        {/* Card 2: Global Network Broadcast Testing */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6 backdrop-blur flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">
                    Network Subscribers
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                    Broadcast test notifications to all active viewer devices across the station.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs font-mono font-bold text-neutral-300 shrink-0 whitespace-nowrap">
                {subscriptions.length} Device{subscriptions.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-4 mb-5 rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3.5 text-xs text-neutral-400 leading-relaxed">
              <p>
                Testing broadcast will dispatch a live TV show preview push notification to every
                registered device currently in the database.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestBroadcast}
            disabled={isTestingBroadcast || subscriptions.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 active:scale-98 disabled:opacity-40 cursor-pointer"
          >
            {isTestingBroadcast ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>
              {isTestingBroadcast
                ? "Broadcasting Alert..."
                : `Dispatch Test to All ${subscriptions.length} Device(s)`}
            </span>
          </button>
        </div>
      </div>

      {/* Card 3: Automated Cron Dispatcher & Triggers */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6 backdrop-blur">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">
                Scheduled Cron Dispatcher
              </h3>
              <p className="text-xs text-neutral-400">
                The cron checks for: 1) Starting Soon (10 min lookahead), 2) Missed broadcasts, and
                3) VHS rentals expiring within 2 hours.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunCron}
            disabled={isRunningCron}
            className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/15 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-purple-200 transition-all hover:bg-purple-500/25 active:scale-98 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isRunningCron ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 fill-purple-400" />
            )}
            <span>{isRunningCron ? "Executing Cron..." : "Run Cron Dispatcher Now"}</span>
          </button>
        </div>

        {cronResult && (
          <div className="mt-3 rounded-xl border border-purple-900/50 bg-purple-950/30 p-3 text-xs font-mono text-purple-200 animate-in fade-in">
            {cronResult}
          </div>
        )}
      </div>

      {/* Subscriptions & Recent Logs Data Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Table 1: Registered Device Subscriptions */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 backdrop-blur">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Active Push Subscriptions ({subscriptions.length})
            </h4>
            <button
              type="button"
              onClick={() => fetchAdminData()}
              className="text-xs text-neutral-500 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {isLoadingData ? (
            <div className="flex h-32 items-center justify-center text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 uppercase tracking-wider">
              No devices subscribed yet. Tap &ldquo;Enable Alerts&rdquo; on your device.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs text-neutral-400">
                <thead className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500 sticky top-0 bg-neutral-900">
                  <tr>
                    <th className="py-2.5 px-3">Subscriber</th>
                    <th className="py-2.5 px-3">Timezone</th>
                    <th className="py-2.5 px-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850">
                  {subscriptions.map((sub) => {
                    const isAdmin = sub.role === "admin" || sub.userId === "admin";
                    return (
                      <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                isAdmin
                                  ? "bg-purple-950 text-purple-300 border border-purple-800"
                                  : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                              }`}
                            >
                              {isAdmin ? "admin" : "user"}
                            </span>
                            <div className="min-w-0 truncate">
                              <span className="font-semibold text-white text-xs block truncate">
                                {sub.displayName || (isAdmin ? "Admin" : "Active Viewer")}
                              </span>
                              {sub.code && (
                                <span className="font-mono text-[11px] text-neutral-400 block truncate">
                                  Code: <span className="text-amber-400/90 font-bold">{sub.code}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-300">
                          <span className="block font-medium">{sub.timezone || "UTC"}</span>
                          <span className="block text-[11px] text-neutral-500 font-mono">
                            {sub.timezoneOffset !== null ? `(${sub.timezoneOffset}m)` : ""}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-500 text-[11px] whitespace-nowrap">
                          {new Date(sub.updatedAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Table 2: Recent Notification Dispatch Logs */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 backdrop-blur">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Recent Dispatches ({recentLogs.length})
            </h4>
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">Idempotency Log</span>
          </div>

          {isLoadingData ? (
            <div className="flex h-32 items-center justify-center text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 uppercase tracking-wider">
              No notifications logged in history.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs text-neutral-400">
                <thead className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500 sticky top-0 bg-neutral-900">
                  <tr>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Recipient</th>
                    <th className="py-2.5 px-3">Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850">
                  {recentLogs.map((log) => {
                    const isAdmin = log.role === "admin" || log.userId === "admin";
                    return (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-amber-400 text-[11px] whitespace-nowrap">
                          {log.type}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                isAdmin
                                  ? "bg-purple-950 text-purple-300 border border-purple-800"
                                  : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                              }`}
                            >
                              {isAdmin ? "admin" : "user"}
                            </span>
                            <div className="min-w-0 truncate">
                              <span className="font-semibold text-neutral-200 text-xs block truncate">
                                {log.displayName || (isAdmin ? "Admin" : log.userId)}
                              </span>
                              {log.code && (
                                <span className="font-mono text-[10px] text-neutral-400 block truncate">
                                  {log.code}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-500 text-[11px] whitespace-nowrap">
                          {new Date(log.sentAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
