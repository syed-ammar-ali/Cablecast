/** Name of the single opaque-token cookie that gates the whole app. */
export const SESSION_COOKIE_NAME = "cc_session";

/** 30 days — refreshed on every successful redeem/login, not on activity. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Role = "admin" | "user";
