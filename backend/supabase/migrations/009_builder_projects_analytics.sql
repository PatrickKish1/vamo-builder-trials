-- Add progress and traction fields to builder_projects for Business Analytics
ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS progress_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS traction_signals JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_assets JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recent_activity JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.builder_projects.progress_score IS '0-100 progress score; updated from chat business_update';
COMMENT ON COLUMN public.builder_projects.traction_signals IS 'Array of { type, description, createdAt }';
COMMENT ON COLUMN public.builder_projects.linked_assets IS 'Array of { type, url, label? } e.g. LinkedIn, GitHub';
COMMENT ON COLUMN public.builder_projects.recent_activity IS 'Array of { type, description, createdAt } for activity timeline';
