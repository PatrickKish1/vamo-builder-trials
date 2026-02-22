-- Add valuation fields to builder_projects
ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS valuation_low INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valuation_high INTEGER DEFAULT 0;

-- Offers table for instant valuation offers
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offer_low INTEGER NOT NULL,
  offer_high INTEGER NOT NULL,
  reasoning TEXT,
  signals JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own offers" ON public.offers;
CREATE POLICY "Owner can view own offers"
  ON public.offers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can insert own offers" ON public.offers;
CREATE POLICY "Owner can insert own offers"
  ON public.offers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow owner to expire their own offers
DROP POLICY IF EXISTS "Owner can update own offers" ON public.offers;
CREATE POLICY "Owner can update own offers"
  ON public.offers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_offers_project_id ON public.offers(project_id);
CREATE INDEX IF NOT EXISTS idx_offers_user_id ON public.offers(user_id);

-- Add admin RLS policies for other tables. Do NOT redefine "Admins can view all profiles"
-- on public.profiles here — migration 008 fixes recursion by using current_user_is_admin().

-- Admins can view all builder_projects
DROP POLICY IF EXISTS "Admins can view all projects" ON public.builder_projects;
CREATE POLICY "Admins can view all projects"
  ON public.builder_projects FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Admins can view all reward_ledger
DROP POLICY IF EXISTS "Admins can view all ledger" ON public.reward_ledger;
CREATE POLICY "Admins can view all ledger"
  ON public.reward_ledger FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
