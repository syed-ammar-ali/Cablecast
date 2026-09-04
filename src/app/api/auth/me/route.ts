import { NextRequest, NextResponse } from "next/server";
import { getSession, setSessionDisplayName } from "@/lib/auth/server";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ role: session?.role ?? null, displayName: session?.displayName ?? null });
}

/** Lets the current session (admin or user) set/clear its own header display name. */
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = (body as { displayName?: unknown })?.displayName;
  if (raw !== null && typeof raw !== "string") {
    return NextResponse.json({ error: "`displayName` must be a string or null." }, { status: 400 });
  }

  const displayName = typeof raw === "string" ? raw.trim().slice(0, 40) || null : null;
  await setSessionDisplayName(session.id, displayName);

  return NextResponse.json({ ok: true, displayName });
}
