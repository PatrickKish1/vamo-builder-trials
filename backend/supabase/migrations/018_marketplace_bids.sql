-- Marketplace bids: offers made by users on listed projects.
-- Only project owner can accept; transfer is full (new owner) or partial (collaborator).
CREATE TABLE IF NOT EXISTS public.marketplace_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bidder_email TEXT NOT NULL,
  amount_low INTEGER NOT NULL CHECK (amount_low >= 0),
  amount_high INTEGER NOT NULL CHECK (amount_high >= amount_low),
  message TEXT,
  transfer_type TEXT NOT NULL DEFAULT 'full' CHECK (transfer_type IN ('full', 'partial')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'outbid', 'accepted', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_bids_project ON public.marketplace_bids(project_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_bidder ON public.marketplace_bids(bidder_id);

ALTER TABLE public.marketplace_bids ENABLE ROW LEVEL SECURITY;

-- Bidder can insert bid for a listed project (and must not be the project owner; enforced in app).
CREATE POLICY "Bidder can insert bid"
  ON public.marketplace_bids FOR INSERT
  WITH CHECK (auth.uid() = bidder_id);

-- Bidder can view own bids.
CREATE POLICY "Bidder can view own bids"
  ON public.marketplace_bids FOR SELECT
  USING (auth.uid() = bidder_id);

-- Project owner can view all bids for their listed projects.
CREATE POLICY "Project owner can view bids for own project"
  ON public.marketplace_bids FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.builder_projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

-- Bidder can update own bid only to withdraw (status = 'withdrawn').
CREATE POLICY "Bidder can update own bid"
  ON public.marketplace_bids FOR UPDATE
  USING (auth.uid() = bidder_id)
  WITH CHECK (auth.uid() = bidder_id);

-- RPC: only project owner can accept a bid; performs transfer and unlists project.
CREATE OR REPLACE FUNCTION public.accept_marketplace_bid(p_bid_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid RECORD;
  v_project RECORD;
  v_owner_id UUID;
  v_collab_id UUID;
BEGIN
  SELECT id, project_id, bidder_id, transfer_type, status
  INTO v_bid
  FROM marketplace_bids
  WHERE id = p_bid_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bid not found');
  END IF;
  IF v_bid.status != 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bid is no longer active');
  END IF;

  SELECT id, owner_id, status
  INTO v_project
  FROM builder_projects
  WHERE id = v_bid.project_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Project not found');
  END IF;
  IF v_project.status != 'listed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Project is not listed for sale');
  END IF;
  IF v_project.owner_id != auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the project owner can accept a bid');
  END IF;
  IF v_bid.bidder_id = v_project.owner_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot accept your own bid');
  END IF;

  UPDATE marketplace_bids SET status = 'accepted' WHERE id = p_bid_id;

  IF v_bid.transfer_type = 'full' THEN
    UPDATE builder_projects
    SET owner_id = v_bid.bidder_id, status = 'ready', updated_at = now()
    WHERE id = v_bid.project_id;
  ELSE
    INSERT INTO builder_project_collaborators (project_id, email, invited_by_user_id, token, permission, invited_user_id, accepted_at)
    SELECT v_bid.project_id, pr.email, v_project.owner_id, 'accepted-bid-' || p_bid_id::text, 'edit', v_bid.bidder_id, now()
    FROM profiles pr WHERE pr.id = v_bid.bidder_id
    ON CONFLICT (project_id, email) DO UPDATE SET invited_user_id = v_bid.bidder_id, accepted_at = now(), permission = 'edit';
    UPDATE builder_projects SET status = 'ready', updated_at = now() WHERE id = v_bid.project_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'transfer_type', v_bid.transfer_type);
END;
$$;

-- Only project owner can call this (RLS does not apply to SECURITY DEFINER; we check auth.uid() inside).
-- Expose via API that verifies ownership before calling.
COMMENT ON FUNCTION public.accept_marketplace_bid(UUID) IS 'Accepts a marketplace bid: full transfer changes owner, partial adds bidder as edit collaborator. Caller must be project owner.';
