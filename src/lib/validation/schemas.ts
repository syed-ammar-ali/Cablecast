import { z } from "zod";

/**
 * Validates honeypot fields on public authentication/submission forms.
 * Returns true if the trap was triggered (i.e. filled by a bot).
 */
export function isHoneypotTriggered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

/**
 * Access Code Redemption Payload Schema
 */
export const RedeemAccessCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter an access code.")
    .max(64, "Code is too long."),
  displayName: z
    .string()
    .trim()
    .max(40, "Display name is too long.")
    .optional()
    .nullable(),
  disconnectSessionId: z
    .string()
    .trim()
    .optional()
    .nullable(),
  hp_auth: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
});

/**
 * Admin Login Payload Schema
 */
export const AdminLoginSchema = z.object({
  password: z
    .string()
    .min(1, "Password is required.")
    .max(256, "Password is too long."),
  displayName: z
    .string()
    .trim()
    .max(40, "Display name is too long.")
    .optional()
    .nullable(),
  hp_auth: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
});

/**
 * Admin Code Creation Schema
 */
export const AdminCreateCodeSchema = z.object({
  label: z
    .string()
    .trim()
    .max(80, "Label must be 80 characters or fewer.")
    .optional()
    .nullable(),
  expiresAt: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || !Number.isNaN(new Date(val).getTime()), {
      message: "Invalid expiration date format.",
    }),
  maxUses: z
    .number()
    .int("Max uses must be an integer.")
    .positive("Max uses must be greater than 0.")
    .max(100000, "Max uses cannot exceed 100,000.")
    .optional()
    .nullable(),
  maxDevices: z
    .number()
    .int("Max devices must be an integer.")
    .positive("Max devices must be greater than 0.")
    .max(100, "Max devices cannot exceed 100.")
    .optional()
    .nullable(),
  showIds: z.array(z.string().trim().max(100)).optional(),
});

/**
 * Code Creation Schema
 */
export const CreateAccessCodeSchema = z.object({
  label: z
    .string()
    .trim()
    .max(100, "Label is too long.")
    .optional()
    .nullable(),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .nullable(),
  customCode: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Code must be alphanumeric.")
    .optional()
    .nullable(),
});

/**
 * TMDB Query Sanitization Schema
 */
export const TmdbDetailsQuerySchema = z.object({
  tmdbId: z
    .string()
    .trim()
    .min(1, "`tmdbId` is required.")
    .max(32, "Invalid ID length.")
    .regex(/^[0-9]+$/, "`tmdbId` must be numeric."),
  mediaType: z.enum(["movie", "tv"]),
});

/**
 * Episode Code Lookup Schema
 */
export const EpisodeCodeLookupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "`code` query param is required.")
    .max(16, "Code is too long.")
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid code format."),
});

/**
 * TVmaze Schedule Query Schema
 */
export const TvmazeScheduleQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  country: z
    .string()
    .length(2, "Country code must be 2 characters")
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});
