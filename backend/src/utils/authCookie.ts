import type { Response } from "express";
import { env } from "../config/env.js";

export const SESSION_COOKIE_NAME = "sessionToken";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Set HttpOnly session cookie with the JWT.
 * Secure in production, SameSite=Lax to allow top-level redirects (e.g. OAuth).
 */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SEVEN_DAYS_MS / 1000),
  });
}

/** Clear the session cookie (e.g. on logout). */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
  });
}
