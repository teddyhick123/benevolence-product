-- =============================================================================
-- 0034_onboarding.sql
-- AI-powered onboarding: sessions, extracted profiles, module recommendations,
-- and funnel analytics.
-- Depends on: 0001, 0002
-- =============================================================================

-- ---------------------------------------------------------------------------
-- onboarding_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id            UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  status           TEXT NOT NULL DEFAULT 'intake'
                   CHECK (status IN ('intake', 'conversation', 'recommendations', 'completed', 'abandoned')),

  quick_intake         JSONB NOT NULL DEFAULT '{}'::jsonb,
  messages             JSONB NOT NULL DEFAULT '[]'::jsonb,
  conversation_state   JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  intake_completed_at      TIMESTAMPTZ,
  conversation_completed_at TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id    ON public.onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_org_id     ON public.onboarding_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status     ON public.onboarding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_created_at ON public.onboarding_sessions(created_at DESC);

-- ---------------------------------------------------------------------------
-- onboarding_profiles — AI-extracted insights
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  pain_points  JSONB NOT NULL DEFAULT '[]'::jsonb,
  goals        JSONB NOT NULL DEFAULT '[]'::jsonb,
  workflows    JSONB NOT NULL DEFAULT '{}'::jsonb,
  team_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_profiles_session_id ON public.onboarding_profiles(session_id);

