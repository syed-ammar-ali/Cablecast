import { NextRequest, NextResponse } from "next/server";
import { getScheduleForCountryAndDate } from "@/lib/tvmaze";
import { TvmazeScheduleQuerySchema } from "@/lib/validation/schemas";

/**
 * Server-side wrapper around TVmaze's public `/schedule` endpoint —
 * real-world broadcast listings by country + date, used by the "World
 * Guide" grid. TVmaze requires no API key; this route exists mainly to
 * validate params and keep fetch/retry logic server-side and cached.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawCountry = searchParams.get("country") ?? "US";
  const rawDate = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const parseResult = TvmazeScheduleQuerySchema.safeParse({
    country: rawCountry,
    date: rawDate,
  });

  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "Invalid country or date parameters.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const { country = "US", date = new Date().toISOString().slice(0, 10) } = parseResult.data;

  try {
    const schedule = await getScheduleForCountryAndDate(country.toUpperCase(), date);
    return NextResponse.json(
      { schedule },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("[api/tvmaze/schedule] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load the broadcast schedule for this date/region." },
      { status: 502 },
    );
  }
}
