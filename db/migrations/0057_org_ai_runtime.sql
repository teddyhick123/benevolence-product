-- =============================================================================
-- 0057_org_ai_runtime.sql
-- Organization-managed AI connections, deployments, workload routes, durable
-- execution snapshots, and provider-neutral invocation metadata.
-- Depends on: 0002, 0024, 0030, 0033
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Organization AI configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_ai_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector        text NOT NULL CHECK (btrim(connector) <> ''),
  name             text NOT NULL CHECK (btrim(name) <> ''),
  endpoint_url     text,
  region           text,
  auth_type        text NOT NULL CHECK (btrim(auth_type) <> ''),
  config           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'invalid', 'disabled')),
  last_tested_at   timestamptz,
  last_test_status text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS org_ai_connections_org_status_idx
  ON public.org_ai_connections(org_id, status);

CREATE TABLE IF NOT EXISTS public.org_ai_credentials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL,
  connection_id      uuid NOT NULL,
  encrypted_payload  text NOT NULL CHECK (btrim(encrypted_payload) <> ''),
  encryption_key_id  text NOT NULL CHECK (btrim(encryption_key_id) <> ''),
  secret_fingerprint text NOT NULL CHECK (btrim(secret_fingerprint) <> ''),
  fingerprint_key_id text NOT NULL CHECK (btrim(fingerprint_key_id) <> ''),
  display_hint       text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rotated_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id),
  FOREIGN KEY (connection_id, org_id)
    REFERENCES public.org_ai_connections(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS org_ai_credentials_org_idx
  ON public.org_ai_credentials(org_id);

CREATE TABLE IF NOT EXISTS public.org_ai_deployments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  connection_id       uuid NOT NULL,
  name                text NOT NULL CHECK (btrim(name) <> ''),
  catalog_template_id text,
  provider_model_id   text NOT NULL CHECK (btrim(provider_model_id) <> ''),
  config              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  verified_workloads  jsonb NOT NULL DEFAULT '{}'::jsonb
                      CHECK (jsonb_typeof(verified_workloads) = 'object'),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'invalid', 'disabled')),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (id, org_id),
  FOREIGN KEY (connection_id, org_id)
    REFERENCES public.org_ai_connections(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS org_ai_deployments_org_status_idx
  ON public.org_ai_deployments(org_id, status);
CREATE INDEX IF NOT EXISTS org_ai_deployments_connection_idx
  ON public.org_ai_deployments(connection_id);

CREATE TABLE IF NOT EXISTS public.org_ai_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workload_id text NOT NULL CHECK (btrim(workload_id) <> ''),
  policy      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(policy) = 'object'),
  is_enabled  boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, workload_id),
  UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS org_ai_routes_org_enabled_idx
  ON public.org_ai_routes(org_id, is_enabled);

