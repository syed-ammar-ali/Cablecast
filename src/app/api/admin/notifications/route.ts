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

    // Collect all unique non-admin IDs across subscriptions and logs
    const allUserIds = Array.from(
      new Set([
        ...subscriptions.map((s) => s.userId),
        ...recentLogs.map((l) => l.userId),
      ]),
    );
    const nonAdminIds = allUserIds.filter((id) => id !== "admin");

    const [accessCodes, sessions] = await Promise.all([
      nonAdminIds.length > 0
        ? prisma.accessCode.findMany({
            where: { id: { in: nonAdminIds } },
            select: { id: true, code: true, label: true },
          })
        : [],
      nonAdminIds.length > 0
        ? prisma.session.findMany({
            where: {
              OR: [
                { id: { in: nonAdminIds } },
                { accessCodeId: { in: nonAdminIds } },
              ],
            },
            select: {
              id: true,
              accessCodeId: true,
              role: true,
              displayName: true,
              deviceLabel: true,
              accessCode: {
                select: { id: true, code: true, label: true },
              },
            },
            orderBy: { lastSeenAt: "desc" },
          })
        : [],
    ]);

    const enrichedSubscriptions = subscriptions.map((sub) => {
      if (sub.userId === "admin") {
        return {
          ...sub,
          role: "admin" as const,
          displayName: "Admin",
          code: null,
          label: "Admin Console",
        };
      }

      const matchedCode = accessCodes.find((c) => c.id === sub.userId);
      const matchedSession = sessions.find(
        (s) => s.id === sub.userId || s.accessCodeId === sub.userId,
      );

      const codeStr = matchedCode?.code || matchedSession?.accessCode?.code || null;
      const labelStr = matchedCode?.label || matchedSession?.accessCode?.label || matchedSession?.deviceLabel || null;
      const name = matchedSession?.displayName || labelStr || (codeStr ? `Viewer (${codeStr})` : "Active Viewer");

      return {
        ...sub,
        role: (matchedSession?.role as "admin" | "user") || "user",
        displayName: name,
        code: codeStr,
        label: labelStr,
      };
    });

    const enrichedLogs = recentLogs.map((log) => {
      if (log.userId === "admin") {
        return {
          ...log,
          role: "admin" as const,
          displayName: "Admin",
          code: null,
        };
      }

      const matchedCode = accessCodes.find((c) => c.id === log.userId);
      const matchedSession = sessions.find(
        (s) => s.id === log.userId || s.accessCodeId === log.userId,
      );

      const codeStr = matchedCode?.code || matchedSession?.accessCode?.code || null;
      const labelStr = matchedCode?.label || matchedSession?.accessCode?.label || matchedSession?.deviceLabel || null;
      const name = matchedSession?.displayName || labelStr || (codeStr ? `Viewer (${codeStr})` : "Active Viewer");

      return {
        ...log,
        role: (matchedSession?.role as "admin" | "user") || "user",
        displayName: name,
        code: codeStr,
      };
    });

    return NextResponse.json({
      success: true,
      totalSubscriptions: enrichedSubscriptions.length,
      subscriptions: enrichedSubscriptions,
      recentLogs: enrichedLogs,
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
