/**
 * Triggers subtle tactile haptic feedback on mobile devices that support the Vibration API.
 * Gracefully degrades (no-op) on unsupported browsers (e.g. desktop).
 */
export function triggerHaptic(durationMs = 12): void {
  if (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Non-fatal if vibration is restricted by browser policy
    }
  }
}
