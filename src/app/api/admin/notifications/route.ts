import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/server";
import { runAllNotificationDispatchers } from "@/lib/notifications/notificationDispatcher";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const subscriptions = await prisma.pushSubscription.findMany({
      select: {
        id: true,
        userId: true,
        timezone: true,
        timezoneOffset: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const recentLogs = await prisma.notificationLog.findMany({
      take: 20,
      orderBy: { sentAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      totalSubscriptions: subscriptions.length,
      subscriptions,
      recentLogs,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status || 500;
    const message = err instanceof Error ? err.message : "Unauthorized or server error";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = (await request.json().catch(() => ({}))) as { action?: string };

    if (body.action === "run_cron") {
      const summary = await runAllNotificationDispatchers(new Date());
      return NextResponse.json({
        success: true,
        action: "run_cron",
        summary,
        message: `Cron job executed successfully. Starting soon: ${summary.startingSoon}, Missed: ${summary.missedBroadcast}, Expiring tapes: ${summary.tapeExpiring}`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status || 500;
    const message = err instanceof Error ? err.message : "Unauthorized or server error";
    return NextResponse.json({ error: message }, { status });
  }
}
