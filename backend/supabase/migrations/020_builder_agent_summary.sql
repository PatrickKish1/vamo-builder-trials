-- Store last agent response for builder project (shown on Chat tab)
ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS agent_summary TEXT;

COMMENT ON COLUMN public.builder_projects.agent_summary IS 'Last agent completion message for this project (planning, completed summary, or follow-up).';
