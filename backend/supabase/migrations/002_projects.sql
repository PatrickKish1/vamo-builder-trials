-- VibeCoder: IDE projects (owner_id nullable for playground)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active_file_path TEXT,
  open_file_paths JSONB DEFAULT '[]',
  dirty_files JSONB DEFAULT '[]',
  is_playground BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent: drop if exists so re-run / already-applied is safe)
DROP POLICY IF EXISTS "Owner can select own projects" ON public.projects;
CREATE POLICY "Owner can select own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can insert projects" ON public.projects;
CREATE POLICY "Owner can insert projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can update own projects" ON public.projects;
CREATE POLICY "Owner can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can delete own projects" ON public.projects;
CREATE POLICY "Owner can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Playground select when no owner" ON public.projects;
CREATE POLICY "Playground select when no owner"
  ON public.projects FOR SELECT
  USING (owner_id IS NULL);

DROP POLICY IF EXISTS "Playground insert when no owner" ON public.projects;
CREATE POLICY "Playground insert when no owner"
  ON public.projects FOR INSERT
  WITH CHECK (owner_id IS NULL);

DROP POLICY IF EXISTS "Playground update when no owner" ON public.projects;
CREATE POLICY "Playground update when no owner"
  ON public.projects FOR UPDATE
  USING (owner_id IS NULL);

DROP POLICY IF EXISTS "Playground delete when no owner" ON public.projects;
CREATE POLICY "Playground delete when no owner"
  ON public.projects FOR DELETE
  USING (owner_id IS NULL);

-- Index for listing by owner
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_expires_at ON public.projects(expires_at) WHERE expires_at IS NOT NULL;
