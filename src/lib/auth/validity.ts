/**
 * Pure validity rules shared between `src/proxy.ts` (which runs on every
 * request, before any page or API route) and the server-only helpers in
 * `server.ts` (which re-check on top of Proxy, per Next's own guidance that
 * a matcher change should never be the *only* thing standing between a
 * route and an unauthorized request). Kept dependency-free so both call
 * sites agree on exactly what "valid" means.
 */

export interface SessionValidityInput {
  revokedAt: Date | null;
  expiresAt: Date | null;
  accessCode: { revoked: boolean; expiresAt: Date | null } | null;
}

export function isSessionActive(session: SessionValidityInput, now: Date = new Date()): boolean {
  if (session.revokedAt) return false;
  if (session.expiresAt && session.expiresAt.getTime() <= now.getTime()) return false;

  // A revoked/expired *code* immediately kills every session it ever issued,
  // even ones already in progress — this is what makes "revoke the code"
  // behave the same as "revoke every session using it".
  if (session.accessCode) {
    if (session.accessCode.revoked) return false;
    if (session.accessCode.expiresAt && session.accessCode.expiresAt.getTime() <= now.getTime()) return false;
  }

  return true;
}

export interface AccessCodeRedemptionInput {
  revoked: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
}

/** Returns a user-facing reason the code can't be redeemed right now, or `null` if it's fine. */
export function getAccessCodeRedemptionError(
  code: AccessCodeRedemptionInput,
  now: Date = new Date(),
): string | null {
  if (code.revoked) return "This code has been revoked.";
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "This code has expired.";
  if (code.maxUses !== null && code.useCount >= code.maxUses) return "This code has already been used up.";
  return null;
}
