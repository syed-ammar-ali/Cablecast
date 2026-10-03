"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: "top" | "bottom" | "left" | "right";
  delayMs?: number;
  className?: string;
}

/**
 * Retro Glassmorphic Tooltip Component.
 * Replaces native slow browser tooltips with instant, glowing, styled badges.
 */
export function Tooltip({
  content,
  children,
  position = "top",
  delayMs = 180,
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  }, [delayMs]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[position];

  if (!content) return children;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute z-[150] whitespace-nowrap rounded-md border border-neutral-700/80 bg-neutral-950/95 px-2 py-1 text-[10.5px] font-mono font-medium text-neutral-200 shadow-xl shadow-black/80 backdrop-blur-md animate-in fade-in duration-150 ${positionClasses} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
