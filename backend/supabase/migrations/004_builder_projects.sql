-- VibeCoder: builder (web app builder) projects
CREATE TABLE IF NOT EXISTS public.builder_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT DEFAULT 'nextjs',
  status TEXT DEFAULT 'scaffolding',
  preview_url TEXT,
  preview_port INTEGER,
  project_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.builder_projects ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent: drop if exists so re-run / already-applied is safe)
DROP POLICY IF EXISTS "Owner can select builder projects" ON public.builder_projects;
CREATE POLICY "Owner can select builder projects"
  ON public.builder_projects FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can insert builder projects" ON public.builder_projects;
CREATE POLICY "Owner can insert builder projects"
  ON public.builder_projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can update builder projects" ON public.builder_projects;
CREATE POLICY "Owner can update builder projects"
  ON public.builder_projects FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can delete builder projects" ON public.builder_projects;
CREATE POLICY "Owner can delete builder projects"
  ON public.builder_projects FOR DELETE
  USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_builder_projects_owner_id ON public.builder_projects(owner_id);
