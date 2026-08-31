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
  p_after       uuid DEFAULT NULL,
  p_limit       int  DEFAULT 1000,
  -- For a table with no org_id: the parent that carries one, and the keys that
  -- join to it. Omitted for directly scoped tables.
  p_parent      text DEFAULT NULL,
  p_parent_key  text DEFAULT NULL,
  p_local_key   text DEFAULT NULL,
  -- The scoping column. 'org_id' everywhere except the organizations table
  -- itself, which is the organization's own row and is keyed by id.
  p_org_column  text DEFAULT 'org_id'
)
RETURNS TABLE (row_id uuid, line text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cols text;
  v_has_scope boolean;
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

  -- A table with no scoping column must name the parent that carries one.
  -- Refusing to guess is what keeps an unscoped table from being exported whole.
  IF NOT v_has_scope AND (p_parent IS NULL OR p_parent_key IS NULL OR p_local_key IS NULL) THEN
    RAISE EXCEPTION 'export_table_page: % has no % and no parent was given', p_table, p_org_column;
  END IF;

  IF p_parent IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = p_parent
  ) THEN
    RAISE EXCEPTION 'export_table_page: parent % is not a base table', p_parent;
  END IF;

  SELECT string_agg(
    CASE WHEN data_type = 'numeric'
         THEN format('%I::text AS %I', column_name, column_name)
         ELSE format('%I', column_name) END,
    ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  IF v_has_scope THEN
    RETURN QUERY EXECUTE format(
      'SELECT t.id, to_jsonb(t)::text
         FROM (SELECT %s FROM public.%I
                WHERE %I = $1 AND ($2 IS NULL OR id > $2)
                ORDER BY id LIMIT $3) t',
      v_cols, p_table, p_org_column)
    USING p_org_id, p_after, p_limit;
  ELSE
    -- Scoped through the parent's org_id. EXISTS rather than a join, so a
    -- parent with several matching children cannot multiply rows.
    RETURN QUERY EXECUTE format(
      'SELECT t.id, to_jsonb(t)::text
         FROM (SELECT %s FROM public.%I c
                WHERE EXISTS (
                        SELECT 1 FROM public.%I p
                        WHERE p.%I = c.%I AND p.org_id = $1)
                  AND ($2 IS NULL OR c.id > $2)
                ORDER BY c.id LIMIT $3) t',
      v_cols, p_table, p_parent, p_parent_key, p_local_key)
    USING p_org_id, p_after, p_limit;
  END IF;
END;
$$;

-- Supabase grants EXECUTE on new functions to authenticated and anon by
-- default, and REVOKE FROM PUBLIC does not remove a role-specific grant. Both
-- roles must be revoked by name: this is a SECURITY DEFINER function that takes
-- an org id as a parameter, so leaving it callable would let any signed-in user
-- read any organization's rows.
REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, uuid, int, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, uuid, int, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.export_table_page(text, uuid, uuid, int, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.export_table_page(text, uuid, uuid, int, text, text, text, text) TO service_role;
