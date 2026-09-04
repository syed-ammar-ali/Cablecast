"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Radio, Search, ShieldCheck } from "lucide-react";

interface BottomNavProps {
  onOpenBroadcastStudio: () => void;
  onOpenLibrary: () => void;
  onToggleSearch: () => void;
  missedBroadcastCount?: number;
  isBroadcastStudioOpen?: boolean;
  isLibraryOpen?: boolean;
  isSearchActive?: boolean;
}

export function BottomNav({
  onOpenBroadcastStudio,
  onOpenLibrary,
  onToggleSearch,
  missedBroadcastCount,
  isBroadcastStudioOpen = false,
  isLibraryOpen = false,
  isSearchActive = false,
}: BottomNavProps) {
  const pathname = usePathname();
  const isAdminActive = pathname === "/admin" || pathname?.startsWith("/admin");

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 block md:hidden border-t border-neutral-900/90 bg-neutral-950/95 backdrop-blur-xl pb-[max(0.375rem,env(safe-area-inset-bottom,0.375rem))] pt-1.5 shadow-2xl shadow-black"
    >
      <div className="grid grid-cols-4 items-center px-1">
        {/* 1. Admin */}
        <Link
          href="/admin"
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 ${isAdminActive
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

        {/* 2. Broadcast */}
        <button
          type="button"
          onClick={onOpenBroadcastStudio}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 ${
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
          onClick={onOpenLibrary}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 ${
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

        {/* 4. Search */}
        <button
          type="button"
          onClick={onToggleSearch}
          className={`group flex flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95 ${
            isSearchActive
              ? "text-cyan-400 font-semibold"
              : "text-neutral-400 hover:text-cyan-400"
          }`}
          title="Search Movies & TV Shows"
        >
          <div className="relative flex items-center justify-center">
            <Search className="h-5 w-5 transition-transform group-hover:scale-110 group-active:scale-95" />
          </div>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
            Search
          </span>
        </button>
      </div>
    </nav>
  );
}
