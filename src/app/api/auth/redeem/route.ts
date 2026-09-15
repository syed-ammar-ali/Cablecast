import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSessionWithDeviceLimit, sanitizeDisplayName } from "@/lib/auth/server";
import { normalizeAccessCodeInput } from "@/lib/auth/tokens";
import { getAccessCodeRedemptionError } from "@/lib/auth/validity";
import { checkRateLimit } from "@/lib/rateLimit";
import { RedeemAccessCodeSchema, isHoneypotTriggered } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  // Rate limit: max 10 code redemption attempts per 15 minutes per IP
  const rateLimit = await checkRateLimit("auth-redeem", {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: `Too many redemption attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parseResult = RedeemAccessCodeSchema.safeParse(rawJson);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "Invalid input parameters.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const { code: rawCode, displayName, disconnectSessionId, hp_auth, website } = parseResult.data;

  // Honeypot bot-trap check: Silent 400 rejection if automated crawlers fill hidden inputs
  if (isHoneypotTriggered(hp_auth) || isHoneypotTriggered(website)) {
    return NextResponse.json({ error: "Invalid request verification." }, { status: 400 });
  }

  const code = normalizeAccessCodeInput(rawCode);

  const accessCode = await prisma.accessCode.findUnique({ where: { code } });
  if (!accessCode) {
    return NextResponse.json({ error: "That code isn't recognized." }, { status: 404 });
  }

  const redemptionError = getAccessCodeRedemptionError(accessCode);
  if (redemptionError) {
    return NextResponse.json({ error: redemptionError }, { status: 403 });
  }

  // Atomically check maxUses AND increment in one operation to prevent race conditions
  if (accessCode.maxUses !== null) {
    const updated = await prisma.accessCode.updateMany({
      where: { id: accessCode.id, useCount: { lt: accessCode.maxUses } },
      data: { useCount: { increment: 1 } },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "This code has reached its maximum number of uses." },
        { status: 403 }
      );
    }
  }

  // Priority: 1. Client-remembered viewer name (if this device has one saved)
  const clientName = typeof displayName === "string" ? sanitizeDisplayName(displayName) : null;
  const initialName = clientName || null;

  const sessionResult = await createUserSessionWithDeviceLimit(
    accessCode.id,
    initialName,
    disconnectSessionId,
  );

  if (!sessionResult.success) {
    if (accessCode.maxUses !== null) {
      await prisma.accessCode
        .update({
          where: { id: accessCode.id },
          data: { useCount: { decrement: 1 } },
        })
        .catch(() => {});
    }

    return NextResponse.json(
      {
        error: "DEVICE_LIMIT_REACHED",
        message: `Device limit reached (${sessionResult.limit}/${sessionResult.limit} active devices).`,
        limit: sessionResult.limit,
        activeSessions: sessionResult.activeSessions,
      },
      { status: 409 }
    );
  }

  // If code has unlimited uses (maxUses === null), increment useCount on successful redemption
  if (accessCode.maxUses === null) {
    await prisma.accessCode.update({
      where: { id: accessCode.id },
      data: { useCount: { increment: 1 } },
    });
  }

  return NextResponse.json({
    ok: true,
    displayName: initialName,
    hasName: Boolean(initialName),
  });
}