CREATE TABLE IF NOT EXISTS public.org_ai_route_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  route_id      uuid NOT NULL,
  position      integer NOT NULL CHECK (position >= 0),
  target_kind   text NOT NULL CHECK (target_kind IN ('deployment', 'platform_default')),
  deployment_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, position),
  UNIQUE (route_id, deployment_id),
  FOREIGN KEY (route_id, org_id)
    REFERENCES public.org_ai_routes(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (deployment_id, org_id)
    REFERENCES public.org_ai_deployments(id, org_id) ON DELETE RESTRICT,
  CHECK (
    (target_kind = 'deployment' AND deployment_id IS NOT NULL)
    OR (target_kind = 'platform_default' AND deployment_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS org_ai_route_targets_one_platform_default
  ON public.org_ai_route_targets(route_id)
  WHERE target_kind = 'platform_default';
CREATE INDEX IF NOT EXISTS org_ai_route_targets_route_position_idx
  ON public.org_ai_route_targets(route_id, position);

CREATE TRIGGER set_org_ai_connections_updated_at
  BEFORE UPDATE ON public.org_ai_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_org_ai_credentials_updated_at
  BEFORE UPDATE ON public.org_ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_org_ai_deployments_updated_at
  BEFORE UPDATE ON public.org_ai_deployments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_org_ai_routes_updated_at
  BEFORE UPDATE ON public.org_ai_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Replace an entire ordered route in one transaction. The application validates
-- workload, catalog, capability, and policy semantics before calling this RPC;
-- this database boundary protects cross-row tenant and ordering invariants.
CREATE OR REPLACE FUNCTION public.replace_org_ai_route(
  p_org_id      uuid,
  p_actor_id    uuid,
  p_workload_id text,
  p_policy      jsonb,
  p_is_enabled  boolean,
  p_targets     jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route_id uuid;
  v_target_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_workload_id IS NULL OR btrim(p_workload_id) = '' THEN
    RAISE EXCEPTION 'Workload is required' USING ERRCODE = '22023';
  END IF;
  IF p_policy IS NULL OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Route policy must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_targets IS NULL OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Route targets must be an array' USING ERRCODE = '22023';
  END IF;

  v_target_count := jsonb_array_length(p_targets);
  IF v_target_count < 1 OR v_target_count > 10 THEN
    RAISE EXCEPTION 'Route requires between one and ten targets' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_targets) AS target
    WHERE target->>'kind' NOT IN ('deployment', 'platform_default')
      OR (target->>'kind' = 'deployment' AND target->>'deploymentId' IS NULL)
      OR (target->>'kind' = 'platform_default' AND target ? 'deploymentId')
  ) THEN
    RAISE EXCEPTION 'Route target shape is invalid' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) FROM jsonb_array_elements(p_targets) AS target
    WHERE target->>'kind' = 'platform_default'
  ) > 1 THEN
    RAISE EXCEPTION 'Platform default may appear only once' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT target->>'deploymentId'
    FROM jsonb_array_elements(p_targets) AS target
    WHERE target->>'kind' = 'deployment'
    GROUP BY target->>'deploymentId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Deployment targets must be unique' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_targets) AS target
    LEFT JOIN public.org_ai_deployments deployment
      ON deployment.id = (target->>'deploymentId')::uuid
     AND deployment.org_id = p_org_id
    LEFT JOIN public.org_ai_connections connection
      ON connection.id = deployment.connection_id
     AND connection.org_id = p_org_id
    WHERE target->>'kind' = 'deployment'
      AND (
        deployment.id IS NULL
        OR deployment.status IS DISTINCT FROM 'active'
        OR connection.status IS DISTINCT FROM 'active'
      )
  ) THEN
    RAISE EXCEPTION 'Route contains an unavailable deployment' USING ERRCODE = '23503';
  END IF;

  SELECT id INTO v_route_id
  FROM public.org_ai_routes
  WHERE org_id = p_org_id AND workload_id = p_workload_id
  FOR UPDATE;

  IF v_route_id IS NULL THEN
    INSERT INTO public.org_ai_routes (
      org_id, workload_id, policy, is_enabled, created_by, updated_by
    ) VALUES (
      p_org_id, p_workload_id, p_policy, p_is_enabled, p_actor_id, p_actor_id
    )
    RETURNING id INTO v_route_id;
  ELSE
    UPDATE public.org_ai_routes
    SET policy = p_policy,
        is_enabled = p_is_enabled,
        updated_by = p_actor_id
    WHERE id = v_route_id AND org_id = p_org_id;
  END IF;

  DELETE FROM public.org_ai_route_targets
  WHERE route_id = v_route_id AND org_id = p_org_id;

  INSERT INTO public.org_ai_route_targets (
    org_id, route_id, position, target_kind, deployment_id
  )
  SELECT
    p_org_id,
    v_route_id,
    target.ordinality - 1,
    target.value->>'kind',
    CASE
      WHEN target.value->>'kind' = 'deployment'
        THEN (target.value->>'deploymentId')::uuid
      ELSE NULL
    END
  FROM jsonb_array_elements(p_targets) WITH ORDINALITY AS target(value, ordinality);

  INSERT INTO public.org_audit_log (
    org_id, actor_id, actor_subject_id, action, target_id, metadata
  ) VALUES (
    p_org_id,
    p_actor_id,
    p_actor_id,
    'ai.route_replaced',
    v_route_id,
    jsonb_build_object(
      'workload_id', p_workload_id,
      'target_count', v_target_count,
      'is_enabled', p_is_enabled
    )
  );

  RETURN v_route_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_org_ai_route(uuid, uuid, text, jsonb, boolean, jsonb)
  FROM public;
