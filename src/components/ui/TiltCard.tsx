"use client";

import React, { useRef, useState, useCallback, useTransition } from "react";

interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxTilt?: number;
  scale?: number;
  glare?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * 3D Parallax Tilt Card Component.
 * Imparts tangible physical realism to flat UI elements with dynamic 3D tilt
 * and interactive glare highlights tracking the user's mouse pointer.
 * Gracefully disables on touch devices to ensure ultra-smooth mobile scrolling.
 */
export function TiltCard({
  children,
  maxTilt = 7,
  scale = 1.02,
  glare = true,
  className = "",
  disabled = false,
  style,
  onMouseMove,
  onMouseLeave,
  ...rest
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [transformStyle, setTransformStyle] = useState<string>("");
  const [glareStyle, setGlareStyle] = useState<{ x: number; y: number; opacity: number }>({
    x: 50,
    y: 50,
    opacity: 0,
  });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onMouseMove?.(e);
      if (disabled || typeof window === "undefined") return;

      // Disable 3D tilt on touch devices
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        return;
      }

      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const xPct = mouseX / width - 0.5; // -0.5 to 0.5
      const yPct = mouseY / height - 0.5; // -0.5 to 0.5

      const rotateX = -(yPct * maxTilt * 2);
      const rotateY = xPct * maxTilt * 2;

      setTransformStyle(
        `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, 1)`
      );

      if (glare) {
        setGlareStyle({
          x: Math.round((mouseX / width) * 100),
          y: Math.round((mouseY / height) * 100),
          opacity: 0.12,
        });
      }
      setIsHovered(true);
    },
    [disabled, maxTilt, scale, glare, onMouseMove]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onMouseLeave?.(e);
      setTransformStyle("perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
      setGlareStyle((prev) => ({ ...prev, opacity: 0 }));
      setIsHovered(false);
    },
    [onMouseLeave]
  );

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative will-change-transform ${className}`}
      style={{
        transform: transformStyle || undefined,
        transition: isHovered
          ? "transform 0.08s ease-out"
          : "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        transformStyle: "preserve-3d",
        ...style,
      }}
      {...rest}
    >
      {children}

      {/* Interactive Glare / Lighting Sweep */}
      {glare && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: glareStyle.opacity,
            background: `radial-gradient(circle at ${glareStyle.x}% ${glareStyle.y}%, rgba(255, 255, 255, 0.35) 0%, transparent 60%)`,
          }}
        />
      )}
    </div>
  );
}
