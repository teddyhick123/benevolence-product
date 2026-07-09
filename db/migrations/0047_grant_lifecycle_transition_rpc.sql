-- =============================================================================
-- 0047_grant_lifecycle_transition_rpc.sql
-- Atomic grant lifecycle transitions.
--
-- transitionGrant() validates the state machine in TypeScript, then calls this
-- RPC so the decision, grant stage update, and status history insert commit or
-- roll back together.
-- =============================================================================

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

CREATE OR REPLACE FUNCTION public.transition_grant_lifecycle_batch(
  p_expected_org_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_transitions JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_results JSONB := '[]'::JSONB;
  v_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_transitions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'TRANSITIONS_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_transitions) LOOP
    v_count := v_count + 1;

    PERFORM public.transition_grant_lifecycle(
      (v_item->>'grant_id')::UUID,
      p_expected_org_id,
      v_item->>'expected_from_stage',
      v_item->>'target_stage',
      p_actor_id,
      v_item->>'reason',
      NULLIF(v_item->'decision_payload', 'null'::JSONB)
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'grantId', v_item->>'grant_id',
      'fromStage', v_item->>'expected_from_stage',
      'targetStage', v_item->>'target_stage',
      'success', true
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'successCount', v_count,
    'failureCount', 0,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_grant_lifecycle_batch(UUID, UUID, JSONB) TO service_role;
