"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Radio, Search, ShieldCheck, Tv } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface BottomNavProps {
  isAdmin?: boolean;
  onGoHome?: () => void;
  onOpenBroadcastStudio: () => void;
  onOpenLibrary: () => void;
  onToggleSearch: () => void;
  missedBroadcastCount?: number;
  isHomeActive?: boolean;
  isBroadcastStudioOpen?: boolean;
  isLibraryOpen?: boolean;
  isSearchActive?: boolean;
}

export function BottomNav({
  isAdmin: isAdminProp,
  onGoHome,
  onOpenBroadcastStudio,
  onOpenLibrary,
  onToggleSearch,
  missedBroadcastCount,
  isHomeActive = false,
  isBroadcastStudioOpen = false,
  isLibraryOpen = false,
  isSearchActive = false,
}: BottomNavProps) {
  const pathname = usePathname();
  const isAdminActive = pathname === "/admin" || pathname?.startsWith("/admin");
  const [isAdmin, setIsAdmin] = useState(isAdminProp ?? false);

  useEffect(() => {
    if (isAdminProp !== undefined) {
      setIsAdmin(isAdminProp);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { role?: string | null }) => {
        if (!cancelled && data?.role === "admin") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdminProp]);

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 block md:hidden border-t border-neutral-900/90 bg-neutral-950/95 backdrop-blur-xl pb-[max(0.375rem,env(safe-area-inset-bottom,0.375rem))] pt-1.5 shadow-2xl shadow-black"
    >
      <div className={`grid items-center px-1 ${isAdmin ? "grid-cols-5" : "grid-cols-4"}`}>
        {/* 1. Home */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            onGoHome?.();
          }}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 cursor-pointer ${
            isHomeActive
              ? "text-red-500 font-semibold"
              : "text-neutral-400 hover:text-red-400"
          }`}
          title="Home (Live TV & EPG Guide)"
        >
          <div className="relative flex items-center justify-center">
            <Tv className="h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95" />
          </div>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
            Home
          </span>
        </button>

        {/* 2. Broadcast */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            onOpenBroadcastStudio();
          }}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 cursor-pointer ${
            isBroadcastStudioOpen
              ? "text-purple-400 font-semibold"
              : "text-neutral-400 hover:text-purple-400"
          }`}
          title="Broadcast Studio (My Lineup & Reruns)"
        >
          <div className="relative flex items-center justify-center">
            <Radio className="h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95" />
            {missedBroadcastCount != null && missedBroadcastCount > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold text-white shadow-lg">
                {missedBroadcastCount}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
            Broadcast
          </span>
        </button>

        {/* 3. Library */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            onOpenLibrary();
          }}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 cursor-pointer ${
            isLibraryOpen
              ? "text-yellow-400 font-semibold"
              : "text-neutral-400 hover:text-yellow-400"
          }`}
          title="My Library (Favorites & History)"
        >
          <div className="relative flex items-center justify-center">
            <Bookmark className="h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95" />
          </div>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
            Library
          </span>
        </button>

        {/* 4. Explore */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            onToggleSearch();
          }}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 cursor-pointer ${
            isSearchActive
              ? "text-cyan-400 font-semibold"
              : "text-neutral-400 hover:text-cyan-400"
          }`}
          title="Explore Movies, TV Shows & Specials"
        >
          <div className="relative flex items-center justify-center">
            <Search className="h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95" />
          </div>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
            Explore
          </span>
        </button>

        {/* 5. Admin (only rendered if authenticated as admin) */}
        {isAdmin && (
          <Link
            href="/admin"
            onClick={() => triggerHaptic(10)}
            className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 cursor-pointer ${
              isAdminActive
                ? "text-emerald-400 font-semibold"
                : "text-neutral-400 hover:text-emerald-400"
            }`}
            title="Admin Station Control"
          >
            <div className="relative flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95" />
            </div>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
              Admin
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
