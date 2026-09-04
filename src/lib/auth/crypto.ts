import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const DEFAULT_SALT_ROUNDS = 12;

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error(
      "[auth/crypto] JWT_SECRET (or ADMIN_PASSWORD) must be set in .env.local. " +
      "Do not run the server without a cryptographic secret configured.",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Constant-time string comparison preventing timing attacks on plaintext fallbacks. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Hashes a raw password string using bcrypt with 12 salt rounds. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, DEFAULT_SALT_ROUNDS);
}

/**
 * Verifies a plain password against a stored secret.
 * If the stored secret is a bcrypt hash ($2a$, $2b$, $2y$), uses bcrypt.compare.
 * If it is a legacy plaintext string in .env, securely compares using timing-safe comparison.
 */
export async function verifyPassword(password: string, storedHashOrPlain: string): Promise<boolean> {
  if (!password || !storedHashOrPlain) return false;

  const cleanInput = password.trim();
  // Strip surrounding quotes and any dotenv-escaped backslashes before '$'
  const cleanSecret = storedHashOrPlain
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\(\$)/g, "$1");

  const isBcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(cleanSecret);
  if (isBcryptHash) {
    return bcrypt.compare(cleanInput, cleanSecret);
  }

  return safeCompare(cleanInput, cleanSecret);
}

/**
 * Signs a cryptographic JWT with custom claims, issuer, and expiration.
 */
export async function signJwtToken(
  payload: Record<string, unknown>,
  expiresIn = "30d"
): Promise<string> {
  const secret = getJwtSecretKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("cablecast")
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verifies a signed JWT and returns its typed payload, or null if invalid/expired.
 */
export async function verifyJwtToken<T extends JWTPayload = JWTPayload>(
  token: string
): Promise<T | null> {
  try {
    const secret = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secret, {
      issuer: "cablecast",
    });
    return payload as T;
  } catch {
    return null;
  }
}
