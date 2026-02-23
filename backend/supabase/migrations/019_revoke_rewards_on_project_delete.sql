-- When a project is deleted, revoke pineapples that were earned from that project so users
-- do not keep points that can no longer be tied to a project.

CREATE OR REPLACE FUNCTION public.revoke_rewards_for_project(p_project_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_new_balance INTEGER;
  v_idempotency_key TEXT;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT user_id, SUM(reward_amount) AS total
    FROM public.reward_ledger
    WHERE project_id = p_project_id AND reward_amount > 0
    GROUP BY user_id
  LOOP
    v_idempotency_key := 'revoke-project-' || p_project_id::text || '-' || r.user_id::text;

    IF EXISTS (SELECT 1 FROM public.reward_ledger WHERE idempotency_key = v_idempotency_key) THEN
      CONTINUE;
    END IF;

    UPDATE public.profiles
    SET pineapple_balance = greatest(0, COALESCE(pineapple_balance, 0) - r.total),
        updated_at = now()
    WHERE id = r.user_id;

    SELECT COALESCE(pineapple_balance, 0) INTO v_new_balance
    FROM public.profiles WHERE id = r.user_id;

    INSERT INTO public.reward_ledger (user_id, project_id, event_type, reward_amount, balance_after, idempotency_key)
    VALUES (r.user_id, p_project_id, 'project_deleted', -r.total, v_new_balance, v_idempotency_key);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.revoke_rewards_for_project(UUID) IS
  'Revokes pineapples earned on the given project from each user and records ledger entries. Call before deleting the project.';

GRANT EXECUTE ON FUNCTION public.revoke_rewards_for_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_rewards_for_project(UUID) TO service_role;
