"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2, ChevronDown, ChevronRight, Heart, Loader2, Play, Radio, RotateCcw, X } from "lucide-react";
import type { EpisodeSummary, MediaSearchResult, ShowDetails } from "@/types/media";

export interface EpisodeSelection {
  season?: number;
  episode?: number;
  startOffsetSeconds?: number;
}

interface MediaDetailsModalProps {
  media: MediaSearchResult;
  onClose: () => void;
  /** Opens the player for the movie itself, or for a specific season/episode of a show. */
  onPlay: (selection: EpisodeSelection) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (media: MediaSearchResult) => void;
  savedProgressSeconds?: number;
  onOpenScheduleBroadcast?: (media: MediaSearchResult, season?: number) => void;
  onOpenBroadcastStudio?: () => void;
  isScheduled?: boolean;
}

function formatRuntimeMinutes(minutes: number | undefined | null): string | null {
  if (!minutes) return null;
  return `${minutes}m`;
}

/** A single dark, custom-styled dropdown for picking the season — matches the player's source picker. */
function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: ShowDetails["seasons"];
  value: number;
  onChange: (season: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = seasons.find((season) => season.seasonNumber === value);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setIsOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
      >
        {current?.name || `Season ${value}`}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-2 max-h-72 w-56 overflow-y-auto rounded-md border border-neutral-700/60 bg-neutral-950 shadow-[0_0_24px_rgba(0,0,0,0.85)]">
          {seasons.map((season) => (
            <button
              key={season.seasonNumber}
              type="button"
              onClick={() => {
                onChange(season.seasonNumber);
                setIsOpen(false);
              }}
              className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
                season.seasonNumber === value ? "bg-white/10 text-white" : "text-neutral-300"
              }`}
            >
              {season.name || `Season ${season.seasonNumber}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EpisodeCard({
  episode,
  onSelect,
}: {
  episode: EpisodeSummary;
  onSelect: () => void;
}) {
  const runtimeLabel = formatRuntimeMinutes(episode.runtime?.exactMinutes);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-64 shrink-0 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 text-left transition-colors hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 sm:w-80"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
        {episode.stillUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={episode.stillUrl}
            alt={episode.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-700">
            <Play className="h-10 w-10" strokeWidth={1.5} />
          </div>
        )}

        {runtimeLabel && (
          <span className="absolute bottom-2 right-2 rounded-sm bg-black/80 px-1.5 py-0.5 text-xs text-neutral-300">
            {runtimeLabel}
          </span>
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/60">
            <Play className="h-5 w-5 text-white" fill="currentColor" />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="line-clamp-1 text-base font-semibold leading-tight text-neutral-100">
          {episode.episodeNumber}. {episode.name}
        </p>
        <p className="line-clamp-2 text-sm leading-snug text-neutral-500">{episode.overview || "No description available."}</p>
      </div>
    </button>
  );
}

export function MediaDetailsModal({
  media,
  onClose,
  onPlay,
  isFavorite,
  onToggleFavorite,
  savedProgressSeconds,
  onOpenScheduleBroadcast,
  onOpenBroadcastStudio,
  isScheduled,
}: MediaDetailsModalProps) {
  const isTv = media.mediaType === "tv";

  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [season, setSeason] = useState(1);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const episodeRailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [handleClose]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingDetails(true);
    setDetailsError(null);

    fetch(`/api/tmdb/details?tmdbId=${media.tmdbId}&mediaType=${media.mediaType}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load details (${res.status})`);
        return res.json() as Promise<ShowDetails>;
      })
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        setSeason(data.seasons[0]?.seasonNumber ?? 1);
      })
      .catch((error: Error) => {
        if (!cancelled) setDetailsError(error.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [media.tmdbId, media.mediaType]);

  useEffect(() => {
    if (!isTv || !details) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingEpisodes(true);

    fetch(`/api/tmdb/season?tmdbId=${media.tmdbId}&season=${season}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load season ${season}`);
        return res.json() as Promise<{ episodes: EpisodeSummary[] }>;
      })
      .then((data) => {
        if (!cancelled) setEpisodes(data.episodes);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEpisodes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isTv, details, media.tmdbId, season]);

  const scrollEpisodeRail = useCallback((direction: 1 | -1) => {
    episodeRailRef.current?.scrollBy({ left: direction * 640, behavior: "smooth" });
  }, []);

  const backdropUrl = details?.backdropUrl ?? media.backdropUrl;
  const posterUrl = details?.posterUrl ?? media.posterUrl;
  const overview = details?.overview || media.overview;
  const voteAverage = details?.voteAverage ?? media.voteAverage;

  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (voteAverage > 0) parts.push(`★ ${voteAverage.toFixed(1)}`);
    if (media.releaseYear) parts.push(media.releaseYear);
    if (details?.certification) parts.push(details.certification);
    if (isTv && details?.numberOfSeasons) {
      parts.push(`${details.numberOfSeasons} Season${details.numberOfSeasons === 1 ? "" : "s"}`);
    }
    if (details?.genres?.length) parts.push(details.genres.slice(0, 2).join(", "));
    if (details?.spokenLanguages?.length) {
      parts.push(`${details.spokenLanguages.length} Language${details.spokenLanguages.length === 1 ? "" : "s"}`);
    }
    return parts;
  }, [voteAverage, media.releaseYear, details, isTv]);

  const castLine = useMemo(() => {
    if (!details?.cast?.length) return null;
    return details.cast
      .slice(0, 8)
      .map((member) => (member.character ? `${member.name} (${member.character})` : member.name))
      .join(", ");
  }, [details]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black animate-in fade-in">
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close details"
        className="fixed right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700/60 bg-black/60 text-neutral-300 backdrop-blur-sm transition-colors hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      {isLoadingDetails ? (
        <div className="flex h-screen w-full items-center justify-center text-neutral-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          {/* Backdrop hero */}
          <div className="relative h-[52vh] min-h-[360px] w-full overflow-hidden bg-black">
            {backdropUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={backdropUrl}
                alt={media.title}
                className="absolute inset-0 h-full w-full object-cover opacity-70"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 flex items-end gap-5 p-6 sm:p-8">
              {posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={posterUrl}
                  alt=""
                  className="hidden h-40 w-28 shrink-0 rounded-md border border-neutral-700/60 object-cover shadow-[0_8px_30px_rgba(0,0,0,0.6)] sm:block sm:h-48 sm:w-32"
                />
              )}

              <div className="max-w-2xl">
                <h1 className="text-2xl font-bold uppercase tracking-wide text-white sm:text-4xl">
                  {media.title}
                </h1>

                {metaLine.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-wide text-neutral-300 sm:text-sm">
                    {metaLine.map((part, index) => (
                      <span key={`${part}-${index}`} className="flex items-center gap-2">
                        {index > 0 && <span className="text-neutral-600">·</span>}
                        <span className={part.startsWith("★") ? "text-amber-300" : undefined}>{part}</span>
                      </span>
                    ))}
                  </p>
                )}

                {overview && (
                  <p className="mt-3 line-clamp-3 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">
                    {overview}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onPlay(
                        isTv
                          ? {
                              season: details?.seasons[0]?.seasonNumber ?? 1,
                              episode: 1,
                              startOffsetSeconds: savedProgressSeconds,
                            }
                          : { startOffsetSeconds: savedProgressSeconds },
                      )
                    }
                    className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold uppercase tracking-widest text-black shadow-md transition-colors hover:bg-neutral-200 active:scale-95"
                  >
                    <Play className="h-4 w-4" fill="currentColor" />
                    {savedProgressSeconds && savedProgressSeconds > 30 ? "Resume" : "Play"}
                  </button>

                  {savedProgressSeconds && savedProgressSeconds > 30 && (
                    <button
                      type="button"
                      onClick={() =>
                        onPlay(
                          isTv
                            ? {
                                season: details?.seasons[0]?.seasonNumber ?? 1,
                                episode: 1,
                                startOffsetSeconds: 0,
                              }
                            : { startOffsetSeconds: 0 },
                        )
                      }
                      className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      From Start
                    </button>
                  )}

                  {onToggleFavorite && (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(media)}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all ${
                        isFavorite
                          ? "border-red-500/60 bg-neutral-900/80 text-red-400 hover:border-red-400 hover:text-red-300"
                          : "border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:border-neutral-500 hover:text-white"
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                      {isFavorite ? "In Favorites" : "Add to Favorites"}
                    </button>
                  )}

                  {(onOpenScheduleBroadcast || onOpenBroadcastStudio) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isScheduled) {
                          onOpenBroadcastStudio?.();
                        } else {
                          onOpenScheduleBroadcast?.(media, isTv ? season : undefined);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all ${
                        isScheduled
                          ? "border-purple-400/60 bg-purple-900/80 text-white hover:border-purple-300 shadow-sm"
                          : "border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:border-neutral-500 hover:text-white"
                      }`}
                    >
                      {isScheduled ? (
                        <CalendarCheck2 className="h-3.5 w-3.5 text-purple-300" />
                      ) : (
                        <Radio className="h-3.5 w-3.5 text-purple-400" />
                      )}
                      {isScheduled ? "Scheduled" : "Schedule Broadcast"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            {detailsError && (
              <p className="mb-6 rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {detailsError}
              </p>
            )}

            {/* Cast & crew */}
            {(castLine || details?.directors.length || details?.producers.length) && (
              <div className="mb-10 grid gap-6 border-t border-neutral-800 pt-6 sm:grid-cols-2">
                {(details?.directors.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-500">
                      {isTv ? "Creators" : "Directors"}
                    </p>
                    <p className="text-sm text-neutral-200">{details?.directors.join(", ")}</p>
                  </div>
                )}

                {(details?.producers.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-500">
                      Producers
                    </p>
                    <p className="text-sm text-neutral-200">{details?.producers.join(", ")}</p>
                  </div>
                )}

                {castLine && (
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-neutral-500">
                      Cast &amp; Characters
                    </p>
                    <p className="text-sm leading-relaxed text-neutral-200">{castLine}</p>
                  </div>
                )}
              </div>
            )}

            {/* Episodes */}
            {isTv && (
              <div className="border-t border-neutral-800 pt-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold uppercase tracking-wide text-white">Episodes</h2>
                  {details && details.seasons.length > 0 && (
                    <SeasonPicker seasons={details.seasons} value={season} onChange={setSeason} />
                  )}
                </div>

                <div className="relative">
                  {isLoadingEpisodes ? (
                    <div className="flex h-40 items-center justify-center text-neutral-500">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : episodes.length === 0 ? (
                    <p className="py-8 text-center text-sm uppercase tracking-widest text-neutral-600">
                      No episodes found for this season.
                    </p>
                  ) : (
                    <>
                      <div
                        ref={episodeRailRef}
                        className="no-scrollbar flex gap-5 overflow-x-auto scroll-smooth pb-2"
                      >
                        {episodes.map((episode) => (
                          <EpisodeCard
                            key={episode.episodeNumber}
                            episode={episode}
                            onSelect={() => onPlay({ season, episode: episode.episodeNumber })}
                          />
                        ))}
                      </div>

                      {episodes.length > 2 && (
                        <button
                          type="button"
                          onClick={() => scrollEpisodeRail(1)}
                          aria-label="Scroll episodes right"
                          className="absolute -right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-700/60 bg-black/80 text-neutral-300 backdrop-blur-sm transition-colors hover:text-white sm:flex"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
