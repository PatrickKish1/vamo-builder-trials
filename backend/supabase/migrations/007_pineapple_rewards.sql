-- Points (pineapple) system: profile balance, ledger, and reward RPC

-- 1. Add pineapple balance to profiles (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pineapple_balance INTEGER NOT NULL DEFAULT 0;

-- 2. Reward ledger for audit trail and idempotency
CREATE TABLE IF NOT EXISTS public.reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.builder_projects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  reward_amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own ledger" ON public.reward_ledger;
CREATE POLICY "Owner can view own ledger"
  ON public.reward_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- Insert is done by reward_user() SECURITY DEFINER; no direct user INSERT policy needed for client.
-- Allow insert so the function can write (function runs as definer and bypasses RLS).
DROP POLICY IF EXISTS "Owner can insert own ledger" ON public.reward_ledger;
CREATE POLICY "Owner can insert own ledger"
  ON public.reward_ledger FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_user_id ON public.reward_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_project_created ON public.reward_ledger(project_id, created_at);

-- 3. Reward amounts per event type (prompt = 1; others for future use)
-- Rate limit: max 60 rewarded prompts per project per hour

CREATE OR REPLACE FUNCTION public.reward_user(
  p_project_id UUID DEFAULT NULL,
  p_event_type TEXT DEFAULT 'prompt',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_balance INTEGER;
  v_amount INTEGER := 0;
  v_prompt_count BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RETURN jsonb_build_object('rewarded', false, 'error', 'not_authenticated_or_missing_key');
  END IF;

  -- Idempotency: already processed?
  IF EXISTS (SELECT 1 FROM public.reward_ledger WHERE idempotency_key = p_idempotency_key) THEN
    SELECT balance_after INTO v_current_balance
      FROM public.reward_ledger
      WHERE idempotency_key = p_idempotency_key
      ORDER BY created_at DESC
      LIMIT 1;
    RETURN jsonb_build_object(
      'rewarded', true,
      'amount', 0,
      'new_balance', v_current_balance,
      'idempotent', true
    );
  END IF;

  -- Amount by event type
  v_amount := CASE p_event_type
    WHEN 'prompt' THEN 1
    WHEN 'link_linkedin' THEN 5
    WHEN 'link_github' THEN 5
    WHEN 'link_website' THEN 3
    WHEN 'feature_shipped' THEN 3
    WHEN 'customer_added' THEN 5
    WHEN 'revenue_logged' THEN 10
    ELSE 0
  END;

  -- Rate limit for prompts: 60 per project per hour
  IF p_event_type = 'prompt' AND p_project_id IS NOT NULL AND v_amount > 0 THEN
    SELECT COUNT(*) INTO v_prompt_count
      FROM public.reward_ledger
      WHERE project_id = p_project_id
        AND event_type = 'prompt'
        AND created_at > (now() - interval '1 hour');
    IF v_prompt_count >= 60 THEN
      v_amount := 0;
    END IF;
  END IF;

  SELECT COALESCE(pineapple_balance, 0) INTO v_current_balance
    FROM public.profiles WHERE id = v_user_id;

  IF v_amount > 0 THEN
    INSERT INTO public.reward_ledger (user_id, project_id, event_type, reward_amount, balance_after, idempotency_key)
    VALUES (v_user_id, p_project_id, p_event_type, v_amount, v_current_balance + v_amount, p_idempotency_key);

    UPDATE public.profiles
    SET pineapple_balance = pineapple_balance + v_amount, updated_at = now()
    WHERE id = v_user_id;
  ELSE
    -- Record 0 reward for idempotency when rate limited or unknown event
    INSERT INTO public.reward_ledger (user_id, project_id, event_type, reward_amount, balance_after, idempotency_key)
    VALUES (v_user_id, p_project_id, p_event_type, 0, v_current_balance, p_idempotency_key);
  END IF;

  SELECT pineapple_balance INTO v_current_balance FROM public.profiles WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'rewarded', true,
    'amount', v_amount,
    'new_balance', v_current_balance
  );
END;
$$;

-- Allow authenticated users to call the function (with their JWT, auth.uid() is set)
GRANT EXECUTE ON FUNCTION public.reward_user(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reward_user(UUID, TEXT, TEXT) TO anon;
