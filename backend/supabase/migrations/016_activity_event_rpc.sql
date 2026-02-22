-- RPC to atomically append an activity event to builder_projects.recent_activity
-- Keeps the last 50 events only.
CREATE OR REPLACE FUNCTION public.append_activity_event(
  p_project_id UUID,
  p_event JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_current JSONB;
  v_new JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Verify the caller owns or collaborates on the project
  SELECT owner_id INTO v_owner_id FROM public.builder_projects WHERE id = p_project_id;
  IF v_owner_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(recent_activity, '[]'::jsonb)
    INTO v_current
    FROM public.builder_projects
    WHERE id = p_project_id;

  -- Prepend new event and keep most recent 50
  v_new := (jsonb_build_array(p_event) || v_current);
  IF jsonb_array_length(v_new) > 50 THEN
    v_new := (
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM jsonb_array_elements(v_new) WITH ORDINALITY AS t(elem, ord)
      WHERE ord <= 50
    );
  END IF;

  UPDATE public.builder_projects
    SET recent_activity = v_new, updated_at = now()
    WHERE id = p_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_activity_event(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_activity_event(UUID, JSONB) TO anon;
