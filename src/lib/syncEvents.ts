"use client";

/**
 * Global User Mutation Events.
 * 
 * CRITICAL RULE:
 * These events must ONLY be dispatched when a user performs a write/mutation action
 * (e.g. buying a tape, renting a tape, deleting an item, scheduling a broadcast).
 * 
 * They must NEVER be dispatched inside fetch() handlers or useEffect() callbacks
 * to avoid infinite recursive request loops.
 */

export const CABLECAST_LIBRARY_MUTATION = "cablecast:library_mutation";
export const CABLECAST_BROADCAST_MUTATION = "cablecast:broadcast_mutation";
export const CABLECAST_ADMIN_MUTATION = "cablecast:admin_mutation";

let libraryTimer: ReturnType<typeof setTimeout> | null = null;
export function notifyLibraryMutation() {
  if (typeof window === "undefined") return;
  if (libraryTimer) clearTimeout(libraryTimer);
  libraryTimer = setTimeout(() => {
    window.dispatchEvent(new Event(CABLECAST_LIBRARY_MUTATION));
  }, 100);
}

let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
export function notifyBroadcastMutation() {
  if (typeof window === "undefined") return;
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    window.dispatchEvent(new Event(CABLECAST_BROADCAST_MUTATION));
  }, 100);
}

let adminTimer: ReturnType<typeof setTimeout> | null = null;
export function notifyAdminMutation() {
  if (typeof window === "undefined") return;
  if (adminTimer) clearTimeout(adminTimer);
  adminTimer = setTimeout(() => {
    window.dispatchEvent(new Event(CABLECAST_ADMIN_MUTATION));
  }, 100);
}
