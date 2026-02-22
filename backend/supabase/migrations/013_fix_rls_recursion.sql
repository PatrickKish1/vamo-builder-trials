-- Fix infinite recursion in builder_projects RLS policies.
--
-- Root cause: builder_projects SELECT policy queries builder_project_collaborators,
-- and builder_project_collaborators ALL policy queries builder_projects → infinite loop.
--
-- Fix: replace inline sub-selects with SECURITY DEFINER functions.
-- SECURITY DEFINER functions run with owner privileges and bypass RLS on tables they
-- access, so the cross-table sub-selects never re-enter the policies that called them.

-- ── Helper functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.builder_is_project_owner(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.builder_projects
    WHERE id = project_uuid AND owner_id = user_uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.builder_is_accepted_collaborator(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.builder_project_collaborators
    WHERE project_id = project_uuid
      AND invited_user_id = user_uuid
      AND accepted_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.builder_is_edit_collaborator(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.builder_project_collaborators
    WHERE project_id = project_uuid
      AND invited_user_id = user_uuid
      AND accepted_at IS NOT NULL
      AND permission = 'edit'
  );
$$;

-- ── builder_projects policies (drop old, create new) ────────────────────────

-- Remove every SELECT policy that may have been created across migrations
DROP POLICY IF EXISTS "Owner can select builder projects" ON public.builder_projects;
DROP POLICY IF EXISTS "Collaborators can select project"  ON public.builder_projects;

CREATE POLICY "Select builder projects"
  ON public.builder_projects FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.builder_is_accepted_collaborator(id, auth.uid())
  );

-- Remove every UPDATE policy
DROP POLICY IF EXISTS "Owner can update builder projects" ON public.builder_projects;

CREATE POLICY "Update builder projects"
  ON public.builder_projects FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR public.builder_is_edit_collaborator(id, auth.uid())
  );

-- ── builder_project_collaborators policies (drop old, create new) ───────────

DROP POLICY IF EXISTS "Project owner can manage collaborators" ON public.builder_project_collaborators;
DROP POLICY IF EXISTS "Collaborator can read own row"          ON public.builder_project_collaborators;

-- Owner manages all rows for their projects (uses SECURITY DEFINER → no recursion)
CREATE POLICY "Owner manages collaborators"
  ON public.builder_project_collaborators FOR ALL
  USING (public.builder_is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.builder_is_project_owner(project_id, auth.uid()));

-- Accepted collaborator can read their own invite row
CREATE POLICY "Collaborator reads own invite"
  ON public.builder_project_collaborators FOR SELECT
  USING (invited_user_id = auth.uid());
