import type { Request, Response } from "express";
import * as rewardService from "../services/reward.service.js";
import { getSupabaseClientWithAuth } from "../config/supabase.js";
import { badRequest, unauthorized } from "../utils/errors.js";
import { getAccessToken } from "../middleware/auth.js";

const ALLOWED_EVENT_TYPES: rewardService.RewardEventType[] = [
  "prompt",
  "link_linkedin",
  "link_github",
  "link_website",
  "feature_shipped",
  "customer_added",
  "revenue_logged",
];

const REDEEM_MINIMUM = 50;

/**
 * POST /rewards – award pineapples for an event (idempotent).
 * Body: { projectId: string, eventType: RewardEventType, idempotencyKey: string }
 */
export async function postReward(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");

  const body = req.body as {
    projectId?: string;
    eventType?: string;
    idempotencyKey?: string;
  };

  if (!body.idempotencyKey || typeof body.idempotencyKey !== "string") {
    throw badRequest("idempotencyKey is required");
  }
  if (!body.eventType || !ALLOWED_EVENT_TYPES.includes(body.eventType as rewardService.RewardEventType)) {
    throw badRequest("eventType must be one of: " + ALLOWED_EVENT_TYPES.join(", "));
  }
  const projectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : null;
  if (body.projectId !== undefined && typeof body.projectId !== "string") {
    throw badRequest("projectId must be a string or omitted");
  }

  const result = await rewardService.award(
    token,
    projectId,
    body.eventType as rewardService.RewardEventType,
    body.idempotencyKey
  );

  res.json({
    rewarded: result.rewarded,
    amount: result.amount,
    newBalance: result.new_balance,
    idempotent: result.idempotent,
  });
}

/**
 * GET /rewards/ledger?page=1&pageSize=20
 * Returns paginated reward_ledger rows for the authenticated user.
 */
export async function getLedger(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) ?? "20", 10) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = getSupabaseClientWithAuth(token);
  const { data, error, count } = await supabase
    .from("reward_ledger")
    .select(
      "id, event_type, reward_amount, balance_after, project_id, created_at, builder_projects(name)",
      { count: "exact" }
    )
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const ledger = (data ?? []).map(
    (row: { reward_amount: number; [k: string]: unknown }) => {
      const { reward_amount, ...rest } = row;
      return { ...rest, amount: reward_amount };
    }
  );

  res.json({ ledger, total: count ?? 0, page, pageSize });
}

/**
 * GET /rewards/redemptions
 * Returns all redemptions for the authenticated user.
 */
export async function getRedemptions(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");

  const supabase = getSupabaseClientWithAuth(token);
  const { data, error } = await supabase
    .from("redemptions")
    .select("id, amount, reward_type, status, created_at, updated_at")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ redemptions: data ?? [] });
}

/**
 * POST /rewards/redeem
 * Body: { amount: number, rewardType: string }
 * Deducts balance and records a pending redemption.
 */
export async function postRedeem(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");

  const body = req.body as { amount?: number; rewardType?: string };
  const amount = typeof body.amount === "number" ? Math.floor(body.amount) : NaN;
  const rewardType = typeof body.rewardType === "string" ? body.rewardType.trim() : "uber_eats";

  if (!Number.isFinite(amount) || amount < REDEEM_MINIMUM) {
    throw badRequest(`Minimum redemption is ${REDEEM_MINIMUM} 🍍`);
  }

  const supabase = getSupabaseClientWithAuth(token);

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("pineapple_balance")
    .eq("id", req.user.id)
    .single();

  if (profileErr || !profile) {
    res.status(500).json({ error: "Could not load profile" });
    return;
  }

  const balance = (profile as { pineapple_balance: number }).pineapple_balance;
  if (balance < amount) {
    throw badRequest(`Insufficient balance. You have ${balance} 🍍`);
  }

  const { error: deductErr } = await supabase
    .from("profiles")
    .update({ pineapple_balance: balance - amount })
    .eq("id", req.user.id);

  if (deductErr) {
    res.status(500).json({ error: deductErr.message });
    return;
  }

  const { data: redemption, error: redeemErr } = await supabase
    .from("redemptions")
    .insert({ user_id: req.user.id, amount, reward_type: rewardType, status: "pending" })
    .select("id")
    .single();

  if (redeemErr) {
    res.status(500).json({ error: redeemErr.message });
    return;
  }

  await supabase.from("reward_ledger").insert({
    user_id: req.user.id,
    project_id: null,
    event_type: "reward_redeemed",
    reward_amount: -amount,
    balance_after: balance - amount,
    idempotency_key: `redeem-${(redemption as { id: string }).id}`,
  });

  res.json({ success: true, newBalance: balance - amount, redemptionId: (redemption as { id: string }).id });
}
