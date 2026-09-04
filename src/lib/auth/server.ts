import "server-only";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, type Role } from "./constants";
import { generateSessionToken } from "./tokens";
import { isSessionActive } from "./validity";

/** Thrown by `requireSession`/`requireAdmin` — route handlers should catch and map `.status` to a response. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface CurrentSession {
  id: string;
  role: Role;
  accessCodeId: string | null;
  displayName: string | null;
}

/** Reads the session cookie and validates it against the DB. `null` if missing/invalid/revoked/expired. */
export async function getSession(): Promise<CurrentSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { accessCode: { select: { revoked: true, expiresAt: true } } },
  });
  if (!session || !isSessionActive(session)) return null;

  // Keep lastSeenAt fresh if not updated in the last 15 seconds
  if (Date.now() - session.lastSeenAt.getTime() > 15_000) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return {
    id: session.id,
    role: session.role as Role,
    accessCodeId: session.accessCodeId,
    displayName: session.displayName,
  };
}

/** Strips any non-alphanumeric/safe characters to prevent injection. */
export function sanitizeDisplayName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const sanitized = raw.replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 30);
  return sanitized.length > 0 ? sanitized : null;
}

/** Lets either role rename their own session's header identity slot. Purely cosmetic — never used for auth. */
export async function setSessionDisplayName(sessionId: string, displayName: string | null): Promise<void> {
  const safeName = sanitizeDisplayName(displayName);
  await prisma.session.update({ where: { id: sessionId }, data: { displayName: safeName } });
}

export async function requireSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) throw new AuthError("Sign-in required.", 401);
  return session;
}

export async function requireAdmin(): Promise<CurrentSession> {
  const session = await requireSession();
  if (session.role !== "admin") throw new AuthError("Admin access required.", 403);
  return session;
}

/**
 * Returns a stable, persistent account identity across logins, device sessions, and browser restarts.
 * - Admin: always "admin"
 * - User: always their permanent AccessCode ID
 * - Guest/Anonymous: fallback to session.id or "anonymous"
 */
export function getPersistentUserId(session: CurrentSession | null): string {
  if (!session) return "anonymous";
  if (session.role === "admin") return "admin";
  if (session.accessCodeId) return session.accessCodeId;
  return session.id;
}

import { parseDeviceLabel, computeDeviceSignature, formatRelativeTime } from "./deviceFingerprint";

export interface RequestMetadata {
  userAgent: string | null;
  ip: string | null;
  deviceLabel: string;
  deviceSignature: string;
}

export async function currentRequestMeta(): Promise<RequestMetadata> {
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent");
  const acceptLanguage = headerStore.get("accept-language");
  const forwardedFor = headerStore.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

  return {
    userAgent,
    ip,
    deviceLabel: parseDeviceLabel(userAgent),
    deviceSignature: computeDeviceSignature(userAgent, acceptLanguage),
  };
}

async function persistSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export interface ActiveSessionSummary {
  id: string;
  deviceLabel: string;
  lastSeenAgo: string;
  lastSeenAt: string;
  isCurrentDevice: boolean;
}

export type RedeemSessionResult =
  | { success: true; token: string }
  | {
      success: false;
      error: "DEVICE_LIMIT_REACHED";
      limit: number;
      activeSessions: ActiveSessionSummary[];
    };

/**
 * Redeems an access code into a user session with resilient device concurrency limiting and re-binding.
 */
export async function createUserSessionWithDeviceLimit(
  accessCodeId: string,
  displayName?: string | null,
  disconnectSessionId?: string | null,
): Promise<RedeemSessionResult> {
  const meta = await currentRequestMeta();
  const safeName = sanitizeDisplayName(displayName);

  const code = await prisma.accessCode.findUnique({
    where: { id: accessCodeId },
    select: { id: true, maxDevices: true, revoked: true },
  });

  if (!code || code.revoked) {
    throw new AuthError("This code has been revoked.", 403);
  }

  // If user requested to replace/disconnect an older session:
  if (disconnectSessionId) {
    await prisma.session.updateMany({
      where: { id: disconnectSessionId, accessCodeId },
      data: { revokedAt: new Date() },
    });
  }

  // Fetch all active, non-revoked sessions for this code
  const now = new Date();
  const activeSessions = await prisma.session.findMany({
    where: {
      accessCodeId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { lastSeenAt: "desc" },
  });

  // Re-binding check: If current device already has a session slot, reuse it
  const existingDeviceSession = activeSessions.find(
    (s) => s.deviceSignature === meta.deviceSignature,
  );

  if (existingDeviceSession) {
    const token = generateSessionToken();
    await prisma.session.update({
      where: { id: existingDeviceSession.id },
      data: {
        token,
        displayName: safeName || existingDeviceSession.displayName,
        lastSeenAt: now,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        deviceLabel: meta.deviceLabel,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    await persistSessionCookie(token);
    return { success: true, token };
  }

  // Device limit check: If reached and no slot was freed, return list of active devices for user selection
  if (code.maxDevices !== null && activeSessions.length >= code.maxDevices) {
    const formattedSessions: ActiveSessionSummary[] = activeSessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel || parseDeviceLabel(s.userAgent),
      lastSeenAgo: formatRelativeTime(s.lastSeenAt),
      lastSeenAt: s.lastSeenAt.toISOString(),
      isCurrentDevice: s.deviceSignature === meta.deviceSignature,
    }));

    return {
      success: false,
      error: "DEVICE_LIMIT_REACHED",
      limit: code.maxDevices,
      activeSessions: formattedSessions,
    };
  }

  // Under limit: create brand-new session
  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      token,
      role: "user",
      accessCodeId,
      displayName: safeName,
      deviceLabel: meta.deviceLabel,
      deviceSignature: meta.deviceSignature,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });
  await persistSessionCookie(token);
  return { success: true, token };
}

/** Legacy helper wrapping createUserSessionWithDeviceLimit */
export async function createUserSession(accessCodeId: string, displayName?: string | null): Promise<string> {
  const result = await createUserSessionWithDeviceLimit(accessCodeId, displayName);
  if (!result.success) {
    throw new AuthError("Device limit reached for this access code.", 403);
  }
  return result.token;
}

/** Creates an "admin" session (after the admin password check) and sets the cookie. */
export async function createAdminSession(displayName?: string | null): Promise<string> {
  const token = generateSessionToken();
  const meta = await currentRequestMeta();
  const safeName = sanitizeDisplayName(displayName) || "Station Admin";
  await prisma.session.create({
    data: {
      token,
      role: "admin",
      accessCodeId: null,
      displayName: safeName,
      deviceLabel: meta.deviceLabel,
      deviceSignature: meta.deviceSignature,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });
  await persistSessionCookie(token);
  return token;
}

/** Revokes the current browser's session (if any) and clears its cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.updateMany({ where: { token }, data: { revokedAt: new Date() } });
  }
  store.delete(SESSION_COOKIE_NAME);
}
