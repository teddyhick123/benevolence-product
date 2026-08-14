-- =============================================================================
-- db/migrations/0051_configurable_automations.sql
-- Migration: Phase 3 Configurable Automations
-- Date: 2026-07-08
--
-- Adds org-scoped automation rules and run logs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_automation_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  is_active      boolean NOT NULL DEFAULT true,
  trigger_type   text NOT NULL CHECK (trigger_type IN ('grant_stage_change', 'date_relative', 'custom_field_set', 'task_completed')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  action_type    text NOT NULL CHECK (action_type IN ('create_task', 'notify_member', 'set_custom_field')),
  action_config  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_automation_rule_trigger_shape CHECK (
    (
      trigger_type = 'grant_stage_change'
      AND trigger_config ? 'stage'
      AND trigger_config->>'stage' IN (
        'draft', 'prospect', 'invited', 'application_received',
        'due_diligence', 'recommended', 'approved', 'agreement',
        'active', 'renewal_review', 'closeout', 'closed',
        'declined', 'cancelled'
      )
    )
    OR (
      trigger_type = 'date_relative'
      AND trigger_config ? 'entity_type'
      AND trigger_config ? 'anchor'
      AND trigger_config ? 'offset_days'
      AND trigger_config->>'entity_type' IN ('grant')
      AND trigger_config->>'anchor' IN ('grant_period_start', 'grant_period_end', 'created_at', 'updated_at')
      AND jsonb_typeof(trigger_config->'offset_days') = 'number'
    )
    OR (
      trigger_type = 'custom_field_set'
      AND trigger_config ? 'entity_type'
      AND trigger_config ? 'field_key'
    )
    OR (
      trigger_type = 'task_completed'
      AND trigger_config ? 'task_type'
    )
  ),
  CONSTRAINT org_automation_rule_action_shape CHECK (
    (
      action_type = 'create_task'
      AND action_config ? 'title_template'
    )
    OR (
      action_type = 'notify_member'
      AND action_config ? 'message_template'
    )
    OR (
      action_type = 'set_custom_field'
      AND action_config ? 'field_key'
      AND action_config ? 'value'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_org_automation_rules_org_trigger
  ON public.org_automation_rules (org_id, trigger_type, is_active);

ALTER TABLE public.org_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_automation_rules_read" ON public.org_automation_rules
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_automation_rules_write" ON public.org_automation_rules
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "org_automation_rules_service" ON public.org_automation_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_automation_rules TO authenticated;
GRANT ALL ON public.org_automation_rules TO service_role;

CREATE TRIGGER set_org_automation_rules_updated_at
  BEFORE UPDATE ON public.org_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.org_automation_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id             uuid REFERENCES public.org_automation_rules(id) ON DELETE SET NULL,
  trigger_entity_type text NOT NULL,
  trigger_entity_id   uuid NOT NULL,
  idempotency_key     text UNIQUE,
  status              text NOT NULL CHECK (status IN ('queued', 'completed', 'failed', 'skipped')),
  result              jsonb NOT NULL DEFAULT '{}'::jsonb,
  ran_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_automation_runs_org_rule
  ON public.org_automation_runs (org_id, rule_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_automation_runs_entity
  ON public.org_automation_runs (org_id, trigger_entity_type, trigger_entity_id, ran_at DESC);

ALTER TABLE public.org_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_automation_runs_read" ON public.org_automation_runs
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));

CREATE POLICY "org_automation_runs_service" ON public.org_automation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.org_automation_runs TO authenticated;
GRANT ALL ON public.org_automation_runs TO service_role;

-- Durable handoff for configurable automation triggered by a custom-field
-- mutation. The value mutation and its event commit together; execution may
-- safely happen after the request and is retried by a service-only worker.
CREATE TABLE IF NOT EXISTS public.org_automation_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('custom_field_set')),
  entity_type text NOT NULL CHECK (entity_type IN ('grant', 'holding', 'donor', 'contribution')),
  entity_id   uuid NOT NULL,
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts    integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  completed_at timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_automation_outbox_ready
  ON public.org_automation_outbox (available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_org_automation_outbox_stale
  ON public.org_automation_outbox (claimed_at)
  WHERE status = 'processing';

ALTER TABLE public.org_automation_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_automation_outbox_service" ON public.org_automation_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.org_automation_outbox TO service_role;

CREATE TRIGGER set_org_automation_outbox_updated_at
  BEFORE UPDATE ON public.org_automation_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply a fully normalized custom-field request and enqueue one immutable
-- event for every changed field. All validation occurs before the first write;
-- any error rolls the values and events back as one transaction.
CREATE OR REPLACE FUNCTION public.mutate_custom_field_values(
  p_org_id uuid,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change record;
  v_definition record;
  v_entity_org_id uuid;
  v_change_count integer;
  v_outbox_ids uuid[] := ARRAY[]::uuid[];
  v_outbox_id uuid;
  v_value jsonb;
BEGIN
  IF p_entity_type NOT IN ('grant', 'holding', 'donor', 'contribution') THEN
    RAISE EXCEPTION 'Invalid custom-field entity type' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'Custom-field changes must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_change_count
  FROM jsonb_array_elements(p_changes);
  IF v_change_count = 0 THEN
    RAISE EXCEPTION 'At least one custom-field change is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE org_id = p_org_id
      AND user_id = p_actor_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization membership is required' USING ERRCODE = '42501';
  END IF;

  v_entity_org_id := public.custom_field_entity_org(p_entity_type, p_entity_id);
  IF v_entity_org_id IS NULL OR v_entity_org_id <> p_org_id THEN
    RAISE EXCEPTION 'Custom-field entity not found' USING ERRCODE = 'P0002';
  END IF;

  -- Validate every requested definition and reject duplicate targets before
  -- changing any row. The value trigger remains the canonical typed-value
  -- validator when each upsert is performed below.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_changes) AS item(value)
    GROUP BY item.value->>'field_definition_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate custom-field definition in one request' USING ERRCODE = '22023';
  END IF;

  FOR v_change IN
    SELECT *
    FROM jsonb_to_recordset(p_changes) AS item(
      field_definition_id uuid,
      value_text text,
      value_numeric numeric,
      value_boolean boolean,
      value_date date
    )
  LOOP
    IF v_change.field_definition_id IS NULL THEN
      RAISE EXCEPTION 'Custom-field definition is required' USING ERRCODE = '22023';
    END IF;
    SELECT id, field_key INTO v_definition
    FROM public.org_custom_field_definitions
    WHERE id = v_change.field_definition_id
      AND org_id = p_org_id
      AND entity_type = p_entity_type;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Custom-field definition not found' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  FOR v_change IN
    SELECT *
    FROM jsonb_to_recordset(p_changes) AS item(
      field_definition_id uuid,
      value_text text,
      value_numeric numeric,
      value_boolean boolean,
      value_date date
    )
  LOOP
    SELECT id, field_key INTO v_definition
    FROM public.org_custom_field_definitions
    WHERE id = v_change.field_definition_id;

    IF v_change.value_text IS NULL
       AND v_change.value_numeric IS NULL
       AND v_change.value_boolean IS NULL
       AND v_change.value_date IS NULL THEN
      DELETE FROM public.org_custom_field_values
      WHERE org_id = p_org_id
        AND entity_type = p_entity_type
        AND entity_id = p_entity_id
        AND field_definition_id = v_change.field_definition_id;
      v_value := 'null'::jsonb;
    ELSE
      INSERT INTO public.org_custom_field_values (
        org_id, entity_type, entity_id, field_definition_id,
        value_text, value_numeric, value_boolean, value_date
      ) VALUES (
        p_org_id, p_entity_type, p_entity_id, v_change.field_definition_id,
        v_change.value_text, v_change.value_numeric, v_change.value_boolean, v_change.value_date
      )
      ON CONFLICT (entity_id, field_definition_id) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        entity_type = EXCLUDED.entity_type,
        value_text = EXCLUDED.value_text,
        value_numeric = EXCLUDED.value_numeric,
        value_boolean = EXCLUDED.value_boolean,
        value_date = EXCLUDED.value_date;
      v_value := COALESCE(
        to_jsonb(v_change.value_text),
        to_jsonb(v_change.value_numeric),
        to_jsonb(v_change.value_boolean),
        to_jsonb(v_change.value_date)
      );
    END IF;

    INSERT INTO public.org_automation_outbox (
      org_id, event_type, entity_type, entity_id, payload
    ) VALUES (
      p_org_id,
      'custom_field_set',
      p_entity_type,
      p_entity_id,
      jsonb_build_object(
        'entity_type', p_entity_type,
        'field_key', v_definition.field_key,
        'field_definition_id', v_change.field_definition_id,
        'value', v_value,
        'actor_id', p_actor_id
      )
    ) RETURNING id INTO v_outbox_id;
    v_outbox_ids := array_append(v_outbox_ids, v_outbox_id);
  END LOOP;

  RETURN jsonb_build_object(
    'change_count', v_change_count,
    'outbox_event_ids', to_jsonb(v_outbox_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_custom_field_values(uuid, uuid, text, uuid, jsonb)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_custom_field_values(uuid, uuid, text, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_org_automation_outbox(
  p_limit integer DEFAULT 50,
  p_org_id uuid DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS SETOF public.org_automation_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT id
    FROM public.org_automation_outbox
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
      AND (p_event_id IS NULL OR id = p_event_id)
      AND attempts < 10
      AND (
        (status IN ('pending', 'failed') AND available_at <= now())
        OR (status = 'processing' AND claimed_at < now() - interval '15 minutes')
      )
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 100), 1)
  )
  UPDATE public.org_automation_outbox outbox
  SET status = 'processing', claimed_at = now(), attempts = attempts + 1, last_error = NULL
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
$$;

REVOKE ALL ON FUNCTION public.claim_org_automation_outbox(integer, uuid, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_org_automation_outbox(integer, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_org_automation_outbox(
  p_event_id uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.org_automation_outbox
  SET
    status = CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    completed_at = CASE WHEN p_succeeded THEN now() ELSE NULL END,
    available_at = CASE
      WHEN p_succeeded THEN available_at
      ELSE now() + make_interval(secs => LEAST(3600, 30 * power(2, LEAST(attempts, 7))::integer))
    END,
    last_error = CASE WHEN p_succeeded THEN NULL ELSE left(COALESCE(p_error, 'Automation processing failed'), 2000) END
  WHERE id = p_event_id
    AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.finish_org_automation_outbox(uuid, boolean, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_org_automation_outbox(uuid, boolean, text)
  TO service_role;
