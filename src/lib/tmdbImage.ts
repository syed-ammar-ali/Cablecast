/**
 * TMDB image URL builder. Deliberately isomorphic — no `server-only` import
 * — so client components can turn a stored `posterPath` back into a
 * displayable URL without pulling in the server-only TMDB fetch client.
 */
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export function buildImageUrl(
  path: string | null | undefined,
  size: string = "w342",
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}
