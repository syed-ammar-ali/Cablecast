"use client";

import React from "react";
import { Sparkles, Moon, Laugh, Brain, Zap, Ghost, CassetteTape } from "lucide-react";
import type { FilterState } from "./FilterBar";

export interface MoodPreset {
  id: string;
  name: string;
  tagline: string;
  icon: React.ElementType;
  gradient: string;
  borderHover: string;
  apply: (prev: FilterState) => FilterState;
  matches: (current: FilterState) => boolean;
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: "late-night",
    name: "Late Night Noir",
    tagline: "Neon-lit thrillers & gritty crime mysteries",
    icon: Moon,
    gradient: "from-indigo-950/80 via-purple-950/50 to-neutral-950",
    borderHover: "hover:border-indigo-400/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreId: 80, // Crime
      minRating: 7.0,
      season: null,
      era: null,
    }),
    matches: (c) => c.genreId === 80 && c.minRating === 7.0,
  },
  {
    id: "feel-good",
    name: "Feel-Good 90s",
    tagline: "Heartwarming comedies & family classics",
    icon: Laugh,
    gradient: "from-amber-950/80 via-orange-950/40 to-neutral-950",
    borderHover: "hover:border-amber-400/60 hover:shadow-[0_0_20px_rgba(251,191,36,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreId: 35, // Comedy
      era: "90s",
      season: null,
      minRating: null,
    }),
    matches: (c) => c.genreId === 35 && c.era === "90s",
  },
  {
    id: "mind-bending",
    name: "Mind-Bending",
    tagline: "Sci-Fi enigmas & psychological mysteries",
    icon: Brain,
    gradient: "from-cyan-950/80 via-sky-950/40 to-neutral-950",
    borderHover: "hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreId: 878, // Sci-Fi
      minRating: 7.5,
      season: null,
      era: null,
    }),
    matches: (c) => c.genreId === 878 && c.minRating === 7.5,
  },
  {
    id: "high-adrenaline",
    name: "High Adrenaline",
    tagline: "Explosive action & relentless set-pieces",
    icon: Zap,
    gradient: "from-rose-950/80 via-red-950/50 to-neutral-950",
    borderHover: "hover:border-rose-400/60 hover:shadow-[0_0_20px_rgba(244,63,94,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreId: 28, // Action
      minRating: 7.0,
      season: null,
      era: null,
    }),
    matches: (c) => c.genreId === 28 && c.minRating === 7.0,
  },
  {
    id: "spooky-autumn",
    name: "Spooky Autumn",
    tagline: "Gothic chills, autumn wind & Halloween lore",
    icon: Ghost,
    gradient: "from-orange-950/80 via-amber-950/60 to-neutral-950",
    borderHover: "hover:border-orange-500/60 hover:shadow-[0_0_20px_rgba(249,115,22,0.25)]",
    apply: (prev) => ({
      ...prev,
      genreId: 27, // Horror
      season: "fall",
      era: null,
    }),
    matches: (c) => c.genreId === 27 && c.season === "fall",
  },
  {
    id: "90s-cult",
    name: "VHS Golden Era",
    tagline: "Top-tier 1990–1999 video store royalty",
    icon: CassetteTape,
    gradient: "from-fuchsia-950/80 via-pink-950/40 to-neutral-950",
    borderHover: "hover:border-fuchsia-400/60 hover:shadow-[0_0_20px_rgba(217,70,239,0.25)]",
    apply: (prev) => ({
      ...prev,
      era: "90s",
      minRating: 8.0,
      genreId: null,
      season: null,
    }),
    matches: (c) => c.era === "90s" && c.minRating === 8.0,
  },
];

interface MoodPresetsProps {
  filters: FilterState;
  onSelectMood: (updater: (prev: FilterState) => FilterState) => void;
}

export function MoodPresets({ filters, onSelectMood }: MoodPresetsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Tune Into a Vibe
        </span>
      </div>

      {/* Horizontal scrolling mood cards */}
      <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1 pt-0.5">
        {MOOD_PRESETS.map((mood) => {
          const Icon = mood.icon;
          const isActive = mood.matches(filters);

          return (
            <button
              key={mood.id}
              type="button"
              onClick={() => onSelectMood(mood.apply)}
              className={`group relative flex w-60 shrink-0 flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-300 bg-gradient-to-br ${
                mood.gradient
              } ${mood.borderHover} ${
                isActive
                  ? "border-cyan-400/70 shadow-[0_0_22px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/50"
                  : "border-neutral-800/80 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 backdrop-blur-md transition-transform duration-300 group-hover:scale-110 ${
                    isActive ? "text-cyan-300" : "text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/40">
                    Active
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-0.5">
                <h4 className="text-sm font-semibold tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                  {mood.name}
                </h4>
                <p className="line-clamp-1 text-[11px] text-neutral-400">
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
