import type { Request, Response } from "express";
import { getSupabaseClientWithAuth } from "../config/supabase.js";
import { unauthorized, forbidden, badRequest } from "../utils/errors.js";

function getAccessToken(req: Request): string {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) throw unauthorized("Authentication required");
  return token;
}

async function assertAdmin(req: Request, token: string): Promise<void> {
  if (!req.user?.id) throw unauthorized("User not found");
  const supabase = getSupabaseClientWithAuth(token);
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", req.user.id)
    .single();
  if (!(data as { is_admin?: boolean } | null)?.is_admin) {
    throw forbidden("Admin access required");
  }
}

/**
 * GET /admin/stats – overview dashboard counts.
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  await assertAdmin(req, token);
  const supabase = getSupabaseClientWithAuth(token);

  const [usersRes, projectsRes, ledgerRes, redeemedRes, listingsRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("builder_projects").select("id", { count: "exact", head: true }),
    supabase.from("reward_ledger").select("reward_amount", { count: "exact" }).gt("reward_amount", 0),
    supabase.from("reward_ledger").select("reward_amount").lt("reward_amount", 0),
    supabase.from("builder_projects").select("id", { count: "exact", head: true }).eq("status", "listed"),
  ]);

  const totalPineapplesEarned = (ledgerRes.data ?? []).reduce(
    (sum: number, r: { reward_amount: number }) => sum + (r.reward_amount ?? 0),
    0
  );
  const totalPineapplesRedeemed = (redeemedRes.data ?? []).reduce(
    (sum: number, r: { reward_amount: number }) => sum + Math.abs(r.reward_amount ?? 0),
    0
  );

  const { count: pendingRedemptions } = await supabase
    .from("redemptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  res.json({
    totalUsers: usersRes.count ?? 0,
    totalProjects: projectsRes.count ?? 0,
    totalPineapplesEarned,
    totalPineapplesRedeemed,
    activeListings: listingsRes.count ?? 0,
    pendingRedemptions: pendingRedemptions ?? 0,
  });
}

/**
 * GET /admin/users?page=1&pageSize=20
 */
export async function getUsers(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  await assertAdmin(req, token);
  const supabase = getSupabaseClientWithAuth(token);

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) ?? "20", 10) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("profiles")
    .select("id, email, full_name, pineapple_balance, is_admin, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ users: data ?? [], total: count ?? 0, page, pageSize });
}

/**
 * GET /admin/redemptions?status=pending
 */
export async function getRedemptions(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  await assertAdmin(req, token);
  const supabase = getSupabaseClientWithAuth(token);

  const statusFilter = req.query.status as string | undefined;

  let query = supabase
    .from("redemptions")
    .select("id, user_id, amount, reward_type, status, created_at, fulfilled_at, profiles(email, full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ redemptions: data ?? [] });
}

/**
 * POST /admin/redemptions/:id – update status (fulfilled / failed).
 */
export async function updateRedemption(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  await assertAdmin(req, token);
  const supabase = getSupabaseClientWithAuth(token);

  const { id } = req.params as { id: string };
  const body = req.body as { status?: string };
  if (!body.status || !["fulfilled", "failed"].includes(body.status)) {
    throw badRequest("status must be 'fulfilled' or 'failed'");
  }

  const { error } = await supabase
    .from("redemptions")
    .update({
      status: body.status,
      fulfilled_at: body.status === "fulfilled" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
}

/**
 * GET /admin/analytics?eventName=&page=1
 */
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  await assertAdmin(req, token);
  const supabase = getSupabaseClientWithAuth(token);

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) ?? "50", 10) || 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const eventName = req.query.eventName as string | undefined;

  let query = supabase
    .from("reward_ledger")
    .select("id, user_id, project_id, event_type, reward_amount, balance_after, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (eventName) {
    query = query.eq("event_type", eventName);
  }

  const { data, error, count } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ events: data ?? [], total: count ?? 0, page, pageSize });
}

/**
 * GET /admin/projects?page=1
 */
export async function getProjects(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  await assertAdmin(req, token);
  const supabase = getSupabaseClientWithAuth(token);

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) ?? "20", 10) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("builder_projects")
    .select("id, name, status, progress_score, created_at, owner_id, profiles(email, full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ projects: data ?? [], total: count ?? 0, page, pageSize });
}
