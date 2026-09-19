import { NextRequest, NextResponse } from "next/server";
import { getQStashReceiver } from "@/lib/notifications/qstash";
import { dispatchStartingSoonForSlot } from "@/lib/notifications/notificationDispatcher";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: { scheduleId?: string; type?: string };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Cryptographic signature check (when signing keys are configured)
    const receiver = getQStashReceiver();
    const signature = request.headers.get("upstash-signature");
    if (receiver && (process.env.NODE_ENV === "production" || signature)) {
      if (!signature) {
        return NextResponse.json({ error: "Missing QStash signature" }, { status: 401 });
      }
      const isValid = await receiver
        .verify({
          signature,
          body: rawBody,
          // Omitting `url` avoids false rejection when reverse proxies or Vercel
          // rewrite the internal listener host, while verifying cryptographic HMAC
          // and SHA256 body hash integrity.
        })
        .catch(() => false);

      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const { scheduleId } = body;
    if (!scheduleId || typeof scheduleId !== "string") {
      return NextResponse.json({ error: "scheduleId is required" }, { status: 400 });
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const requestOrigin = host ? `${proto}://${host}` : request.nextUrl.origin;

    const res = await dispatchStartingSoonForSlot(scheduleId, new Date(), requestOrigin);
    return NextResponse.json(res);
  } catch (error) {
    console.error("[dispatch-appointment] Error handling delayed alert:", error);
    return NextResponse.json(
      { error: "Failed to dispatch appointment alert", details: String(error) },
      { status: 500 },
    );
  }
}
