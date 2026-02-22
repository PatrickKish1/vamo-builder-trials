-- Redemptions table for pineapple redemption requests (create if not exists)
CREATE TABLE IF NOT EXISTS public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reward_type TEXT NOT NULL DEFAULT 'uber_eats',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own redemptions" ON public.redemptions;
CREATE POLICY "Users can view own redemptions"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own redemptions" ON public.redemptions;
CREATE POLICY "Users can insert own redemptions"
  ON public.redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON public.redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON public.redemptions(status);

-- Admins can view all redemptions
DROP POLICY IF EXISTS "Admins can view all redemptions" ON public.redemptions;
CREATE POLICY "Admins can view all redemptions"
  ON public.redemptions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Admins can update redemption status
DROP POLICY IF EXISTS "Admins can update redemptions" ON public.redemptions;
CREATE POLICY "Admins can update redemptions"
  ON public.redemptions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
