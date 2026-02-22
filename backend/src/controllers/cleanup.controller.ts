import type { Request, Response } from "express";
import { getSupabaseClient } from "../config/supabase.js";

/**
 * Delete playground projects (and their files via CASCADE) that have expired (expires_at < now).
 * Playground data is temporary and removed after 24 hours; sessions are isolated by project id.
 */
export async function cleanupPlayground(_req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const { data: expired, error: selectError } = await supabase
      .from("projects")
      .select("id")
      .eq("is_playground", true)
      .not("expires_at", "is", null)
      .lt("expires_at", now);

    if (selectError) {
      res.status(500).json({ error: "Failed to list expired playground projects", details: selectError.message });
      return;
    }

    const ids = (expired ?? []).map((r) => r.id);
    if (ids.length === 0) {
      res.status(200).json({ deleted: 0, message: "No expired playground projects" });
      return;
    }

    const { error: deleteError } = await supabase.from("projects").delete().in("id", ids);

    if (deleteError) {
      res.status(500).json({ error: "Failed to delete expired playground projects", details: deleteError.message });
      return;
    }

    res.status(200).json({ deleted: ids.length, message: `Removed ${ids.length} expired playground project(s)` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Playground cleanup failed";
    res.status(500).json({ error: message });
  }
}
