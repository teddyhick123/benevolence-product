-- ============================================================================
-- Migration: {ModuleName} Module
-- Description: {description}
-- ============================================================================

-- ============================================================================
-- MAIN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS {module_name}_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Core fields
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),

  -- Module-specific fields
  -- Add your fields here

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_{module_name}_items_org
  ON {module_name}_items(org_id);
CREATE INDEX IF NOT EXISTS idx_{module_name}_items_status
  ON {module_name}_items(org_id, status);
CREATE INDEX IF NOT EXISTS idx_{module_name}_items_created
  ON {module_name}_items(org_id, created_at DESC);

-- Updated at trigger
CREATE TRIGGER set_{module_name}_items_updated_at
  BEFORE UPDATE ON {module_name}_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================================
-- RELATED TABLE (Optional - for one-to-many relationships)
-- ============================================================================

CREATE TABLE IF NOT EXISTS {module_name}_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  {module_name}_item_id UUID NOT NULL REFERENCES {module_name}_items(id) ON DELETE CASCADE,

  -- Detail fields
  field_name TEXT NOT NULL,
  field_value TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_{module_name}_details_item
  ON {module_name}_details({module_name}_item_id);


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE {module_name}_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE {module_name}_details ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can view items
CREATE POLICY "{module_name}_items_select" ON {module_name}_items
  FOR SELECT USING (
    can_view_org(org_id)
  );

-- Policy: Organization admins can insert items
CREATE POLICY "{module_name}_items_insert" ON {module_name}_items
  FOR INSERT WITH CHECK (
    is_org_admin(org_id)
  );

-- Policy: Organization admins can update items
CREATE POLICY "{module_name}_items_update" ON {module_name}_items
  FOR UPDATE USING (
    is_org_admin(org_id)
  );

-- Policy: Organization admins can delete items
CREATE POLICY "{module_name}_items_delete" ON {module_name}_items
  FOR DELETE USING (
    is_org_admin(org_id)
  );

-- Details inherit parent permissions
CREATE POLICY "{module_name}_details_select" ON {module_name}_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM {module_name}_items i
      WHERE i.id = {module_name}_item_id
      AND can_view_org(i.org_id)
    )
  );

CREATE POLICY "{module_name}_details_insert" ON {module_name}_details
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM {module_name}_items i
      WHERE i.id = {module_name}_item_id
      AND is_org_admin(i.org_id)
    )
  );

CREATE POLICY "{module_name}_details_update" ON {module_name}_details
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM {module_name}_items i
      WHERE i.id = {module_name}_item_id
      AND is_org_admin(i.org_id)
    )
  );

CREATE POLICY "{module_name}_details_delete" ON {module_name}_details
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM {module_name}_items i
      WHERE i.id = {module_name}_item_id
      AND is_org_admin(i.org_id)
    )
  );


-- ============================================================================
-- HELPER FUNCTIONS (Optional)
-- ============================================================================

-- Example: Get summary for an organization
CREATE OR REPLACE FUNCTION get_{module_name}_summary(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Check access
  IF NOT can_view_org(p_org_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    'active_count', COUNT(*) FILTER (WHERE status = 'active'),
    'inactive_count', COUNT(*) FILTER (WHERE status = 'inactive')
  ) INTO result
  FROM {module_name}_items
  WHERE org_id = p_org_id;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;


-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE {module_name}_items IS '{ModuleName} - main items table';
COMMENT ON TABLE {module_name}_details IS '{ModuleName} - item details';
COMMENT ON FUNCTION get_{module_name}_summary IS 'Get summary statistics for {module_name}';
