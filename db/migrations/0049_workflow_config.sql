-- =============================================================================
-- db/migrations/0049_workflow_config.sql
-- Migration: Phase 1 Runtime Workflow Configuration
-- Date: 2026-06-29
--
-- Creates two tables:
-- 1. org_workflow_config: Configuration for workflow stages, checklists, fields, approvals
-- 2. grant_checklist_completions: Tracks checklist item completion per grant per stage
--
-- Also updates transition_grant_lifecycle RPC to clear checklist completions
-- atomically when exiting a stage.
-- =============================================================================

-- ─── TABLE: org_workflow_config ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_workflow_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module       text        NOT NULL DEFAULT 'grant_management',
  config_type  text        NOT NULL CHECK (config_type IN (
                             'stage_checklist', 'stage_label',
                             'required_field', 'approval_requirement'
                           )),
  stage_key    text        NOT NULL,
  config_key   text        NOT NULL CHECK (config_key ~ '^[a-z0-9_]+$' OR config_key IN ('label', 'default')),
  config_value jsonb       NOT NULL,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_workflow_config_grant_stage_check CHECK (
    module <> 'grant_management'
    OR stage_key IN (
      'draft', 'prospect', 'invited', 'application_received',
      'due_diligence', 'recommended', 'approved', 'agreement',
      'active', 'renewal_review', 'closeout', 'closed',
      'declined', 'cancelled'
    )
  ),
  CONSTRAINT org_workflow_config_required_field_check CHECK (
    config_type <> 'required_field'
    OR (
      config_key IN (
        'purpose', 'internal_owner_id', 'requested_amount', 'approved_amount',
        'grant_period_start', 'grant_period_end', 'risk_level',
        'deliverables', 'reporting_frequency'
      )
      AND config_value->>'field_name' = config_key
    )
  ),
  UNIQUE (org_id, module, config_type, stage_key, config_key)
);

CREATE INDEX IF NOT EXISTS idx_org_workflow_config_org_module
  ON public.org_workflow_config (org_id, module);

ALTER TABLE public.org_workflow_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_workflow_config_read" ON public.org_workflow_config
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_workflow_config_write" ON public.org_workflow_config
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "org_workflow_config_service" ON public.org_workflow_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_workflow_config TO authenticated;
GRANT ALL ON public.org_workflow_config TO service_role;

CREATE TRIGGER set_org_workflow_config_updated_at
  BEFORE UPDATE ON public.org_workflow_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── TABLE: grant_checklist_completions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grant_checklist_completions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grant_id           uuid        NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  workflow_config_id uuid        NOT NULL REFERENCES public.org_workflow_config(id) ON DELETE CASCADE,
  stage_key          text        NOT NULL,
  checklist_item_key text        NOT NULL,
  completed_by       uuid        NOT NULL REFERENCES auth.users(id),
  completed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grant_id, workflow_config_id)
);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_grant_stage
  ON public.grant_checklist_completions (grant_id, stage_key);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_config
  ON public.grant_checklist_completions (workflow_config_id);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_org
  ON public.grant_checklist_completions (org_id);

ALTER TABLE public.grant_checklist_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grant_checklist_completions_read" ON public.grant_checklist_completions
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "grant_checklist_completions_insert" ON public.grant_checklist_completions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id) AND completed_by = auth.uid());

CREATE POLICY "grant_checklist_completions_delete" ON public.grant_checklist_completions
  FOR DELETE TO authenticated
  USING (completed_by = auth.uid() OR public.is_org_admin(org_id));

CREATE POLICY "grant_checklist_completions_service" ON public.grant_checklist_completions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.grant_checklist_completions TO authenticated;
GRANT ALL ON public.grant_checklist_completions TO service_role;

CREATE OR REPLACE FUNCTION public.validate_grant_checklist_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_grant_org_id uuid;
  v_config record;
