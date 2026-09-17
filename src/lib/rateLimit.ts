import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

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

// In-memory token bucket / sliding window cache as high-performance local layer & graceful fallback
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

function withTimeout<T>(promise: Promise<T>, ms: number = 800): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("RateLimit DB timeout")), ms)),
  ]);
}

let tableInitialized = false;
async function ensureRateLimitTable(): Promise<boolean> {
  if (tableInitialized) return true;
  try {
    if (typeof (prisma as any)?.$executeRawUnsafe === "function") {
      await withTimeout(
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "_rate_limits" (
            "key" TEXT PRIMARY KEY,
            "count" INTEGER NOT NULL,
            "reset_time" BIGINT NOT NULL
          );
        `),
        800,
      );
      tableInitialized = true;
      return true;
    }
  } catch {
    // Database connection or permission error — will fallback to in-memory
  }
  return false;
}

/**
 * Gets the client IP address from standard proxy/forwarding headers.
 */
export async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  // Prefer Vercel's server-set header which clients cannot spoof
  const vercelIp = headerStore.get("x-vercel-forwarded-for");
  if (vercelIp) {
    return vercelIp.split(",")[0].trim();
  }
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
 * Enforces rate limiting per IP for sensitive endpoints (e.g. login, code redemption).
 * Persists across Vercel serverless cold starts via PostgreSQL with local memory fallback.
 * Returns { success: true, remaining } if allowed, or { success: false, retryAfterSeconds } if rate-limited.
 */
export async function checkRateLimit(
  bucketKey: string,
  options: RateLimitOptions,
): Promise<{ success: boolean; remaining: number; retryAfterSeconds?: number }> {
  const ip = await getClientIp();
  const key = `${bucketKey}:${ip}`;
  const now = Date.now();

  // Local write-through state layer
  let memRecord = ipCache.get(key);
  if (!memRecord || now > memRecord.resetTime) {
    memRecord = { count: 1, resetTime: now + options.windowMs };
    ipCache.set(key, memRecord);
  } else {
    memRecord.count += 1;
  }

  // 1. Persistent Database Layer (survives Vercel cold starts)
  const isDbReady = await ensureRateLimitTable().catch(() => false);
  if (isDbReady) {
    try {
      const rows = await withTimeout(
        prisma.$queryRawUnsafe<{ count: number; reset_time: string | number }[]>(
          `SELECT "count", "reset_time" FROM "_rate_limits" WHERE "key" = $1 LIMIT 1`,
          key,
        ),
        800,
      );

      if (rows && rows.length > 0) {
        const dbRecord = rows[0];
        const resetTime = Number(dbRecord.reset_time);

        if (now > resetTime) {
          // Window expired in DB, reset bucket
          await withTimeout(
            prisma.$executeRawUnsafe(
              `UPDATE "_rate_limits" SET "count" = 1, "reset_time" = $1 WHERE "key" = $2`,
              now + options.windowMs,
              key,
            ),
            800,
          );
          return { success: true, remaining: options.maxRequests - 1 };
        }

        const effectiveCount = Math.max(dbRecord.count, memRecord.count);
        if (effectiveCount > options.maxRequests) {
          const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));
          return { success: false, remaining: 0, retryAfterSeconds };
        }

        await withTimeout(
          prisma.$executeRawUnsafe(
            `UPDATE "_rate_limits" SET "count" = $1 WHERE "key" = $2`,
            effectiveCount,
            key,
          ),
          800,
        );
        return { success: true, remaining: options.maxRequests - effectiveCount };
      } else {
        await withTimeout(
          prisma.$executeRawUnsafe(
            `INSERT INTO "_rate_limits" ("key", "count", "reset_time") VALUES ($1, $2, $3) ON CONFLICT ("key") DO UPDATE SET "count" = $2, "reset_time" = $3`,
            key,
            memRecord.count,
            now + options.windowMs,
          ),
          800,
        );
        const isBlocked = memRecord.count > options.maxRequests;
        const retryAfterSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
        return {
          success: !isBlocked,
          remaining: Math.max(0, options.maxRequests - memRecord.count),
          ...(isBlocked ? { retryAfterSeconds } : {}),
        };
      }
    } catch {
      // Fall through to in-memory evaluation on any database error or timeout
    }
  }

  // 2. In-Memory Evaluation (Fast-path & Fallback)
  if (memRecord.count > options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((memRecord.resetTime - now) / 1000));
    return { success: false, remaining: 0, retryAfterSeconds };
  }

  return { success: true, remaining: options.maxRequests - memRecord.count };
}
