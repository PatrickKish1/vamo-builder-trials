-- Profile fields for Business Analytics
ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS founder_name TEXT,
  ADD COLUMN IF NOT EXISTS why_built TEXT;

COMMENT ON COLUMN public.builder_projects.founder_name IS 'Founder or project owner name';
COMMENT ON COLUMN public.builder_projects.why_built IS 'Why you built this (founder statement)';
