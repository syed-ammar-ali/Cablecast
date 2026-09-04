import crypto from "crypto";

/**
 * Parses a standard User-Agent string into a clean, human-friendly device label.
 * Example outputs: "Chrome on macOS", "Safari on iPhone (iOS 17)", "Firefox on Windows", "Edge on Windows", "Chrome on Android".
 */
export function parseDeviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent || typeof userAgent !== "string") {
    return "Unknown Device";
  }

  const ua = userAgent;

  // 1. Detect OS / Platform
  let os = "Unknown OS";
  if (/iPad|Tablet/i.test(ua)) {
    os = "iPad";
  } else if (/iPhone/i.test(ua)) {
    const match = ua.match(/OS (\d+[._]\d+)/);
    const version = match ? ` (iOS ${match[1].replace("_", ".")})` : "";
    os = `iPhone${version}`;
  } else if (/Android/i.test(ua)) {
    os = "Android";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = "macOS";
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = "Windows";
  } else if (/Windows/i.test(ua)) {
    os = "Windows";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  } else if (/CrOS/i.test(ua)) {
    os = "ChromeOS";
  } else if (/Tizen|Web0S|SmartTV|AppleTV|Roku/i.test(ua)) {
    os = "Smart TV";
  }

  // 2. Detect Browser
  let browser = "Browser";
  if (/Edg\//i.test(ua)) {
    browser = "Edge";
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = "Opera";
  } else if (/Brave/i.test(ua)) {
    browser = "Brave";
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = "Safari";
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox";
  }

  return `${browser} on ${os}`;
}

/**
 * Computes a deterministic device signature hash from stable client headers.
 * Notice: IP addresses are intentionally EXCLUDED to ensure that switching
 * between Wi-Fi and 5G cellular networks never changes the signature.
 */
export function computeDeviceSignature(
  userAgent: string | null | undefined,
  acceptLanguage: string | null | undefined = "",
): string {
  const safeUa = (userAgent || "").trim().toLowerCase();
  const safeLang = (acceptLanguage || "").split(",")[0].trim().toLowerCase();

  const entropy = `${safeUa}|${safeLang}`;
  return crypto.createHash("sha256").update(entropy).digest("hex").slice(0, 32);
}

/**
 * Formats a Date object into a readable relative time string (e.g. "Just now", "4m ago", "2h ago", "3d ago").
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return "Active now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
