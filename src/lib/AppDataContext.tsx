"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLibrary } from "@/lib/useLibrary";
import { usePersonalBroadcast } from "@/lib/usePersonalBroadcast";

type LibraryHook = ReturnType<typeof useLibrary>;
type BroadcastHook = ReturnType<typeof usePersonalBroadcast>;

export interface AppDataContextValue {
  library: LibraryHook;
  personalBroadcast: BroadcastHook;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const personalBroadcast = usePersonalBroadcast();

  return (
    <AppDataContext.Provider value={{ library, personalBroadcast }}>
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
