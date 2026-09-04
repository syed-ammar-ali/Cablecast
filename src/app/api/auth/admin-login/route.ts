import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, sanitizeDisplayName } from "@/lib/auth/server";
import { verifyPassword } from "@/lib/auth/crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import { AdminLoginSchema, isHoneypotTriggered } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  // Rate limit: max 5 login attempts per 15 minutes per IP
  const rateLimit = await checkRateLimit("admin-login", {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: `Too many login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const adminSecret = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;
  if (!adminSecret) {
    console.error("[api/auth/admin-login] ADMIN_PASSWORD_HASH or ADMIN_PASSWORD is not set — admin login is disabled.");
    return NextResponse.json({ error: "Admin login isn't configured." }, { status: 500 });
  }

  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parseResult = AdminLoginSchema.safeParse(rawJson);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "Invalid input parameters.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const { password, displayName, hp_auth, website } = parseResult.data;

  // Honeypot bot-trap check
  if (isHoneypotTriggered(hp_auth) || isHoneypotTriggered(website)) {
    return NextResponse.json({ error: "Invalid request verification." }, { status: 400 });
  }

  const isValid = await verifyPassword(password, adminSecret);
  if (!isValid) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const safeName = sanitizeDisplayName(displayName);

  await createAdminSession(safeName);
  return NextResponse.json({
    ok: true,
    displayName: safeName,
    hasName: Boolean(safeName),
  });
}

