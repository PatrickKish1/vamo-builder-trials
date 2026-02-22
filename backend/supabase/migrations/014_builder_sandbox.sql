-- Builder sandbox: track E2B sandbox IDs per project and store project files
-- as the persistent source of truth (sandbox is ephemeral execution environment).

-- sandbox_id: E2B sandbox ID so we can reconnect on the same session.
ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS sandbox_id TEXT;

-- builder_sandbox_files: source of truth for all project source files.
-- Files are written here on every AI edit and on initial scaffold snapshot.
-- When a sandbox is recreated (timeout), files are restored from this table.
CREATE TABLE IF NOT EXISTS public.builder_sandbox_files (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   UUID        NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  path         TEXT        NOT NULL,
  content      TEXT        NOT NULL DEFAULT '',
  is_folder    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT builder_sandbox_files_project_path_unique UNIQUE (project_id, path)
);

CREATE INDEX IF NOT EXISTS builder_sandbox_files_project_id_idx
  ON public.builder_sandbox_files (project_id);

ALTER TABLE public.builder_sandbox_files ENABLE ROW LEVEL SECURITY;

-- Use SECURITY DEFINER helpers from 013 to avoid RLS recursion
CREATE POLICY "Owner manages sandbox files"
  ON public.builder_sandbox_files FOR ALL
  USING  (public.builder_is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.builder_is_project_owner(project_id, auth.uid()));

CREATE POLICY "Collaborator reads sandbox files"
  ON public.builder_sandbox_files FOR SELECT
  USING (public.builder_is_accepted_collaborator(project_id, auth.uid()));

CREATE POLICY "Edit collaborator writes sandbox files"
  ON public.builder_sandbox_files FOR INSERT
  WITH CHECK (public.builder_is_edit_collaborator(project_id, auth.uid()));

CREATE POLICY "Edit collaborator updates sandbox files"
  ON public.builder_sandbox_files FOR UPDATE
  USING (public.builder_is_edit_collaborator(project_id, auth.uid()));
