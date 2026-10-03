"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLibrary } from "@/lib/useLibrary";
import { usePersonalBroadcast } from "@/lib/usePersonalBroadcast";
import { useWatchHistory } from "@/lib/useWatchHistory";

type LibraryHook = ReturnType<typeof useLibrary>;
type BroadcastHook = ReturnType<typeof usePersonalBroadcast>;
type WatchHistoryHook = ReturnType<typeof useWatchHistory>;

export interface AppDataContextValue {
  library: LibraryHook;
  personalBroadcast: BroadcastHook;
  watchHistory: WatchHistoryHook;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const personalBroadcast = usePersonalBroadcast();
  const watchHistory = useWatchHistory();

  return (
    <AppDataContext.Provider value={{ library, personalBroadcast, watchHistory }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return ctx;
}
