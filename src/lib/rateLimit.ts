import { headers } from "next/headers";

interface RateLimitOptions {
  /** Maximum number of allowed requests in the time window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory token bucket / sliding window cache
const ipCache = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes to prevent memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of ipCache.entries()) {
      if (now > record.resetTime) {
        ipCache.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Gets the client IP address from standard proxy/forwarding headers.
 */
export async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = headerStore.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Enforces rate limiting per IP for sensitive endpoints (e.g. login, code redemption, stream extraction).
 * Returns { success: true, remaining } if allowed, or { success: false, retryAfterSeconds } if rate-limited.
 */
export async function checkRateLimit(
  bucketKey: string,
  options: RateLimitOptions,
): Promise<{ success: boolean; remaining: number; retryAfterSeconds?: number }> {
  const ip = await getClientIp();
  const key = `${bucketKey}:${ip}`;
  const now = Date.now();

  const record = ipCache.get(key);

  if (!record || now > record.resetTime) {
    ipCache.set(key, {
      count: 1,
      resetTime: now + options.windowMs,
    });
    return { success: true, remaining: options.maxRequests - 1 };
  }

  if (record.count >= options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    return { success: false, remaining: 0, retryAfterSeconds };
  }

  record.count += 1;
  return { success: true, remaining: options.maxRequests - record.count };
}
