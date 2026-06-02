-- Migration: Import Module Tables and Infrastructure
-- Description: Creates import_ai_suggestions, investees tables,
--              mark_stale_import_jobs() RPC, and imports storage bucket.
--              Fixes Adm-B7, Adm-B8, Adm-B9, Adm-B10.
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- investees — canonical investee/grantee entity registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.investees (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  ein          text    UNIQUE,  -- nullable: non-US entities may not have EINs
  display_name text    NOT NULL,
  country      text    NOT NULL DEFAULT 'US',
  charity_id   uuid    REFERENCES public.charities(id) ON DELETE SET NULL,
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_investees_ein          ON public.investees (ein) WHERE ein IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_investees_display_name ON public.investees (lower(display_name));
CREATE INDEX IF NOT EXISTS idx_investees_charity_id   ON public.investees (charity_id);

ALTER TABLE public.investees ENABLE ROW LEVEL SECURITY;

-- Investees are shared reference data; any authenticated user can read
CREATE POLICY "investees: authenticated can read"
  ON public.investees FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "investees: service role full access"
  ON public.investees FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.investees TO authenticated;
GRANT ALL ON public.investees TO service_role;

CREATE TRIGGER set_investees_updated_at
  BEFORE UPDATE ON public.investees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- import_ai_suggestions — per-field AI suggestions during import review
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_ai_suggestions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  import_job_id     uuid        NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  staging_table     text        NOT NULL,   -- e.g. 'staging_import_holdings'
  staging_row_id    uuid        NOT NULL,
  field             text        NOT NULL,

  suggestion_type   text        NOT NULL
                    CHECK (suggestion_type IN (
                      'fill_missing', 'fix_format', 'fix_value',
                      'map_enum', 'deduplicate', 'other'
                    )),
  confidence        numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  explanation       text,
  proposed_value    text,
  auto_fixable      boolean     NOT NULL DEFAULT false,
  bulk_applicable   boolean     NOT NULL DEFAULT false,
  bulk_condition    jsonb,

  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'applied')),

  UNIQUE (staging_row_id, field)
);

CREATE INDEX IF NOT EXISTS idx_import_ai_suggestions_job_id ON public.import_ai_suggestions (import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_ai_suggestions_status ON public.import_ai_suggestions (import_job_id, status);

ALTER TABLE public.import_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_ai_suggestions: org admins can manage"
  ON public.import_ai_suggestions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.import_jobs ij
      WHERE ij.id = import_job_id
        AND public.is_org_admin(ij.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.import_jobs ij
      WHERE ij.id = import_job_id
        AND public.is_org_admin(ij.org_id)
    )
  );

CREATE POLICY "import_ai_suggestions: service role full access"
  ON public.import_ai_suggestions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_ai_suggestions TO authenticated;
GRANT ALL ON public.import_ai_suggestions TO service_role;

CREATE TRIGGER set_import_ai_suggestions_updated_at
  BEFORE UPDATE ON public.import_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mark_stale_import_jobs() — fail jobs stuck in active states >30 min
-- Returns the number of jobs marked failed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_stale_import_jobs(
  p_stale_threshold_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.import_jobs
  SET
    status     = 'failed',
    updated_at = now(),
    error_message = COALESCE(
      error_message,
      'Job marked failed by mark_stale_import_jobs: no activity for '
        || p_stale_threshold_minutes || ' minutes'
    )
  WHERE status IN ('pending', 'processing', 'committing')
    AND updated_at < (now() - (p_stale_threshold_minutes || ' minutes')::interval);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_stale_import_jobs(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- imports storage bucket — private bucket for import file uploads
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,
  52428800,  -- 50 MB limit per file
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for imports bucket objects
-- Upload: org admins only; path convention: {org_id}/{import_job_id}/{filename}
CREATE POLICY "imports bucket: org admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'imports'
    AND public.is_org_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "imports bucket: org admins can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'imports'
    AND public.is_org_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "imports bucket: org admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'imports'
    AND public.is_org_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "imports bucket: service role full access"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'imports')
  WITH CHECK (bucket_id = 'imports');
