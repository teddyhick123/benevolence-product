-- =============================================================================
-- 0056_onboarding_provisioning_recovery.sql
-- Makes onboarding-created automations idempotent across setup retries.
-- =============================================================================

ALTER TABLE public.org_automation_rules
  ADD COLUMN IF NOT EXISTS onboarding_session_id uuid
  REFERENCES public.onboarding_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.org_automation_rules
  DROP CONSTRAINT IF EXISTS org_automation_rules_onboarding_session_rule_key;

ALTER TABLE public.org_automation_rules
  ADD CONSTRAINT org_automation_rules_onboarding_session_rule_key
  UNIQUE (org_id, onboarding_session_id, name);

CREATE INDEX IF NOT EXISTS idx_org_automation_rules_onboarding_session
  ON public.org_automation_rules (onboarding_session_id)
  WHERE onboarding_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Durable onboarding provisioning
-- ---------------------------------------------------------------------------
-- A session is the idempotency key for the entire onboarding handoff. This is
-- intentionally one transaction: an organization is never visible without its
-- owner portfolio, blueprint configuration, and terminal session linkage.
CREATE OR REPLACE FUNCTION public.provision_onboarding_session(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_org_type org_type_enum,
  p_ein text DEFAULT NULL,
  p_modules jsonb DEFAULT NULL,
  p_context_rows jsonb DEFAULT '[]'::jsonb,
  p_view_rows jsonb DEFAULT '[]'::jsonb,
  p_workflow_rows jsonb DEFAULT '[]'::jsonb,
  p_custom_field_rows jsonb DEFAULT '[]'::jsonb,
  p_automation_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.onboarding_sessions%ROWTYPE;
  v_org_id uuid;
  v_portfolio_id uuid;
  v_modules jsonb;
  v_enabled_modules jsonb;
  v_started_at timestamptz;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_context_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_view_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_workflow_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_custom_field_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_automation_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Onboarding blueprint rows must be arrays' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  SELECT * INTO v_session
  FROM public.onboarding_sessions
  WHERE id = p_session_id AND user_id = p_owner_user_id
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding session not found' USING ERRCODE = 'P0002';
  END IF;

  -- A completed session is an immutable idempotency record. Replays return
  -- the original setup and do not apply a caller's newer module/config payload.
  IF v_session.status = 'completed' AND v_session.org_id IS NOT NULL THEN
    SELECT id INTO v_portfolio_id
    FROM public.portfolios
    WHERE org_id = v_session.org_id AND owner_id = p_owner_user_id AND deleted_at IS NULL
    ORDER BY created_at
    LIMIT 1;
    IF v_portfolio_id IS NULL THEN
      RAISE EXCEPTION 'Completed onboarding session is missing its owner portfolio' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
    INTO v_enabled_modules
    FROM jsonb_each((SELECT modules FROM public.organizations WHERE id = v_session.org_id))
    WHERE value = 'true'::jsonb;
    RETURN jsonb_build_object(
      'org_id', v_session.org_id,
      'portfolio_id', v_portfolio_id,
      'enabled_modules', v_enabled_modules
    );
  END IF;

  v_modules := COALESCE(
    p_modules,
    public.default_modules_for_org_type(p_org_type),
    '{"portfolio":true}'::jsonb
  ) || '{"portfolio":true}'::jsonb;

  v_org_id := v_session.org_id;
  IF v_org_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id = p_owner_user_id
        AND deleted_at IS NULL
        AND accepted_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'User already belongs to an organization' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.organizations (name, org_type, ein, modules)
    VALUES (trim(p_name), p_org_type, NULLIF(trim(p_ein), ''), v_modules)
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (org_id, user_id, role, accepted_at)
    VALUES (v_org_id, p_owner_user_id, 'owner', now());

    INSERT INTO public.audit_log (org_id, actor_id, action, new_values, metadata)
    VALUES (
      v_org_id,
      p_owner_user_id,
      'org.provision',
      jsonb_build_object('name', trim(p_name), 'org_type', p_org_type, 'modules', v_modules),
      jsonb_build_object('onboarding_session_id', p_session_id)
    );
  ELSE
    PERFORM 1 FROM public.organizations WHERE id = v_org_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Session organization not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.organization_members (org_id, user_id, role, accepted_at)
    VALUES (v_org_id, p_owner_user_id, 'owner', now())
    ON CONFLICT (org_id, user_id) DO UPDATE
      SET role = 'owner', accepted_at = now(), deleted_at = NULL, deleted_by = NULL;

    UPDATE public.organizations
    SET modules = v_modules
    WHERE id = v_org_id;
  END IF;

  SELECT id INTO v_portfolio_id
  FROM public.portfolios
  WHERE org_id = v_org_id AND owner_id = p_owner_user_id AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_portfolio_id IS NULL THEN
    INSERT INTO public.portfolios (org_id, owner_id, name, settings)
    VALUES (v_org_id, p_owner_user_id, trim(p_name), '{"base_currency":"USD"}'::jsonb)
    RETURNING id INTO v_portfolio_id;
  END IF;

  INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
  VALUES (v_portfolio_id, p_owner_user_id, 'owner')
  ON CONFLICT (portfolio_id, user_id) DO UPDATE
    SET role = 'owner', deleted_at = NULL, deleted_by = NULL;

  INSERT INTO public.org_ai_context (
    org_id, context_type, context_key, context_value, source, is_active, created_by
  )
  SELECT v_org_id, r.context_type, r.context_key, r.context_value, r.source, r.is_active, r.created_by
  FROM jsonb_to_recordset(COALESCE(p_context_rows, '[]'::jsonb)) AS r(
    context_type text, context_key text, context_value text, source text, is_active boolean, created_by uuid
  )
  ON CONFLICT (org_id, context_key) DO UPDATE SET
    context_type = EXCLUDED.context_type,
    context_value = EXCLUDED.context_value,
    source = EXCLUDED.source,
    is_active = EXCLUDED.is_active,
    created_by = EXCLUDED.created_by;

  INSERT INTO public.org_view_config (org_id, config_scope, scope_key, config_value)
  SELECT v_org_id, r.config_scope, r.scope_key, r.config_value
  FROM jsonb_to_recordset(COALESCE(p_view_rows, '[]'::jsonb)) AS r(
    config_scope text, scope_key text, config_value jsonb
  )
  ON CONFLICT (org_id, config_scope, scope_key) DO UPDATE SET
    config_value = EXCLUDED.config_value;

  INSERT INTO public.org_workflow_config (
    org_id, module, config_type, stage_key, config_key, config_value, sort_order
  )
  SELECT v_org_id, r.module, r.config_type, r.stage_key, r.config_key, r.config_value, r.sort_order
  FROM jsonb_to_recordset(COALESCE(p_workflow_rows, '[]'::jsonb)) AS r(
    module text, config_type text, stage_key text, config_key text, config_value jsonb, sort_order integer
  )
  ON CONFLICT (org_id, module, config_type, stage_key, config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    sort_order = EXCLUDED.sort_order;

  INSERT INTO public.org_custom_field_definitions (
    org_id, entity_type, field_key, field_label, field_type, enum_options,
    required_at_stage, is_ai_readable, sort_order
  )
  SELECT
    v_org_id, r.entity_type, r.field_key, r.field_label, r.field_type, r.enum_options,
    r.required_at_stage, r.is_ai_readable, r.sort_order
  FROM jsonb_to_recordset(COALESCE(p_custom_field_rows, '[]'::jsonb)) AS r(
    entity_type text, field_key text, field_label text, field_type text, enum_options jsonb,
    required_at_stage text, is_ai_readable boolean, sort_order integer
  )
  ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_type = EXCLUDED.field_type,
    enum_options = EXCLUDED.enum_options,
    required_at_stage = EXCLUDED.required_at_stage,
    is_ai_readable = EXCLUDED.is_ai_readable,
    sort_order = EXCLUDED.sort_order;

  INSERT INTO public.org_automation_rules (
    org_id, onboarding_session_id, name, is_active, trigger_type, trigger_config,
    conditions, action_type, action_config, created_by
  )
  SELECT
    v_org_id, p_session_id, r.name, r.is_active, r.trigger_type, r.trigger_config,
    r.conditions, r.action_type, r.action_config, r.created_by
  FROM jsonb_to_recordset(COALESCE(p_automation_rows, '[]'::jsonb)) AS r(
    name text, is_active boolean, trigger_type text, trigger_config jsonb,
    conditions jsonb, action_type text, action_config jsonb, created_by uuid
  )
  ON CONFLICT (org_id, onboarding_session_id, name) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    trigger_type = EXCLUDED.trigger_type,
    trigger_config = EXCLUDED.trigger_config,
    conditions = EXCLUDED.conditions,
    action_type = EXCLUDED.action_type,
    action_config = EXCLUDED.action_config,
    created_by = EXCLUDED.created_by;

  UPDATE public.onboarding_sessions
  SET org_id = v_org_id, status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  v_started_at := v_session.started_at;
  UPDATE public.onboarding_analytics
  SET total_duration_seconds = CASE
        WHEN v_started_at IS NULL THEN total_duration_seconds
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM now() - v_started_at))::integer)
      END,
      completed_successfully = true
  WHERE session_id = p_session_id;

  SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
  INTO v_enabled_modules
  FROM jsonb_each(v_modules)
  WHERE value = 'true'::jsonb;

  RETURN jsonb_build_object(
    'org_id', v_org_id,
    'portfolio_id', v_portfolio_id,
    'enabled_modules', v_enabled_modules
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_onboarding_session(
  uuid, uuid, text, org_type_enum, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_onboarding_session(
  uuid, uuid, text, org_type_enum, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) TO service_role;
