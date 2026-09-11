"use client";

import React from "react";
import type { FilterState } from "./FilterBar";

export interface MoodPreset {
  id: string;
  name: string;
  tagline: string;
  gradient: string;
  borderHover: string;
  apply: (prev: FilterState) => FilterState;
  matches: (current: FilterState) => boolean;
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: "late-night",
    name: "Late Night Noir",
    tagline: "Gritty crime mysteries & neon-lit thrillers",
    gradient: "from-indigo-950/80 via-purple-950/50 to-neutral-950",
    borderHover: "hover:border-indigo-400/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [80], // Crime
      minRating: 7.0,
      seasons: [],
      eras: [],
    }),
    matches: (c) => c.genreIds.includes(80) && c.minRating === 7.0,
  },
  {
    id: "feel-good",
    name: "Feel-Good 90s",
    tagline: "Heartwarming comedies & nostalgic family classics",
    gradient: "from-amber-950/80 via-orange-950/40 to-neutral-950",
    borderHover: "hover:border-amber-400/60 hover:shadow-[0_0_20px_rgba(251,191,36,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [35], // Comedy
      eras: ["90s"],
      seasons: [],
      minRating: null,
    }),
    matches: (c) => c.genreIds.includes(35) && c.eras.includes("90s"),
  },
  {
    id: "mind-bending",
    name: "Mind-Bending Sci-Fi",
    tagline: "Cosmic enigmas & psychological mysteries",
    gradient: "from-cyan-950/80 via-sky-950/40 to-neutral-950",
    borderHover: "hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [878], // Sci-Fi
      minRating: 7.5,
      seasons: [],
      eras: [],
    }),
    matches: (c) => c.genreIds.includes(878) && c.minRating === 7.5,
  },
  {
    id: "high-adrenaline",
    name: "High Adrenaline",
    tagline: "Relentless set-pieces & explosive blockbusters",
    gradient: "from-rose-950/80 via-red-950/50 to-neutral-950",
    borderHover: "hover:border-rose-400/60 hover:shadow-[0_0_20px_rgba(244,63,94,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [28], // Action
      minRating: 7.0,
      seasons: [],
      eras: [],
    }),
    matches: (c) => c.genreIds.includes(28) && c.minRating === 7.0,
  },
  {
    id: "spooky-autumn",
    name: "Spooky Autumn",
    tagline: "Gothic chills, autumn dread & Halloween lore",
    gradient: "from-orange-950/80 via-amber-950/60 to-neutral-950",
    borderHover: "hover:border-orange-500/60 hover:shadow-[0_0_20px_rgba(249,115,22,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [27], // Horror
      seasons: ["fall"],
      eras: [],
      minRating: null,
    }),
    matches: (c) => c.genreIds.includes(27) && c.seasons.includes("fall"),
  },
  {
    id: "vhs-golden-era",
    name: "VHS Golden Era",
    tagline: "80s rental royalty & analog cult tapes",
    gradient: "from-fuchsia-950/80 via-pink-950/40 to-neutral-950",
    borderHover: "hover:border-fuchsia-400/60 hover:shadow-[0_0_20px_rgba(217,70,239,0.25)]",
    apply: (prev) => ({
      ...prev,
      eras: ["80s"],
      minRating: 7.5,
      genreIds: [],
      seasons: [],
    }),
    matches: (c) => c.eras.includes("80s") && c.minRating === 7.5,
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk & Dystopia",
    tagline: "High-tech synthscapes & futuristic underworlds",
    gradient: "from-teal-950/80 via-cyan-950/50 to-neutral-950",
    borderHover: "hover:border-teal-400/60 hover:shadow-[0_0_20px_rgba(45,212,191,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [878],
      eras: ["90s"],
      minRating: 7.0,
      seasons: [],
    }),
    matches: (c) => c.genreIds.includes(878) && c.eras.includes("90s") && c.minRating === 7.0,
  },
  {
    id: "cozy-winter",
    name: "Cozy Winter Classics",
    tagline: "Warm fireplaces, festive snow & winter comfort",
    gradient: "from-blue-950/80 via-indigo-950/50 to-neutral-950",
    borderHover: "hover:border-blue-400/60 hover:shadow-[0_0_20px_rgba(96,165,250,0.25)]",
    apply: (prev) => ({
      ...prev,
      seasons: ["winter"],
      genreIds: [10751], // Family
      eras: [],
      minRating: null,
    }),
    matches: (c) => c.seasons.includes("winter") && c.genreIds.includes(10751),
  },
  {
    id: "edge-of-seat-thrillers",
    name: "Edge-of-Your-Seat Thrills",
    tagline: "Twisting conspiracies & psychological suspense",
    gradient: "from-red-950/80 via-zinc-950/60 to-neutral-950",
    borderHover: "hover:border-red-400/60 hover:shadow-[0_0_20px_rgba(248,113,113,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [53], // Thriller
      minRating: 7.5,
      seasons: [],
      eras: [],
    }),
    matches: (c) => c.genreIds.includes(53) && c.minRating === 7.5,
  },
  {
    id: "saturday-cartoons",
    name: "Saturday Morning Nostalgia",
    tagline: "Timeless animated gems & comfort classics",
    gradient: "from-emerald-950/80 via-teal-950/40 to-neutral-950",
    borderHover: "hover:border-emerald-400/60 hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreIds: [16], // Animation
      minRating: 7.0,
      seasons: [],
      eras: [],
    }),
    matches: (c) => c.genreIds.includes(16) && c.minRating === 7.0,
  },
  {
    id: "classic-cinema",
    name: "Classic 70s Cinema",
    tagline: "Gritty auteur filmmaking & golden-age drama",
    gradient: "from-stone-900/90 via-amber-950/40 to-neutral-950",
    borderHover: "hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]",
    apply: (prev) => ({
      ...prev,
      eras: ["70s"],
      minRating: 7.5,
      genreIds: [],
      seasons: [],
    }),
    matches: (c) => c.eras.includes("70s") && c.minRating === 7.5,
  },
  {
    id: "summer-road-trip",
    name: "Summer Road Trip",
    tagline: "Sun-soaked adventures & freewheeling comedy",
    gradient: "from-yellow-950/80 via-amber-950/50 to-neutral-950",
    borderHover: "hover:border-yellow-400/60 hover:shadow-[0_0_20px_rgba(250,204,21,0.25)]",
    apply: (prev) => ({
      ...prev,
      seasons: ["summer"],
      genreIds: [35], // Comedy
      eras: [],
      minRating: null,
    }),
    matches: (c) => c.seasons.includes("summer") && c.genreIds.includes(35),
  },
  {
    id: "monsoon-rain",
    name: "Monsoon Rain & Chill",
    tagline: "Rainy day solace, storm-swept drama & cozy cinema",
    gradient: "from-sky-950/80 via-slate-900/60 to-neutral-950",
    borderHover: "hover:border-sky-400/60 hover:shadow-[0_0_20px_rgba(56,189,248,0.25)]",
    apply: (prev) => ({
      ...prev,
      seasons: ["monsoon"],
      genreIds: [18], // Drama
      eras: [],
      minRating: null,
    }),
    matches: (c) => c.seasons.includes("monsoon") && c.genreIds.includes(18),
  },
];

