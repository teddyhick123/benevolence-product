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
