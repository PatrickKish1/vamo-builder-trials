-- Project logo URL
ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.builder_projects.logo_url IS 'URL or base64 data-URI for the project logo image';