-- ---------------------------------------------------------------------------
-- onboarding_recommendations — module recommendations from AI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_recommendations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  recommended_modules  JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluded_modules     JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_modules        TEXT[] NOT NULL DEFAULT '{}',
  user_added           TEXT[] NOT NULL DEFAULT '{}',
  user_removed         TEXT[] NOT NULL DEFAULT '{}',
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_recommendations_session_id ON public.onboarding_recommendations(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_recommendations_session_unique
  ON public.onboarding_recommendations(session_id);

-- ---------------------------------------------------------------------------
-- onboarding_analytics — funnel metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_analytics (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                    UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  intake_duration_seconds       INTEGER,
  conversation_duration_seconds INTEGER,
  recommendation_duration_seconds INTEGER,
  total_duration_seconds        INTEGER,
  message_count                 INTEGER NOT NULL DEFAULT 0,
  pain_points_extracted         INTEGER NOT NULL DEFAULT 0,
  goals_extracted               INTEGER NOT NULL DEFAULT 0,
  modules_recommended           INTEGER NOT NULL DEFAULT 0,
  modules_accepted              INTEGER NOT NULL DEFAULT 0,
  modules_added                 INTEGER NOT NULL DEFAULT 0,
  modules_removed               INTEGER NOT NULL DEFAULT 0,
  completed_successfully        BOOLEAN NOT NULL DEFAULT FALSE,
  abandonment_stage             TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_session_id  ON public.onboarding_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_completed   ON public.onboarding_analytics(completed_successfully);

-- ---------------------------------------------------------------------------
-- onboarding_turns / onboarding_messages — durable assistant conversation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_turns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id       uuid NOT NULL,
  status           text NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress', 'completed', 'failed')),
  response         jsonb,
  failure_code     text,
  failure_message  text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  failed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id),
  CHECK ((status = 'completed') = (response IS NOT NULL)),
  CHECK (status <> 'failed' OR failure_message IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.onboarding_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  turn_id       uuid NOT NULL REFERENCES public.onboarding_turns(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_no   bigint GENERATED ALWAYS AS IDENTITY,
  role          text NOT NULL CHECK (role IN ('user', 'assistant')),
  content       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turn_id, role),
  UNIQUE (session_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_turns_session
  ON public.onboarding_turns (session_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_turns_one_active_per_session
  ON public.onboarding_turns (session_id)
  WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_session_sequence
  ON public.onboarding_messages (session_id, sequence_no);

ALTER TABLE public.onboarding_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_turns_service" ON public.onboarding_turns
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "onboarding_messages_service" ON public.onboarding_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.onboarding_turns, public.onboarding_messages TO service_role;

CREATE TRIGGER set_onboarding_turns_updated_at
  BEFORE UPDATE ON public.onboarding_turns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Claim a user message exactly once before invoking the model and return only
-- prior durable conversation history. A retry replays the terminal response.
CREATE OR REPLACE FUNCTION public.begin_onboarding_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turn public.onboarding_turns%ROWTYPE;
  v_session public.onboarding_sessions%ROWTYPE;
  v_existing_content text;
  v_history jsonb;
BEGIN
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Turn content is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id::text, 0));
  SELECT * INTO v_session FROM public.onboarding_sessions
  WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_turn FROM public.onboarding_turns
  WHERE user_id = p_user_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN
    IF v_turn.session_id <> p_session_id THEN RAISE EXCEPTION 'Idempotency key reused for another session' USING ERRCODE = '22023'; END IF;
    SELECT content INTO v_existing_content FROM public.onboarding_messages
    WHERE turn_id = v_turn.id AND role = 'user';
    IF v_existing_content IS DISTINCT FROM p_content THEN RAISE EXCEPTION 'Idempotency key reused for a different request' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('started', false, 'turn_id', v_turn.id, 'status', v_turn.status,
      'response', v_turn.response, 'failure_code', v_turn.failure_code, 'failure_message', v_turn.failure_message);
  END IF;

  IF v_session.status <> 'conversation' THEN RAISE EXCEPTION 'Session not in conversation state' USING ERRCODE = '22023'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.onboarding_turns
    WHERE session_id = p_session_id AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Another onboarding turn is in progress' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.onboarding_turns (session_id, user_id, request_id)
  VALUES (p_session_id, p_user_id, p_request_id) RETURNING * INTO v_turn;
  INSERT INTO public.onboarding_messages (session_id, turn_id, user_id, role, content)
  VALUES (p_session_id, v_turn.id, p_user_id, 'user', p_content);
  -- `messages` remains the backwards-compatible session projection, while
  -- normalized rows are the durable write source for every new turn.
  v_history := COALESCE(v_session.messages, '[]'::jsonb);
  RETURN jsonb_build_object('started', true, 'turn_id', v_turn.id, 'status', v_turn.status, 'history', v_history);
END;
$$;

-- Finalize the model result, profile extractions, state transition, analytics,
-- and the assistant message as one transaction.
CREATE OR REPLACE FUNCTION public.complete_onboarding_turn(
  p_turn_id uuid,
  p_session_id uuid,
  p_user_id uuid,
  p_assistant_content text,
  p_extractions jsonb,
  p_conversation_state jsonb,
  p_ready_for_recommendations boolean,
  p_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turn public.onboarding_turns%ROWTYPE;
  v_session public.onboarding_sessions%ROWTYPE;
  v_profile public.onboarding_profiles%ROWTYPE;
  v_messages jsonb;
  v_user_content text;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_turn FROM public.onboarding_turns
  WHERE id = p_turn_id AND session_id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF v_turn.id IS NULL THEN RAISE EXCEPTION 'Onboarding turn not found' USING ERRCODE = 'P0002'; END IF;
  IF v_turn.status = 'completed' THEN RETURN v_turn.response; END IF;
  IF v_turn.status <> 'in_progress' THEN RAISE EXCEPTION 'Onboarding turn is %', v_turn.status USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_session FROM public.onboarding_sessions WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  SELECT * INTO v_profile FROM public.onboarding_profiles WHERE session_id = p_session_id FOR UPDATE;
  IF v_profile.id IS NULL THEN INSERT INTO public.onboarding_profiles (session_id) VALUES (p_session_id) RETURNING * INTO v_profile; END IF;

  UPDATE public.onboarding_profiles SET
    pain_points = COALESCE(v_profile.pain_points, '[]'::jsonb) || COALESCE(p_extractions->'pain_points', '[]'::jsonb),
    goals = COALESCE(v_profile.goals, '[]'::jsonb) || COALESCE(p_extractions->'goals', '[]'::jsonb),
    workflows = COALESCE(v_profile.workflows, '{}'::jsonb) || COALESCE(p_extractions->'workflows', '{}'::jsonb),
    team_context = COALESCE(v_profile.team_context, '{}'::jsonb) || COALESCE(p_extractions->'team_context', '{}'::jsonb)
  WHERE id = v_profile.id;
  INSERT INTO public.onboarding_messages (session_id, turn_id, user_id, role, content)
  VALUES (p_session_id, p_turn_id, p_user_id, 'assistant', p_assistant_content);
  SELECT content INTO v_user_content FROM public.onboarding_messages
  WHERE turn_id = p_turn_id AND role = 'user';
  v_messages := COALESCE(v_session.messages, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('role', 'user', 'content', v_user_content, 'timestamp', v_turn.started_at),
    jsonb_build_object('role', 'assistant', 'content', p_assistant_content, 'timestamp', v_now)
  );
  UPDATE public.onboarding_sessions SET
    messages = COALESCE(v_messages, '[]'::jsonb),
    conversation_state = p_conversation_state,
    status = CASE WHEN p_ready_for_recommendations THEN 'recommendations' ELSE status END,
    conversation_completed_at = CASE WHEN p_ready_for_recommendations THEN COALESCE(conversation_completed_at, v_now) ELSE conversation_completed_at END
  WHERE id = p_session_id;
  UPDATE public.onboarding_analytics SET
    pain_points_extracted = jsonb_array_length(COALESCE(v_profile.pain_points, '[]'::jsonb)) + jsonb_array_length(COALESCE(p_extractions->'pain_points', '[]'::jsonb)),
    goals_extracted = jsonb_array_length(COALESCE(v_profile.goals, '[]'::jsonb)) + jsonb_array_length(COALESCE(p_extractions->'goals', '[]'::jsonb)),
    message_count = COALESCE((p_conversation_state->>'message_count')::integer, 0),
    conversation_duration_seconds = CASE WHEN p_ready_for_recommendations AND v_session.intake_completed_at IS NOT NULL THEN floor(extract(epoch FROM (v_now - v_session.intake_completed_at)))::integer ELSE conversation_duration_seconds END
  WHERE session_id = p_session_id;
  UPDATE public.onboarding_turns SET status = 'completed', response = p_response, completed_at = v_now WHERE id = p_turn_id;
  RETURN p_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_onboarding_turn(
  p_turn_id uuid, p_session_id uuid, p_user_id uuid, p_failure_code text, p_failure_message text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.onboarding_turns SET status = 'failed', failure_code = p_failure_code,
    failure_message = left(p_failure_message, 2000), failed_at = now()
  WHERE id = p_turn_id AND session_id = p_session_id AND user_id = p_user_id AND status = 'in_progress';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding_recommendations(
  p_session_id uuid, p_user_id uuid, p_recommendations jsonb, p_excluded jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.onboarding_sessions WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.onboarding_recommendations (session_id, recommended_modules, excluded_modules, generated_at)
  VALUES (p_session_id, p_recommendations, p_excluded, now())
  ON CONFLICT (session_id) DO UPDATE SET recommended_modules = EXCLUDED.recommended_modules,
    excluded_modules = EXCLUDED.excluded_modules, generated_at = EXCLUDED.generated_at;
  UPDATE public.onboarding_sessions SET status = 'recommendations',
    conversation_completed_at = COALESCE(conversation_completed_at, now()) WHERE id = p_session_id;
  UPDATE public.onboarding_analytics SET modules_recommended = jsonb_array_length(p_recommendations) WHERE session_id = p_session_id;
  RETURN jsonb_build_object('recommendations', p_recommendations, 'excluded', p_excluded);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_onboarding_turn(uuid, uuid, uuid, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_onboarding_turn(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_onboarding_turn(uuid, uuid, uuid, text, jsonb, jsonb, boolean, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_turn(uuid, uuid, uuid, text, jsonb, jsonb, boolean, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.fail_onboarding_turn(uuid, uuid, uuid, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_onboarding_turn(uuid, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_onboarding_recommendations(uuid, uuid, jsonb, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_recommendations(uuid, uuid, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_onboarding_session(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  SELECT id INTO v_session_id
  FROM public.onboarding_sessions
  WHERE user_id = p_user_id
    AND status NOT IN ('completed', 'abandoned')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.onboarding_sessions (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_session_id;

    INSERT INTO public.onboarding_profiles (session_id) VALUES (v_session_id);
    INSERT INTO public.onboarding_analytics (session_id) VALUES (v_session_id);
  END IF;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_completed_onboarding(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_sessions
    WHERE user_id = p_user_id AND status = 'completed'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_latest_onboarding_session(p_user_id UUID)
RETURNS TABLE(id UUID, status TEXT, quick_intake JSONB, conversation_state JSONB, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, status, quick_intake, conversation_state, created_at
  FROM public.onboarding_sessions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_onboarding_session(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_onboarding_session(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_completed_onboarding(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.has_completed_onboarding(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_latest_onboarding_session(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_latest_onboarding_session(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_analytics       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_sessions_own" ON public.onboarding_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "onboarding_sessions_service" ON public.onboarding_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "onboarding_profiles_own" ON public.onboarding_profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "onboarding_profiles_service" ON public.onboarding_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "onboarding_recommendations_own" ON public.onboarding_recommendations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "onboarding_recommendations_service" ON public.onboarding_recommendations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "onboarding_analytics_own" ON public.onboarding_analytics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "onboarding_analytics_service" ON public.onboarding_analytics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_sessions        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_recommendations TO authenticated;
GRANT SELECT ON public.onboarding_analytics TO authenticated;

GRANT ALL ON public.onboarding_sessions        TO service_role;
GRANT ALL ON public.onboarding_profiles        TO service_role;
GRANT ALL ON public.onboarding_recommendations TO service_role;
GRANT ALL ON public.onboarding_analytics       TO service_role;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER set_onboarding_sessions_updated_at
  BEFORE UPDATE ON public.onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_onboarding_profiles_updated_at
  BEFORE UPDATE ON public.onboarding_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_onboarding_recommendations_updated_at
  BEFORE UPDATE ON public.onboarding_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_onboarding_analytics_updated_at
  BEFORE UPDATE ON public.onboarding_analytics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
