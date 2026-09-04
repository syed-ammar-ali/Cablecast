"use client";

import { Clapperboard, Heart, Star, Tv } from "lucide-react";
import type { MediaSearchResult } from "@/types/media";

interface MediaCardProps {
  media: MediaSearchResult;
  onSelect: (media: MediaSearchResult) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (media: MediaSearchResult) => void;
}

export function MediaCard({ media, onSelect, isFavorite, onToggleFavorite }: MediaCardProps) {
  const TypeIcon = media.mediaType === "movie" ? Clapperboard : Tv;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(media)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(media);
        }
      }}
      className="group relative flex flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 text-left transition-colors duration-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 cursor-pointer"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-900">
        {media.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.posterUrl}
            alt={media.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-600">
            <TypeIcon className="h-10 w-10" strokeWidth={1.5} />
            <span className="px-2 text-center text-xs uppercase tracking-wide">No Signal</span>
          </div>
        )}

        {/* Media type badge */}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-black/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-300">
          <TypeIcon className="h-3 w-3" />
          {media.mediaType}
        </div>

        {/* Rating badge */}
        {media.voteAverage > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-sm bg-black/80 px-2 py-0.5 text-[10px] text-amber-300">
            <Star className="h-3 w-3 fill-current" />
            {media.voteAverage.toFixed(1)}
          </div>
        )}

        {/* Favorite quick toggle button */}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(media);
            }}
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all ${
              isFavorite
                ? "bg-black/80 text-red-500 opacity-100 shadow-md"
                : "bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-black/90"
            }`}
          >
            <Heart
              className={`h-4 w-4 transition-transform active:scale-125 ${
                isFavorite ? "fill-red-500 text-red-500" : ""
              }`}
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-neutral-800 bg-black p-2.5">
        <p className="line-clamp-2 text-sm font-semibold leading-tight text-neutral-100">{media.title}</p>
        <span className="mt-auto text-[11px] text-neutral-500">{media.releaseYear ?? "—"}</span>
      </div>
    </div>
  );
}
