"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

interface ToastContextValue {
  showToast: (item: Omit<ToastItem, "id">) => void;
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function renderFormattedMessage(message: string, isDestructive?: boolean) {
  // Matches quoted text such as "EHSY-6M8K" or "Show Title"
  const parts = message.split(/(".*?")/g);
  return parts.map((part, index) => {
    if (part.startsWith('"') && part.endsWith('"') && part.length > 2) {
      const code = part.slice(1, -1);
      return (
        <span
          key={index}
          className={`inline-block px-1.5 py-0.5 mx-0.5 rounded border font-mono text-xs font-medium ${isDestructive
              ? "bg-neutral-900 border-neutral-800 text-red-400"
              : "bg-neutral-900 border-neutral-800 text-amber-300"
            }`}
        >
          {code}
        </span>
      );
    }
    return part;
  });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const dismissToast = useCallback((id: string) => {
    setDismissingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 140);
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4500 }: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  const toast = {
    success: (message: string, title?: string) => showToast({ type: "success", title, message }),
    error: (message: string, title?: string) => showToast({ type: "error", title, message }),
    warning: (message: string, title?: string) => showToast({ type: "warning", title, message }),
    info: (message: string, title?: string) => showToast({ type: "info", title, message }),
  };

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({ options, resolve });
    });
  }, []);

  const handleConfirmClose = useCallback((result: boolean) => {
    if (confirmDialog) {
      confirmDialog.resolve(result);
      setConfirmDialog(null);
    }
  }, [confirmDialog]);

  useEffect(() => {
    if (!confirmDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleConfirmClose(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [confirmDialog, handleConfirmClose]);

  return (
    <ToastContext.Provider value={{ showToast, toast, confirm }}>
      {children}

      {/* ── Toast Container ────────────────────────────────────────────── */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[9990] flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0"
      >
        {toasts.map((item) => {
          const isSuccess = item.type === "success";
          const isError = item.type === "error";
          const isWarning = item.type === "warning";
          const isDismissing = dismissingIds.has(item.id);

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl p-4 shadow-2xl backdrop-blur-xl border transition-all ${
                isDismissing
                  ? "animate-out fade-out slide-out-to-bottom-3 pointer-events-none"
                  : "animate-in fade-in slide-in-from-bottom-3"
              } ${isSuccess
                  ? "bg-neutral-950/95 border-emerald-800/60 text-neutral-200 shadow-emerald-950/30"
                  : isError
                    ? "bg-neutral-950/95 border-rose-800/60 text-neutral-200 shadow-rose-950/30"
                    : isWarning
                      ? "bg-neutral-950/95 border-amber-800/60 text-neutral-200 shadow-amber-950/30"
                      : "bg-neutral-950/95 border-cyan-800/60 text-neutral-200 shadow-cyan-950/30"
                }`}
            >
              <div className="mt-0.5 shrink-0">
                {isSuccess && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                {isError && <AlertCircle className="h-5 w-5 text-rose-400" />}
                {isWarning && <AlertTriangle className="h-5 w-5 text-amber-400" />}
                {!isSuccess && !isError && !isWarning && <Info className="h-5 w-5 text-cyan-400" />}
              </div>

              <div className="flex-1 min-w-0">
                {item.title && (
                  <p
                    className={`text-xs font-bold uppercase tracking-wider ${isSuccess
                        ? "text-emerald-400"
                        : isError
                          ? "text-rose-400"
                          : isWarning
                            ? "text-amber-400"
                            : "text-cyan-400"
                      }`}
                  >
                    {item.title}
                  </p>
                )}
                <p className="text-xs leading-relaxed text-neutral-300 break-words mt-0.5">{item.message}</p>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                className="shrink-0 text-neutral-500 hover:text-white transition-colors p-0.5 rounded active:scale-95"
                aria-label="Close notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Custom Confirmation Modal ─────────────────────────────────── */}
      {confirmDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-in fade-in"
          onClick={() => handleConfirmClose(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/95 p-6 shadow-2xl shadow-black/95 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Icon and Title in a single aligned row */}
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${confirmDialog.options.isDestructive
                    ? "border-red-800/60 bg-red-950/50 text-red-400"
                    : "border-amber-800/60 bg-amber-950/50 text-amber-400"
                  }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {confirmDialog.options.title}
              </h3>
            </div>

            {/* Body Message */}
            <p className="mt-3 text-xs leading-relaxed text-neutral-300">
              {renderFormattedMessage(confirmDialog.options.message, confirmDialog.options.isDestructive)}
            </p>

            {/* Actions: Centered, Title Case, No Horizontal Divider */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleConfirmClose(false)}
                className="min-w-[100px] rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
              >
                {confirmDialog.options.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => handleConfirmClose(true)}
                className={`min-w-[120px] rounded-xl px-5 py-2.5 text-xs font-semibold transition-all ${confirmDialog.options.isDestructive
                    ? "bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-600/20"
                    : "bg-white text-black hover:bg-neutral-200 shadow-sm"
                  }`}
              >
                {confirmDialog.options.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
