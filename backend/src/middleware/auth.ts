import type { Request, Response, NextFunction } from "express";
import { getSupabaseClient } from "../config/supabase.js";
import type { User } from "../types/api.types.js";
import { unauthorized } from "../utils/errors.js";

/**
 * Extracts Bearer token and verifies with Supabase; sets req.user.
 * If no token or invalid token, req.user is null (does not send 401).
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
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
    next();
  } catch {
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