interface MoodPresetsProps {
  filters: FilterState;
  onSelectMood: (updater: (prev: FilterState) => FilterState) => void;
}

export function MoodPresets({ filters, onSelectMood }: MoodPresetsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Curated Mood Presets
        </span>
        <span className="text-[11px] font-mono text-neutral-500">
          {MOOD_PRESETS.length} vibes
        </span>
      </div>

      {/* Horizontal scrolling mood cards without icons */}
      <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1 pt-0.5">
        {MOOD_PRESETS.map((mood) => {
          const isActive = mood.matches(filters);

          return (
            <button
              key={mood.id}
              type="button"
              onClick={() => {
                if (isActive) {
                  onSelectMood(() => ({
                    type: "all",
                    genreIds: [],
                    seasons: [],
                    eras: [],
                    minRating: null,
                    sortBy: "popularity.desc",
                    languages: [],
                  }));
                } else {
                  onSelectMood(mood.apply);
                }
              }}
              className={`group relative flex w-60 shrink-0 flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-300 bg-gradient-to-br cursor-pointer ${
                mood.gradient
              } ${mood.borderHover} ${
                isActive
                  ? "border-cyan-400/70 shadow-[0_0_22px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/50"
                  : "border-neutral-800/80 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400/80">
                  Preset Vibe
                </span>
                {isActive ? (
                  <span className="flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/40 shadow-sm">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    Apply →
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-1">
                <h4 className="text-sm font-semibold tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                  {mood.name}
                </h4>
                <p className="line-clamp-2 text-[11px] text-neutral-400 leading-snug">
                  {mood.tagline}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
