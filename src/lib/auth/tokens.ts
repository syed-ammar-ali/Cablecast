import { randomBytes } from "crypto";

/** Long, unguessable opaque session identifier — this is the cookie's entire value. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// Excludes 0/O, 1/I/L and other visually-ambiguous characters so a code can
// be read off a screen and typed on a phone without guesswork.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCodeSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** A human-typable invite code, e.g. "K7H2-9QRT". */
export function generateAccessCode(): string {
  return `${randomCodeSegment(4)}-${randomCodeSegment(4)}`;
}

/** Normalizes user-typed codes: uppercase, strip whitespace, tolerate a missing dash. */
export function normalizeAccessCodeInput(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return raw.trim().toUpperCase();
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
