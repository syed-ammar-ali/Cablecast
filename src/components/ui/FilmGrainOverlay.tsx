"use client";

import React, { memo } from "react";

/**
 * Global Film Grain & Cinematic Vignette Overlay.
 * Injected at the root layer to provide an authentic 90s analog broadcast texture.
 * Completely pointer-events-none so it introduces zero touch or click overhead.
 */
export const FilmGrainOverlay = memo(function FilmGrainOverlay() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-40 overflow-hidden select-none"
    >
      {/* 1. Mathematical SVG Film Grain Noise */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.032] mix-blend-screen"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="cablecast-film-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.75"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cablecast-film-grain)" />
      </svg>

      {/* 2. CRT Glass Scanline Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.22)_50%)] bg-[length:100%_4px] opacity-20" />

      {/* 3. Deep Cinematic Peripheral Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_62%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  );
});
