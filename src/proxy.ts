import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { isSessionActive } from "@/lib/auth/validity";

/**
 * This is the first thing any request — human, bot, or scraper — hits.
 * Nothing below this file ever renders (or returns data) without a valid,
 * live session row. Next.js 16 runs Proxy on the Node.js runtime by
 * default, so a direct Prisma/SQLite lookup here is cheap and lets the
 * admin's "revoke" button take effect on the very next request, not just
 * on new sign-ins.
 */

const PUBLIC_PAGE_PREFIXES = ["/gate", "/manifest.json", "/manifest.webmanifest", "/sw.js"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];
const ADMIN_PAGE_PREFIXES = ["/admin"];
const ADMIN_API_PREFIXES = ["/api/admin/"];

const BLOCKED_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /masscan/i,
  /nmap/i,
  /semrushbot/i,
  /dotbot/i,
  /megaindex/i,
  /zgrab/i,
  /censys/i,
  /shodan/i,
  /acunetix/i,
  /dirbuster/i,
  /wpscan/i,
  /havij/i,
  /hydra/i,
  /gobuster/i,
];

function isMaliciousUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  return BLOCKED_USER_AGENTS.some((pattern) => pattern.test(ua));
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicPath(pathname: string): boolean {
  if (matchesPrefix(pathname, PUBLIC_PAGE_PREFIXES)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAdminOnlyPath(pathname: string): boolean {
  if (matchesPrefix(pathname, ADMIN_PAGE_PREFIXES)) return true;
  return ADMIN_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * API requests get a JSON error; page requests get redirected. Only a 401
 * (no session, or the session/code turned out to be invalid) wipes the
 * cookie — a 403 means the session is perfectly valid, just not privileged
 * enough for this one path, so a signed-in "user" bouncing off `/admin`
 * must not be signed out in the process.
 */
function deny(request: NextRequest, status: 401 | 403, message: string): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status });
  }

  const destination = new URL(status === 403 ? "/home" : "/gate", request.url);
  if (status === 401) destination.searchParams.set("next", pathname);

  const response = NextResponse.redirect(destination);
  if (status === 401) response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  try {
    const { pathname } = request.nextUrl;

    // 1. Edge Shielding: Block known exploit scanners, vulnerability scrapers, and malicious tools
    const userAgent = request.headers.get("user-agent");
    if (isMaliciousUserAgent(userAgent)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // 2. Anti-CSRF Verification: Block cross-site forged state-changing mutations
    if (pathname.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD") {
      const secFetchSite = request.headers.get("sec-fetch-site");
      if (secFetchSite === "cross-site") {
        return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
      }

      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Malformed request origin." }, { status: 403 });
        }
      }
    }

    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return deny(request, 401, "Sign-in required.");
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { accessCode: { select: { revoked: true, expiresAt: true } } },
    });

    if (!session || !isSessionActive(session)) {
      return deny(request, 401, "Sign-in required.");
    }

    if (isAdminOnlyPath(pathname) && session.role !== "admin") {
      return deny(request, 403, "Admin access required.");
    }

    // Attach verified session credentials to downstream request headers (0-DB-lookup fast path)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-cc-session-id", session.id);
    requestHeaders.set("x-cc-role", session.role);
    if (session.accessCodeId) {
      requestHeaders.set("x-cc-access-code-id", session.accessCodeId);
    }
    if (session.displayName) {
      requestHeaders.set("x-cc-display-name", encodeURIComponent(session.displayName));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch (error) {
    console.error("[proxy] Error in proxy authentication:", error);
    return deny(request, 401, "Sign-in required.");
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2)$).*)",
  ],
};
