"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Global Passive Authentication Interceptor.
 * Zero heartbeat/polling overhead.
 * Intercepts user-initiated fetch calls mid-session: if a request returns 401 Unauthorized
 * (e.g. after code revocation), it safely pauses active playback and redirects to /gate.
 */
export function AuthInterceptor() {
  const pathname = usePathname();

  useEffect(() => {
    // Skip interception if already on the public gate page
    if (pathname === "/gate") return;

    function handleUnauthorized() {
      // 1. Immediately terminate any active HTML5 audio or video playback
      if (typeof document !== "undefined") {
        document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((el) => {
          try {
            el.pause();
            el.removeAttribute("src");
            el.load();
          } catch {}
        });
      }

      // 2. Perform safe redirect to the access gate with error notice
      if (typeof window !== "undefined" && window.location.pathname !== "/gate") {
        window.location.replace("/gate?error=revoked");
      }
    }

    // Intercept outgoing fetch requests on user actions
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
          ? args[0].url
          : "";

      const isAuthRoute =
        url.includes("/api/auth/redeem") ||
        url.includes("/api/auth/admin-login");

      if (response.status === 401 && !isAuthRoute) {
        handleUnauthorized();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [pathname]);

  return null;
}
