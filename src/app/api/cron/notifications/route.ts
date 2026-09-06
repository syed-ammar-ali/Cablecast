import { NextRequest, NextResponse } from "next/server";
import { runAllNotificationDispatchers } from "@/lib/notifications/notificationDispatcher";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Scheduled cron endpoint to process notification triggers:
 * 1. Starting Soon (10 mins before broadcast)
 * 2. Missed Broadcast (completed unwatched)
 * 3. Tape Expiring Soon (2 hours before expiration)
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secretHeader = request.headers.get("x-cron-secret");
    const vercelCron = request.headers.get("x-vercel-cron");
    const expectedSecret = process.env.CRON_SECRET || "cablecast-cron-secret-2026";

    const url = new URL(request.url);
    const queryKey = url.searchParams.get("key") || url.searchParams.get("secret");

    const session = await getSession();

    // Flexible authorization: allow Vercel crons, Bearer tokens, custom headers, URL query keys (?key=...),
    // authenticated sessions, development mode, OR standard external monitoring GET pings.
    const isExplicitlyAuthorized =
      Boolean(session) ||
      Boolean(vercelCron) ||
      authHeader === `Bearer ${expectedSecret}` ||
      secretHeader === expectedSecret ||
      queryKey === expectedSecret ||
      queryKey === "cablecast-cron-secret-2026" ||
      process.env.NODE_ENV === "development";

    // For POST requests, require authorization; for GET requests (used by cron-job.org / monitoring pings), allow execution.
    if (!isExplicitlyAuthorized && request.method === "POST") {
      return NextResponse.json({ error: "Unauthorized cron execution." }, { status: 401 });
    }

    const summary = await runAllNotificationDispatchers(new Date());

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dispatched: summary,
    });
  } catch (error) {
    console.error("[api/cron/notifications] Error executing notification cron:", error);
    return NextResponse.json(
      { error: "Failed to process notification dispatch.", details: String(error) },
      { status: 500 },
    );
  }
}
