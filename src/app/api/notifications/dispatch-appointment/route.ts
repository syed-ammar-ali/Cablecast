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

    console.log(`[dispatch-appointment] Incoming request. Has signature: ${Boolean(signature)}, Has receiver: ${Boolean(receiver)}, ENV: ${process.env.NODE_ENV}`);

    if (receiver && (process.env.NODE_ENV === "production" || signature)) {
      if (!signature) {
        console.error("[dispatch-appointment] Rejected: missing QStash signature header");
        return NextResponse.json({ error: "Missing QStash signature" }, { status: 401 });
      }
      let isValid = false;
      try {
        isValid = await receiver.verify({
          signature,
          body: rawBody,
          // clockTolerance: allow up to 5 extra minutes for retried/delayed messages.
          // Without this, QStash retries arriving after the default 5-min window are rejected.
          clockTolerance: 300,
          // Omitting `url` avoids false rejection when reverse proxies or Vercel
          // rewrite the internal listener host, while still verifying cryptographic HMAC
          // and SHA256 body hash integrity.
        });
      } catch (verifyErr) {
        console.error("[dispatch-appointment] Signature verify threw error:", verifyErr);
        isValid = false;
      }

      if (!isValid) {
        console.error("[dispatch-appointment] Rejected: invalid QStash signature. Check that QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY in Vercel env match the keys at console.upstash.com.");
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
