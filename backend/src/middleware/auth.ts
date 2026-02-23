import type { Request, Response, NextFunction } from "express";
import { getSupabaseClient } from "../config/supabase.js";
import type { User } from "../types/api.types.js";
import { unauthorized } from "../utils/errors.js";
import { SESSION_COOKIE_NAME } from "../utils/authCookie.js";

/** Prefer cookie (HttpOnly), then Authorization Bearer. Exported for controllers that need the token (e.g. profile). */
export function getAccessToken(req: Request): string | undefined {
  const fromCookie =
    req.cookies && typeof req.cookies[SESSION_COOKIE_NAME] === "string"
      ? (req.cookies[SESSION_COOKIE_NAME] as string)
      : undefined;
  if (fromCookie) return fromCookie;
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}

/**
 * Extracts token from cookie (preferred) or Bearer header and verifies with Supabase; sets req.user.
 * If no token or invalid token, req.user is null (does not send 401).
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const fromCookie =
    req.cookies && typeof req.cookies[SESSION_COOKIE_NAME] === "string";
  const fromHeader = req.headers.authorization?.startsWith("Bearer ");
  const token = getAccessToken(req);

  if (!token) {
    if (req.method !== "OPTIONS" && (req.path === "/auth/session" || req.path.startsWith("/builder") || req.path === "/profile")) {
      console.log("[auth] optionalAuth: no token", req.method, req.path, "cookie:", !!fromCookie, "header:", !!fromHeader);
    }
    req.user = null;
    next();
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !authUser) {
      if (error) console.error("[auth] getUser error:", error.message);
      if (req.method !== "OPTIONS") {
        console.log("[auth] optionalAuth: token invalid or expired", req.method, req.path, "source:", fromCookie ? "cookie" : "header");
      }
      req.user = null;
      next();
      return;
    }

    const user: User = {
      id: authUser.id,
      email: authUser.email ?? "",
      name:
        (authUser.user_metadata?.full_name as string) ??
        (authUser.user_metadata?.name as string) ??
        authUser.email?.split("@")[0] ??
        "",
    };
    req.user = user;
    if (req.method !== "OPTIONS" && (req.path === "/auth/session" || req.path.startsWith("/builder") || req.path === "/profile")) {
      console.log("[auth] optionalAuth: OK", req.method, req.path, "user:", user.id, "source:", fromCookie ? "cookie" : "header");
    }
    next();
  } catch (err) {
    console.error("[auth] optionalAuth exception:", err);
    req.user = null;
    next();
  }
}

/**
 * Requires req.user to be set (use after optionalAuth).
 * Sends 401 if req.user is null.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.user == null) {
    console.error("[auth] requireAuth: no user on request", req.method, req.path);
    next(unauthorized("Authentication required"));
    return;
  }
  next();
}