GRANT EXECUTE ON FUNCTION public.replace_org_ai_route(uuid, uuid, text, jsonb, boolean, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Durable assistant execution-plan snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_turns
  ADD COLUMN IF NOT EXISTS execution_plan jsonb
  CHECK (execution_plan IS NULL OR jsonb_typeof(execution_plan) = 'object');

CREATE OR REPLACE FUNCTION public.guard_ai_turn_execution_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.execution_plan IS NOT NULL
     AND NEW.execution_plan IS DISTINCT FROM OLD.execution_plan THEN
    RAISE EXCEPTION 'AI turn execution plan is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_ai_turn_execution_plan
  BEFORE UPDATE ON public.ai_turns
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_turn_execution_plan();

CREATE OR REPLACE FUNCTION public.bind_ai_turn_execution_plan(
  p_turn_id        uuid,
  p_portfolio_id   uuid,
  p_user_id        uuid,
  p_execution_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turn public.ai_turns%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS DISTINCT FROM p_user_id
       OR public.can_view_portfolio(p_portfolio_id) IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_execution_plan IS NULL OR jsonb_typeof(p_execution_plan) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Execution plan must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_turn
  FROM public.ai_turns
  WHERE id = p_turn_id
    AND portfolio_id = p_portfolio_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI turn not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_turn.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'AI turn is not in progress' USING ERRCODE = '55000';
  END IF;
  IF v_turn.execution_plan IS NOT NULL THEN
    IF v_turn.execution_plan IS DISTINCT FROM p_execution_plan THEN
      RAISE EXCEPTION 'AI turn execution plan is already bound' USING ERRCODE = '55000';
    END IF;
    RETURN v_turn.execution_plan;
  END IF;

  UPDATE public.ai_turns
  SET execution_plan = p_execution_plan,
      updated_at = now()
  WHERE id = v_turn.id;

  RETURN p_execution_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_ai_turn_execution_plan(uuid, uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.bind_ai_turn_execution_plan(uuid, uuid, uuid, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provider-neutral invocation metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_user_id_fkey;
ALTER TABLE public.ai_usage_log
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.ai_usage_log
  ADD CONSTRAINT ai_usage_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_log' AND column_name = 'model'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_log' AND column_name = 'requested_model'
  ) THEN
    ALTER TABLE public.ai_usage_log RENAME COLUMN model TO requested_model;
  END IF;
END;
$$;

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS scope_kind text NOT NULL DEFAULT 'platform'
    CHECK (scope_kind IN ('organization', 'platform')),
  ADD COLUMN IF NOT EXISTS workload_id text NOT NULL DEFAULT 'assistant',
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'tool_conversation'
    CHECK (operation IN ('text_generation', 'structured_generation', 'tool_conversation', 'transcription')),
  ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.org_ai_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.org_ai_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deployment_id uuid REFERENCES public.org_ai_deployments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turn_id uuid REFERENCES public.ai_turns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connector text NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS model_vendor text,
  ADD COLUMN IF NOT EXISTS resolved_model text,
  ADD COLUMN IF NOT EXISTS resolved_provider text,
  ADD COLUMN IF NOT EXISTS provider_request_id text,
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS reasoning_tokens integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  ADD COLUMN IF NOT EXISTS audio_input_tokens integer NOT NULL DEFAULT 0 CHECK (audio_input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS audio_output_tokens integer NOT NULL DEFAULT 0 CHECK (audio_output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS reported_cost numeric,
  ADD COLUMN IF NOT EXISTS cost_currency text,
  ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'failed', 'aborted', 'timed_out')),
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS target_position integer NOT NULL DEFAULT 0 CHECK (target_position >= 0),
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  ADD COLUMN IF NOT EXISTS policy_hash text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT ai_usage_log_scope_org_check
    CHECK (scope_kind = 'platform' OR org_id IS NOT NULL),
  ADD CONSTRAINT ai_usage_log_input_tokens_check CHECK (input_tokens >= 0),
  ADD CONSTRAINT ai_usage_log_output_tokens_check CHECK (output_tokens >= 0);

CREATE INDEX IF NOT EXISTS ai_usage_log_org_workload_created_idx
  ON public.ai_usage_log(org_id, workload_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_turn_id_idx
  ON public.ai_usage_log(turn_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_log_deployment_created_idx
  ON public.ai_usage_log(deployment_id, created_at DESC);

DROP POLICY IF EXISTS "ai_usage_log_self_read" ON public.ai_usage_log;
CREATE POLICY "ai_usage_log_self_read" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "ai_usage_log_org_admin_read" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND public.is_org_admin(org_id));
CREATE POLICY "ai_usage_log_app_admin_read" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.org_ai_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_route_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_ai_connections_admin_read" ON public.org_ai_connections
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_connections_service" ON public.org_ai_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_ai_credentials_service" ON public.org_ai_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_ai_deployments_admin_read" ON public.org_ai_deployments
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_deployments_service" ON public.org_ai_deployments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_ai_routes_admin_read" ON public.org_ai_routes
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_routes_service" ON public.org_ai_routes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_ai_route_targets_admin_read" ON public.org_ai_route_targets
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_route_targets_service" ON public.org_ai_route_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.org_ai_connections TO authenticated;
GRANT SELECT ON public.org_ai_deployments TO authenticated;
GRANT SELECT ON public.org_ai_routes TO authenticated;
GRANT SELECT ON public.org_ai_route_targets TO authenticated;

GRANT ALL ON public.org_ai_connections TO service_role;
GRANT ALL ON public.org_ai_credentials TO service_role;
GRANT ALL ON public.org_ai_deployments TO service_role;
GRANT ALL ON public.org_ai_routes TO service_role;
GRANT ALL ON public.org_ai_route_targets TO service_role;

COMMENT ON TABLE public.org_ai_credentials IS
  'Service-only encrypted organization AI credential envelopes; never return rows to browser code.';
COMMENT ON COLUMN public.ai_turns.execution_plan IS
  'Immutable non-secret execution plan snapshot bound once for a durable assistant turn.';
COMMENT ON TABLE public.ai_usage_log IS
  'Provider-neutral, content-free metadata for each AI provider invocation attempt.';
