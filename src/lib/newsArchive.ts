import "server-only";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";

interface ArchiveSearchDoc {
  identifier: string;
  title?: string;
  date?: string;
}

interface ArchiveSearchResponse {
  response?: {
    docs?: ArchiveSearchDoc[];
  };
}

async function runSearch(query: string): Promise<ArchiveSearchDoc | null> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "date");
  params.append("sort[]", "date desc");
  params.set("rows", "1");
  params.set("page", "1");
  params.set("output", "json");

  try {
    const res = await fetch(`${ARCHIVE_SEARCH_URL}?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as ArchiveSearchResponse;
    return data.response?.docs?.[0] ?? null;
  } catch (error) {
    console.error("[lib/newsArchive] search request failed:", error);
    return null;
  }
}

export interface NewsArchiveMatch {
  embedUrl: string;
  label: string;
  /** e.g. "CNN Newsroom : CNNW : August 29, 2026 3:00pm-4:00pm PDT" — shown so it's clear this is a recording, not live. */
  sourceTitle: string;
}

/**
 * Searches the Internet Archive's public, keyless TV News Archive
 * (https://archive.org/details/tv) for a recorded broadcast segment from
 * the given network — a real, freely-streamable archive of US and
 * international TV news maintained by the Internet Archive for research
 * and citation. Tries the exact broadcast day first (matching TVmaze's
 * `airdate`), then falls back to the network's most recent recording of
 * any date rather than returning nothing.
 */
export async function searchNewsArchive(
  networkName: string,
  airdate: string,
): Promise<NewsArchiveMatch | null> {
  const quotedNetwork = `"${networkName.replace(/"/g, "")}"`;

  const sameDayQuery = `collection:(tvnews) AND ${quotedNetwork} AND date:[${airdate}T00:00:00Z TO ${airdate}T23:59:59Z]`;
  let doc = await runSearch(sameDayQuery);

  if (!doc) {
    const anyDateQuery = `collection:(tvnews) AND ${quotedNetwork}`;
    doc = await runSearch(anyDateQuery);
  }

  if (!doc?.identifier) return null;

  return {
    embedUrl: `https://archive.org/embed/${doc.identifier}`,
    label: "News Archive Recording",
    sourceTitle: doc.title ?? doc.identifier,
  };
}
