-- =============================================================================
-- 0060_migrations_ledger.sql
-- Records which migrations have been applied and what their content was, so a
-- database's migration state is knowable rather than inferred.
-- Depends on: 0001, 0002
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.applied_migrations (
  -- The four-character file-name prefix. A string, not a number: version
  -- numbers have gaps and leading zeros, so numeric identity is unsafe.
  version      text PRIMARY KEY,
  filename     text NOT NULL CHECK (btrim(filename) <> ''),
  -- sha256 of the file's normalised content, or 'unverified' for a backfilled
  -- row whose content at apply time cannot be reconstructed.
  checksum     text NOT NULL CHECK (btrim(checksum) <> ''),
  applied_at   timestamptz NOT NULL DEFAULT now(),
  applied_by   text NOT NULL CHECK (applied_by IN ('cli','migrate-client','backfill'))
);

-- ---------------------------------------------------------------------------
-- Adoption: seed from what the Supabase CLI already recorded.
--
-- These rows are recorded, not verified — the content that actually ran is not
-- recoverable, so the checksum is 'unverified' until a ledger-aware runner
-- replaces it. That distinction is surfaced as the 'adopted' state rather than
-- being reported as 'verified'.
--
-- Wrapped because supabase_migrations is the CLI's schema: a database migrated
-- by scripts/migrate-client.ts has no such table, and that is a legitimate
-- first-run state handled by the runner's --adopt path rather than an error.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
  SELECT
    version,
    COALESCE(name, version) || '.sql',
    'unverified',
    'backfill'
  FROM supabase_migrations.schema_migrations
  ON CONFLICT (version) DO NOTHING;
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
  RAISE NOTICE 'supabase_migrations.schema_migrations unavailable; use --adopt to seed the ledger';
END $$;

-- This migration records itself: the backfill above reads a table that does
-- not yet list 0060, so without this the ledger would immediately declare
-- itself pending.
INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
VALUES ('0060', '0060_migrations_ledger.sql', 'unverified', 'backfill')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who administers any organization on this instance. The
-- ledger describes the instance rather than a tenant, and each client gets a
-- dedicated instance, so there is no per-org row to scope to.
--
-- EXISTS rather than a LIMIT 1 subquery: picking one arbitrary membership
-- would grant or deny unpredictably for a user who administers one
-- organization and merely belongs to another.
CREATE POLICY "applied_migrations_admin_read" ON public.applied_migrations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = auth.uid()
        AND m.deleted_at IS NULL
        AND public.is_org_admin(m.org_id)
    )
  );
CREATE POLICY "applied_migrations_service" ON public.applied_migrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Supabase grants authenticated full table privileges by default, so revoke
-- before granting: RLS alone would leave write privileges nominally present.
REVOKE ALL ON public.applied_migrations FROM authenticated;
GRANT SELECT ON public.applied_migrations TO authenticated;
GRANT ALL ON public.applied_migrations TO service_role;

-- ---------------------------------------------------------------------------
-- Exact row counts per org-scoped table, in one pass.
--
-- Counted rather than estimated: reltuples goes stale after bulk changes, and
-- an estimate presented as a count on a transparency screen is worse than no
-- number at all.
--
-- Every count is scoped by org_id. That scoping is load-bearing: the schema is
-- shared across organizations, so an unscoped count would leak another
-- tenant's volume the moment two organizations share a database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_table_row_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_count bigint;
  v_result jsonb := '[]'::jsonb;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', v_table)
      INTO v_count USING p_org_id;
    -- Tables with no rows for this organization are omitted: a list of 100
    -- tables where 96 read zero is noise.
    IF v_count > 0 THEN
      v_result := v_result || jsonb_build_object('table_name', v_table, 'row_count', v_count);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.org_table_row_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_table_row_counts(uuid) TO service_role;
