import { getSupabaseClientWithAuth } from "../config/supabase.js";

export type RewardEventType =
  | "prompt"
  | "link_linkedin"
  | "link_github"
  | "link_website"
  | "feature_shipped"
  | "customer_added"
  | "revenue_logged";

export interface RewardResult {
  rewarded: boolean;
  amount: number;
  new_balance: number;
  idempotent?: boolean;
  error?: string;
}

/**
 * Award pineapples via Supabase RPC (idempotent, rate-limited inside DB).
 * Uses the user's access token so auth.uid() is set in the function.
 */
export async function award(
  accessToken: string,
  projectId: string | null,
  eventType: RewardEventType,
  idempotencyKey: string
): Promise<RewardResult> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data, error } = await supabase.rpc("reward_user", {
    p_project_id: projectId,
    p_event_type: eventType,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return { rewarded: false, amount: 0, new_balance: 0, error: error.message };
  }

  const result = data as RewardResult;
  return result;
}
