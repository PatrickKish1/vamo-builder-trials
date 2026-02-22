import type { Request, Response } from "express";
import { getSupabaseClientWithAuth } from "../config/supabase.js";
import { unauthorized } from "../utils/errors.js";

function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  pineapple_balance: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /profile – returns the authenticated user's profile including pineapple_balance.
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) {
    console.error("[profile] GET /profile: No Bearer token");
    throw unauthorized("Authentication required");
  }
  if (!req.user?.id) {
    console.error("[profile] GET /profile: req.user missing (userId not set after auth)");
    throw unauthorized("User not found");
  }

  console.log("[profile] Fetching profile for user:", req.user.id);
  const supabase = getSupabaseClientWithAuth(token);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, is_admin, pineapple_balance, created_at, updated_at")
    .eq("id", req.user.id)
    .single();

  if (error) {
    console.error("[profile] Supabase error:", error.code, error.message, "userId:", req.user.id);
    res.status(error.code === "PGRST116" ? 404 : 500).json({
      error: { code: "PROFILE_ERROR", message: error.message },
    });
    return;
  }

  console.log("[profile] Profile found for user:", req.user.id);
  res.json({
    profile: data as ProfileRow,
  });
}