BEGIN
  SELECT org_id
  INTO v_grant_org_id
  FROM public.grants
  WHERE id = NEW.grant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_CHECKLIST_GRANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT org_id, module, config_type, stage_key, config_key
  INTO v_config
  FROM public.org_workflow_config
  WHERE id = NEW.workflow_config_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_CHECKLIST_CONFIG_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_grant_org_id
     OR NEW.org_id IS DISTINCT FROM v_config.org_id THEN
    RAISE EXCEPTION 'GRANT_CHECKLIST_ORG_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF v_config.module IS DISTINCT FROM 'grant_management'
     OR v_config.config_type IS DISTINCT FROM 'stage_checklist'
     OR NEW.stage_key IS DISTINCT FROM v_config.stage_key
     OR NEW.checklist_item_key IS DISTINCT FROM v_config.config_key THEN
    RAISE EXCEPTION 'GRANT_CHECKLIST_CONFIG_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grant_checklist_completion_before_insert
  BEFORE INSERT ON public.grant_checklist_completions
  FOR EACH ROW EXECUTE FUNCTION public.validate_grant_checklist_completion();

-- ─── RPC UPDATE: transition_grant_lifecycle ───────────────────────────────────
-- Updated version with checklist completion clearing inserted atomically
-- immediately before INSERT INTO public.grant_status_history.

CREATE OR REPLACE FUNCTION public.transition_grant_lifecycle(
  p_grant_id UUID,
  p_expected_org_id UUID,
  p_expected_from_stage TEXT,
  p_to_stage TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_decision_payload JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_from_stage TEXT;
BEGIN
  SELECT org_id, lifecycle_stage
  INTO v_org_id, v_from_stage
  FROM public.grants
  WHERE id = p_grant_id
  FOR UPDATE;

  IF NOT FOUND OR v_org_id IS DISTINCT FROM p_expected_org_id THEN
    RAISE EXCEPTION 'GRANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_from_stage IS DISTINCT FROM p_expected_from_stage THEN
    RAISE EXCEPTION 'GRANT_TRANSITION_CONFLICT: expected %, found %', p_expected_from_stage, v_from_stage
      USING ERRCODE = '40001';
  END IF;

  IF p_decision_payload IS NOT NULL AND jsonb_typeof(p_decision_payload) IS DISTINCT FROM 'null' THEN
    INSERT INTO public.grant_decisions (
      grant_id,
      org_id,
      decision_type,
      decision,
      decision_date,
      decided_by,
      amount,
      conditions,
      rationale,
      board_meeting_date,
      metadata
    )
    VALUES (
      p_grant_id,
      v_org_id,
      p_decision_payload->>'decision_type',
      p_decision_payload->>'decision',
      (p_decision_payload->>'decision_date')::DATE,
      NULLIF(p_decision_payload->>'decided_by', '')::UUID,
      NULLIF(p_decision_payload->>'amount', '')::NUMERIC,
      p_decision_payload->>'conditions',
      p_decision_payload->>'rationale',
      NULLIF(p_decision_payload->>'board_meeting_date', '')::DATE,
      COALESCE(p_decision_payload->'metadata', '{}'::JSONB)
    );
  END IF;

  UPDATE public.grants
  SET lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_grant_id
    AND org_id = v_org_id
    AND lifecycle_stage = p_expected_from_stage;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_TRANSITION_CONFLICT: expected %, found changed', p_expected_from_stage
      USING ERRCODE = '40001';
  END IF;

  -- Clear checklist completions for the stage being exited.
  -- workflow_config_id FK cascade handles removal when config items are deleted,
  -- but stage-exit clearing must happen atomically here.
  DELETE FROM public.grant_checklist_completions
  WHERE grant_id = p_grant_id
    AND stage_key = p_expected_from_stage;

  INSERT INTO public.grant_status_history (
    grant_id,
    org_id,
    from_stage,
    to_stage,
    reason,
    actor_id
  )
  VALUES (
    p_grant_id,
    v_org_id,
    p_expected_from_stage,
    p_to_stage,
    p_reason,
    p_actor_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_grant_lifecycle(UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role;
