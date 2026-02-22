-- VibeCoder: project files (owner_id nullable for playground)
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT DEFAULT '',
  encoding TEXT DEFAULT 'text',
  mime_type TEXT,
  is_folder BOOLEAN DEFAULT false,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, path)
);

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent: drop if exists so re-run / already-applied is safe)
DROP POLICY IF EXISTS "Select files for own project or playground" ON public.project_files;
CREATE POLICY "Select files for own project or playground"
  ON public.project_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_files.project_id
      AND (p.owner_id = auth.uid() OR p.owner_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Insert files for own project or playground" ON public.project_files;
CREATE POLICY "Insert files for own project or playground"
  ON public.project_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_files.project_id
      AND (p.owner_id = auth.uid() OR p.owner_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Update files for own project or playground" ON public.project_files;
CREATE POLICY "Update files for own project or playground"
  ON public.project_files FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_files.project_id
      AND (p.owner_id = auth.uid() OR p.owner_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Delete files for own project or playground" ON public.project_files;
CREATE POLICY "Delete files for own project or playground"
  ON public.project_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_files.project_id
      AND (p.owner_id = auth.uid() OR p.owner_id IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files(project_id);
