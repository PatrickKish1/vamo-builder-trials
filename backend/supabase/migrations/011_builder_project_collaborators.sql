-- Collaborators and invite tokens for builder projects
CREATE TABLE IF NOT EXISTS public.builder_project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  accepted_at TIMESTAMPTZ,
  invited_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_builder_collaborators_project ON public.builder_project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_builder_collaborators_token ON public.builder_project_collaborators(token);
CREATE INDEX IF NOT EXISTS idx_builder_collaborators_invited_user ON public.builder_project_collaborators(invited_user_id);

ALTER TABLE public.builder_project_collaborators ENABLE ROW LEVEL SECURITY;

-- Owner of the project can do everything on collaborators for that project
DROP POLICY IF EXISTS "Project owner can manage collaborators" ON public.builder_project_collaborators;
CREATE POLICY "Project owner can manage collaborators"
  ON public.builder_project_collaborators FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.builder_projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.builder_projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

-- Collaborator can read their own row (to see permission after accept)
DROP POLICY IF EXISTS "Collaborator can read own row" ON public.builder_project_collaborators;
CREATE POLICY "Collaborator can read own row"
  ON public.builder_project_collaborators FOR SELECT
  USING (invited_user_id = auth.uid());

-- Allow reading project for accepted collaborators (for listBuilderProjects and get project)
DROP POLICY IF EXISTS "Collaborators can select project" ON public.builder_projects;
CREATE POLICY "Collaborators can select project"
  ON public.builder_projects FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.builder_project_collaborators c
      WHERE c.project_id = id AND c.invited_user_id = auth.uid() AND c.accepted_at IS NOT NULL
    )
  );

-- Collaborators with edit permission can update project (e.g. files, preview) - same as owner for update
DROP POLICY IF EXISTS "Owner can update builder projects" ON public.builder_projects;
CREATE POLICY "Owner can update builder projects"
  ON public.builder_projects FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.builder_project_collaborators c
      WHERE c.project_id = id AND c.invited_user_id = auth.uid() AND c.accepted_at IS NOT NULL AND c.permission = 'edit'
    )
  );

COMMENT ON TABLE public.builder_project_collaborators IS 'Invited collaborators; token used in invite link until accepted';
COMMENT ON COLUMN public.builder_project_collaborators.permission IS 'view: preview only, clone to edit; edit: can send prompts and edit (shared state)';
