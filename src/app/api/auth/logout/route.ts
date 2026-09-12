import { NextResponse } from "next/server";
import { destroyCurrentSession, getSession } from "@/lib/auth/server";

export async function POST() {
  const session = await getSession();
  if (session) {
    console.log(
      `[auth] Session ${session.id} (${session.role}, displayName: "${session.displayName || "Viewer"}") signed out at ${new Date().toISOString()}`
    );
  }
  await destroyCurrentSession();
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
