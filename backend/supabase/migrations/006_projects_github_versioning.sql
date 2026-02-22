-- Optional GitHub versioning per IDE project (private repo per project; sync for diffs/revert)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_repo_full_name TEXT,
  ADD COLUMN IF NOT EXISTS github_sync_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.projects.github_repo_full_name IS 'GitHub repo full name (e.g. org/repo-name) for versioning; created when user enables versioning';
COMMENT ON COLUMN public.projects.github_sync_enabled IS 'When true, backend syncs project_files to GitHub on commit/save';
