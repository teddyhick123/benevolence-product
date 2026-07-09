-- =============================================================================
-- db/migrations/0050_custom_fields.sql
-- Migration: Phase 2 Runtime Custom Fields
-- Date: 2026-07-08
--
-- Adds org-scoped typed custom fields and values for grants, holdings, donors,
-- and contributions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_custom_field_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type       text NOT NULL CHECK (entity_type IN ('grant', 'holding', 'donor', 'contribution')),
  field_key         text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  field_label       text NOT NULL CHECK (length(field_label) BETWEEN 1 AND 120),
  field_type        text NOT NULL CHECK (field_type IN ('text', 'integer', 'decimal', 'boolean', 'date', 'enum')),
  enum_options      jsonb,
  required_at_stage text,
  is_ai_readable    boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_field_required_stage_check CHECK (
    required_at_stage IS NULL
    OR (
      entity_type = 'grant'
      AND required_at_stage IN (
        'draft', 'prospect', 'invited', 'application_received',
        'due_diligence', 'recommended', 'approved', 'agreement',
        'active', 'renewal_review', 'closeout', 'closed',
        'declined', 'cancelled'
      )
    )
  ),
  CONSTRAINT custom_field_enum_options_check CHECK (
    (field_type = 'enum' AND jsonb_typeof(enum_options) = 'array' AND jsonb_array_length(enum_options) > 0)
    OR (field_type <> 'enum' AND enum_options IS NULL)
  ),
  UNIQUE (org_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_definitions_org_entity
  ON public.org_custom_field_definitions (org_id, entity_type, sort_order);

CREATE INDEX IF NOT EXISTS idx_custom_field_definitions_required_stage
  ON public.org_custom_field_definitions (org_id, required_at_stage)
  WHERE entity_type = 'grant' AND required_at_stage IS NOT NULL;

ALTER TABLE public.org_custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_custom_field_definitions_read" ON public.org_custom_field_definitions
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_custom_field_definitions_write" ON public.org_custom_field_definitions
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "org_custom_field_definitions_service" ON public.org_custom_field_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_custom_field_definitions TO authenticated;
GRANT ALL ON public.org_custom_field_definitions TO service_role;

CREATE TRIGGER set_org_custom_field_definitions_updated_at
  BEFORE UPDATE ON public.org_custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.org_custom_field_values (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id           uuid NOT NULL,
  entity_type         text NOT NULL CHECK (entity_type IN ('grant', 'holding', 'donor', 'contribution')),
  field_definition_id uuid NOT NULL REFERENCES public.org_custom_field_definitions(id) ON DELETE CASCADE,
  value_text          text,
  value_numeric       numeric,
  value_boolean       boolean,
  value_date          date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_org_entity
  ON public.org_custom_field_values (org_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_definition
  ON public.org_custom_field_values (field_definition_id);

ALTER TABLE public.org_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_custom_field_values_read" ON public.org_custom_field_values
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_custom_field_values_write" ON public.org_custom_field_values
  FOR ALL TO authenticated
  USING (public.can_view_org(org_id))
  WITH CHECK (public.can_view_org(org_id));

CREATE POLICY "org_custom_field_values_service" ON public.org_custom_field_values
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_custom_field_values TO authenticated;
GRANT ALL ON public.org_custom_field_values TO service_role;

CREATE TRIGGER set_org_custom_field_values_updated_at
  BEFORE UPDATE ON public.org_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.custom_field_entity_org(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF p_entity_type = 'grant' THEN
    SELECT org_id INTO v_org_id FROM public.grants WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'holding' THEN
    SELECT org_id INTO v_org_id FROM public.holdings WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'donor' THEN
    SELECT org_id INTO v_org_id FROM public.donors WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'contribution' THEN
    SELECT org_id INTO v_org_id FROM public.contributions_received WHERE id = p_entity_id;
    IF v_org_id IS NULL THEN
      SELECT org_id INTO v_org_id FROM public.tax_contributions WHERE id = p_entity_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'CUSTOM_FIELD_UNKNOWN_ENTITY_TYPE: %', p_entity_type USING ERRCODE = '23514';
  END IF;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_field_entity_org(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.custom_field_entity_org(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_custom_field_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_definition record;
  v_entity_org_id uuid;
  v_populated_count int;
  v_enum_value text;
BEGIN
  SELECT org_id, entity_type, field_type, enum_options
  INTO v_definition
  FROM public.org_custom_field_definitions
  WHERE id = NEW.field_definition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_DEFINITION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_definition.org_id
     OR NEW.entity_type IS DISTINCT FROM v_definition.entity_type THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_DEFINITION_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_entity_org_id := public.custom_field_entity_org(NEW.entity_type, NEW.entity_id);
  IF v_entity_org_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_ENTITY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_entity_org_id THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_ENTITY_ORG_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_populated_count :=
    CASE WHEN NEW.value_text IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NEW.value_numeric IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NEW.value_boolean IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NEW.value_date IS NOT NULL THEN 1 ELSE 0 END;

  IF v_populated_count <> 1 THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_VALUE_REQUIRES_EXACTLY_ONE_TYPED_VALUE' USING ERRCODE = '23514';
  END IF;

  IF v_definition.field_type IN ('text', 'enum') AND NEW.value_text IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_VALUE_TYPE_MISMATCH' USING ERRCODE = '23514';
  ELSIF v_definition.field_type IN ('integer', 'decimal') AND NEW.value_numeric IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_VALUE_TYPE_MISMATCH' USING ERRCODE = '23514';
  ELSIF v_definition.field_type = 'boolean' AND NEW.value_boolean IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_VALUE_TYPE_MISMATCH' USING ERRCODE = '23514';
  ELSIF v_definition.field_type = 'date' AND NEW.value_date IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_VALUE_TYPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF v_definition.field_type = 'integer' AND NEW.value_numeric <> trunc(NEW.value_numeric) THEN
    RAISE EXCEPTION 'CUSTOM_FIELD_INTEGER_VALUE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF v_definition.field_type = 'enum' THEN
    v_enum_value := NEW.value_text;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_definition.enum_options) opt
      WHERE opt->>'value' = v_enum_value
    ) THEN
      RAISE EXCEPTION 'CUSTOM_FIELD_ENUM_VALUE_INVALID' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_custom_field_value_before_insert_update
  BEFORE INSERT OR UPDATE ON public.org_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.validate_custom_field_value();
