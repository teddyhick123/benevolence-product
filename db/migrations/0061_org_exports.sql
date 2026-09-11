-- =============================================================================
-- 0061_org_exports.sql
-- Organization data export: row paging that preserves numeric precision.
-- Depends on: 0002 (organizations)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One page of a table's rows for one organization, pre-serialised as JSON text.
--
-- Numerics are cast to text before to_jsonb. Postgres emits 25000.00 correctly,
-- but JSON.parse in Node returns 25000 — the scale is lost in the reader, not
-- the writer, so the fix has to happen here. The caller receives the JSON string
-- "25000.00" and can parse it safely in any language.
--
-- The select list is built from information_schema rather than hard-coded, so a
-- new numeric column is handled without touching this function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_table_page(
  p_table       text,
  p_org_id      uuid,
  -- Text rather than uuid: audit_log keys on a bigint, so the cursor is cast
  -- to the id column's own type inside the query.
  p_after       text DEFAULT NULL,
  p_limit       int  DEFAULT 1000,
  -- For a table with no org_id: the chain of hops that reaches one, as
  -- [{"table":..,"parentKey":..,"localKey":..}, ...] from this table outward.
  -- The last hop's table must carry org_id. A chain rather than a single
  -- parent because the schema has seven multi-hop cases, such as
  -- ai_messages -> ai_turns -> ai_sessions -> portfolios.
  p_chain       jsonb DEFAULT NULL,
  -- The scoping column. 'org_id' everywhere except the organizations table
  -- itself, which is the organization's own row and is keyed by id.
  p_org_column  text DEFAULT 'org_id'
)
RETURNS TABLE (row_id text, line text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cols text;
  v_has_scope boolean;
  v_key_col text;
  v_key_type text;
  v_where text;
  v_hop jsonb;
  v_alias text;
  v_prev text;
  v_depth int := 0;
BEGIN
  -- Only a real base table in public. Without this the function is an
  -- arbitrary-read primitive for anyone who can execute it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = p_table
  ) THEN
    RAISE EXCEPTION 'export_table_page: % is not an exportable base table', p_table;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_org_column
  ) INTO v_has_scope;

  -- A table with no scoping column must supply the chain that reaches one.
  -- Refusing to guess is what keeps an unscoped table from being exported whole.
  IF NOT v_has_scope AND (p_chain IS NULL OR jsonb_array_length(p_chain) = 0) THEN
    RAISE EXCEPTION 'export_table_page: % has no % and no parent chain was given',
      p_table, p_org_column;
  END IF;

  IF p_chain IS NOT NULL THEN
    FOR v_hop IN SELECT * FROM jsonb_array_elements(p_chain) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name = v_hop->>'table'
      ) THEN
        RAISE EXCEPTION 'export_table_page: chain table % is not a base table',
          v_hop->>'table';
      END IF;
    END LOOP;
  END IF;

  SELECT string_agg(
    CASE WHEN data_type = 'numeric'
         THEN format('%I::text AS %I', column_name, column_name)
         ELSE format('%I', column_name) END,
    ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  -- Page on the primary key rather than assuming a column named id:
  -- org_ai_spend_caps keys on org_id and has no id at all. Every table in this
  -- schema has a single-column primary key, and a composite one would need a
  -- different cursor shape, so that case is refused rather than mishandled.
  --
  -- The cursor is compared in the key's own type, so ordering stays correct
  -- for audit_log's bigint, where text ordering would put '10' before '9'.
  SELECT a.attname, format_type(a.atttypid, a.atttypmod)
  INTO v_key_col, v_key_type
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'p'
    AND c.conrelid = format('public.%I', p_table)::regclass
    AND array_length(c.conkey, 1) = 1;

  IF v_key_col IS NULL THEN
    RAISE EXCEPTION
      'export_table_page: % has no single-column primary key to page on', p_table;
  END IF;

  IF v_has_scope THEN
    RETURN QUERY EXECUTE format(
      'SELECT t.%I::text, to_jsonb(t)::text
         FROM (SELECT %s FROM public.%I
                WHERE %I = $1 AND ($2 IS NULL OR %I > $2::%s)
                ORDER BY %I LIMIT $3) t',
      v_key_col, v_cols, p_table, p_org_column, v_key_col, v_key_type, v_key_col)
    USING p_org_id, p_after, p_limit;
  ELSE
    -- Scoped through a chain of parents, built as nested EXISTS so a parent
    -- with several matching children cannot multiply rows. The innermost hop
    -- is the one that carries org_id.
    v_prev := 'c';
    v_where := '';
    FOR v_hop IN SELECT * FROM jsonb_array_elements(p_chain) LOOP
      v_depth := v_depth + 1;
      v_alias := 'p' || v_depth;
      v_where := v_where || format(
        'EXISTS (SELECT 1 FROM public.%I %I WHERE %I.%I = %I.%I AND ',
        v_hop->>'table', v_alias, v_alias, v_hop->>'parentKey',
        v_prev, v_hop->>'localKey');
      v_prev := v_alias;
    END LOOP;

    -- Close the chain on org_id at the innermost alias, then close each EXISTS.
    v_where := v_where || format('%I.org_id = $1', v_prev)
      || repeat(')', v_depth);

    RETURN QUERY EXECUTE format(
      'SELECT t.%I::text, to_jsonb(t)::text
         FROM (SELECT %s FROM public.%I c
                WHERE %s AND ($2 IS NULL OR c.%I > $2::%s)
                ORDER BY c.%I LIMIT $3) t',
      v_key_col, v_cols, p_table, v_where, v_key_col, v_key_type, v_key_col)
    USING p_org_id, p_after, p_limit;
  END IF;
END;
$$;

-- Supabase grants EXECUTE on new functions to authenticated and anon by
-- default, and REVOKE FROM PUBLIC does not remove a role-specific grant. Both
-- roles must be revoked by name: this is a SECURITY DEFINER function that takes
-- an org id as a parameter, so leaving it callable would let any signed-in user
-- read any organization's rows.
REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, text, int, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, text, int, jsonb, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, text, int, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.export_table_page(text, uuid, text, int, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Export runs. The row outlives the archive: retention deletes the file, and
-- the record that an export happened stays for the audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_export_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','expired')),
  manifest_hash text,
  row_count     bigint,
  byte_count    bigint,
  storage_path  text,
  error         text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_export_runs_org
  ON public.org_export_runs (org_id, created_at DESC);

-- One live run per organization: concurrent exports would double storage cost
-- and race on the same object path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_export_runs_one_live
  ON public.org_export_runs (org_id) WHERE status IN ('queued','running');

ALTER TABLE public.org_export_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_export_runs_read" ON public.org_export_runs;
CREATE POLICY "org_export_runs_read" ON public.org_export_runs
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "org_export_runs_service" ON public.org_export_runs;
CREATE POLICY "org_export_runs_service" ON public.org_export_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Supabase grants authenticated full table privileges by default, so revoke
-- before granting: RLS alone would leave write privileges nominally present.
REVOKE ALL ON public.org_export_runs FROM authenticated;
REVOKE ALL ON public.org_export_runs FROM anon;
GRANT SELECT ON public.org_export_runs TO authenticated;
GRANT ALL ON public.org_export_runs TO service_role;

-- Private bucket for the archives themselves. No policy for authenticated:
-- archives are reached only through a signed URL the API mints, never by
-- direct bucket access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-exports', 'org-exports', false)
ON CONFLICT (id) DO NOTHING;
