import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The standard shadcn/ui `cn` helper: merges conditional class lists
 * (`clsx`) and then resolves conflicting Tailwind utilities so the last one
 * wins instead of both being emitted (`tailwind-merge`). Kept in
 * `src/lib/utils.ts` — the conventional location every shadcn-style
 * component's `@/lib/utils` import expects — so future copy-pasted
 * components resolve without edits.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
