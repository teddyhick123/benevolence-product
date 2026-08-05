-- =============================================================================
-- 0033_ai_sessions.sql
-- AI assistant: conversation sessions, action audit trail, portfolio
-- recommendations, and undo/redo support.
-- Depends on: 0001, 0004, 0006, 0010
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ai_sessions — chat sessions between a user and the AI assistant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, portfolio_id, user_id)
);

CREATE INDEX IF NOT EXISTS ai_sessions_portfolio_id_idx ON public.ai_sessions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_sessions_user_id_idx      ON public.ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS ai_sessions_started_at_idx   ON public.ai_sessions(started_at DESC);

-- ---------------------------------------------------------------------------
-- ai_turns / ai_messages — durable, idempotent assistant conversation state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_turns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL,
  portfolio_id    UUID NOT NULL,
  user_id         UUID NOT NULL,
  request_id      UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'failed')),
  response        JSONB,
  failure_code    TEXT,
  failure_message TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, request_id),
  UNIQUE (id, session_id, portfolio_id, user_id),
  FOREIGN KEY (session_id, portfolio_id, user_id)
    REFERENCES public.ai_sessions(id, portfolio_id, user_id) ON DELETE CASCADE,
  CHECK ((status = 'completed') = (response IS NOT NULL)),
  CHECK (status <> 'failed' OR failure_message IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ai_turns_session_id_idx
  ON public.ai_turns(session_id, created_at);
CREATE INDEX IF NOT EXISTS ai_turns_portfolio_user_idx
  ON public.ai_turns(portfolio_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL,
  turn_id      UUID NOT NULL,
  portfolio_id UUID NOT NULL,
  user_id      UUID NOT NULL,
  sequence_no  BIGINT GENERATED ALWAYS AS IDENTITY,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      JSONB NOT NULL,
  widgets      JSONB,
  content_blocks JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (turn_id, role),
  UNIQUE (session_id, sequence_no),
  FOREIGN KEY (turn_id, session_id, portfolio_id, user_id)
    REFERENCES public.ai_turns(id, session_id, portfolio_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_messages_session_sequence_idx
  ON public.ai_messages(session_id, sequence_no);
CREATE INDEX IF NOT EXISTS ai_messages_portfolio_user_idx
  ON public.ai_messages(portfolio_id, user_id, sequence_no DESC);

-- ---------------------------------------------------------------------------
-- ai_actions — audit trail of every action the AI takes (with undo/redo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  portfolio_id   UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  action_type    TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'preview')),
  entity_type    TEXT NOT NULL,
  entity_id      UUID,

  operation_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  ai_reasoning   TEXT,
  user_prompt    TEXT,
  source         TEXT,
  initiated_by   TEXT NOT NULL DEFAULT 'ai'
                 CHECK (initiated_by IN ('ai', 'user', 'import', 'system')),

  status         TEXT NOT NULL DEFAULT 'applied'
                 CHECK (status IN ('applied', 'undone', 'redone')),

  batch_id       UUID,
  sequence_order INTEGER NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_actions_session_id_idx   ON public.ai_actions(session_id);
CREATE INDEX IF NOT EXISTS ai_actions_portfolio_id_idx ON public.ai_actions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_actions_user_id_idx      ON public.ai_actions(user_id);
CREATE INDEX IF NOT EXISTS ai_actions_entity_idx       ON public.ai_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_actions_batch_id_idx     ON public.ai_actions(batch_id);
CREATE INDEX IF NOT EXISTS ai_actions_status_idx       ON public.ai_actions(status);
CREATE INDEX IF NOT EXISTS ai_actions_created_at_idx   ON public.ai_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_actions_initiated_by_idx ON public.ai_actions(initiated_by);

COMMENT ON COLUMN public.ai_actions.initiated_by IS
  'Source of the action: ai = AI assistant, user = direct user action, import = ETL import, system = automated process';

-- ---------------------------------------------------------------------------
-- portfolio_recommendations — curated org recommendations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_recommendations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id      UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  charity_id        UUID REFERENCES public.charities(id) ON DELETE SET NULL,

  organization_name TEXT NOT NULL,
  website           TEXT,
  sector            TEXT,
  ein               TEXT,
  location          TEXT,
  country           TEXT,

  description       TEXT,
  impact_focus      TEXT[],
  recommended_by    UUID REFERENCES auth.users(id),
  recommended_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  accreditation     JSONB,
  contact_info      JSONB,
  min_investment    NUMERIC,
  max_investment    NUMERIC,
  order_index       INTEGER NOT NULL DEFAULT 0,

  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'converted')),
  interaction_status TEXT NOT NULL DEFAULT 'new'
                    CHECK (interaction_status IN (
                      'new',
                      'reviewing',
                      'interested',
                      'contacted',
                      'meeting_scheduled',
                      'in_discussion',
                      'approved',
                      'declined',
                      'donated'
                    )),
  status_updated_at TIMESTAMPTZ,
  status_updated_by UUID REFERENCES auth.users(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_portfolio ON public.portfolio_recommendations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_status    ON public.portfolio_recommendations(portfolio_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_charity   ON public.portfolio_recommendations(charity_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_interaction_status
  ON public.portfolio_recommendations(portfolio_id, interaction_status)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- recommendation_comments / favorites / status_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendation_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  parent_id         UUID REFERENCES public.recommendation_comments(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_comments_rec    ON public.recommendation_comments(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_comments_user   ON public.recommendation_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_comments_parent ON public.recommendation_comments(parent_id);

CREATE TABLE IF NOT EXISTS public.recommendation_favorites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(recommendation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_favorites_rec  ON public.recommendation_favorites(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_favorites_user ON public.recommendation_favorites(user_id);

CREATE TABLE IF NOT EXISTS public.recommendation_status_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  old_status        TEXT,
  new_status        TEXT NOT NULL,
  user_id           UUID REFERENCES auth.users(id),
  changed_by        UUID REFERENCES auth.users(id),
  reason            TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_status_history_rec  ON public.recommendation_status_history(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_status_history_date ON public.recommendation_status_history(created_at DESC);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_recommendation_interaction_status(
  p_recommendation_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.portfolio_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recommendation public.portfolio_recommendations%ROWTYPE;
  v_updated public.portfolio_recommendations%ROWTYPE;
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN (
    'new',
    'reviewing',
    'interested',
    'contacted',
    'meeting_scheduled',
    'in_discussion',
    'approved',
    'declined',
    'donated'
  ) THEN
    RAISE EXCEPTION 'Invalid recommendation status: %', p_status;
  END IF;

  SELECT *
  INTO v_recommendation
  FROM public.portfolio_recommendations
  WHERE id = p_recommendation_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found';
  END IF;

  IF NOT public.can_view_portfolio(v_recommendation.portfolio_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.portfolio_recommendations
  SET
    interaction_status = p_status,
    status_updated_at = NOW(),
    status_updated_by = v_actor,
    updated_at = NOW()
  WHERE id = p_recommendation_id
  RETURNING * INTO v_updated;

  IF v_recommendation.interaction_status IS DISTINCT FROM p_status THEN
    INSERT INTO public.recommendation_status_history (
      recommendation_id,
      old_status,
      new_status,
      user_id,
      changed_by,
      notes
    )
    VALUES (
      p_recommendation_id,
      v_recommendation.interaction_status,
      p_status,
      v_actor,
      v_actor,
      NULLIF(BTRIM(p_notes), '')
    );
  END IF;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_ai_session(
  p_portfolio_id UUID,
  p_user_id      UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS DISTINCT FROM p_user_id
       OR public.can_view_portfolio(p_portfolio_id) IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_session_id
  FROM public.ai_sessions
  WHERE portfolio_id = p_portfolio_id
    AND user_id      = p_user_id
    AND ended_at IS NULL
    AND started_at > NOW() - INTERVAL '24 hours'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.ai_sessions (portfolio_id, user_id)
    VALUES (p_portfolio_id, p_user_id)
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_ai_turn(
  p_portfolio_id UUID,
  p_user_id      UUID,
  p_request_id   UUID,
  p_content      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_turn public.ai_turns%ROWTYPE;
  v_existing_content JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS DISTINCT FROM p_user_id
       OR public.can_view_portfolio(p_portfolio_id) IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_content IS NULL OR jsonb_typeof(p_content) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Turn content must be a JSON string' USING ERRCODE = '22023';
  END IF;

  -- Serialize request claims across portfolios, then active-session selection.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || p_request_id::TEXT, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || p_portfolio_id::TEXT, 0)
  );

  SELECT * INTO v_turn
  FROM public.ai_turns
  WHERE user_id = p_user_id
    AND request_id = p_request_id;

  IF FOUND THEN
    IF v_turn.portfolio_id IS DISTINCT FROM p_portfolio_id THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;

    SELECT content INTO v_existing_content
    FROM public.ai_messages
    WHERE turn_id = v_turn.id
      AND session_id = v_turn.session_id
      AND portfolio_id = v_turn.portfolio_id
      AND user_id = v_turn.user_id
      AND role = 'user';

    IF v_existing_content IS DISTINCT FROM p_content THEN
      RAISE EXCEPTION 'Idempotency key reused for a different request'
        USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'started', false,
      'turn_id', v_turn.id,
      'session_id', v_turn.session_id,
      'status', v_turn.status,
      'response', v_turn.response,
      'failure_code', v_turn.failure_code,
      'failure_message', v_turn.failure_message
    );
  END IF;

  v_session_id := public.get_or_create_ai_session(p_portfolio_id, p_user_id);

  INSERT INTO public.ai_turns (
    session_id,
    portfolio_id,
    user_id,
    request_id
  ) VALUES (
    v_session_id,
    p_portfolio_id,
    p_user_id,
    p_request_id
  )
  RETURNING * INTO v_turn;

  INSERT INTO public.ai_messages (
    session_id,
    turn_id,
    portfolio_id,
    user_id,
    role,
    content
  ) VALUES (
    v_session_id,
    v_turn.id,
    p_portfolio_id,
    p_user_id,
    'user',
    p_content
  );

  UPDATE public.ai_sessions
  SET updated_at = NOW()
  WHERE id = v_session_id
    AND portfolio_id = p_portfolio_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'started', true,
    'turn_id', v_turn.id,
    'session_id', v_session_id,
    'status', 'in_progress'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ai_turn(
  p_turn_id        UUID,
  p_portfolio_id   UUID,
  p_user_id        UUID,
  p_content        JSONB,
  p_widgets        JSONB,
  p_content_blocks JSONB,
  p_response       JSONB
)
RETURNS JSONB
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

  SELECT * INTO v_turn
  FROM public.ai_turns
  WHERE id = p_turn_id
    AND portfolio_id = p_portfolio_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI turn not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_turn.status = 'completed' THEN
    RETURN v_turn.response;
  END IF;

  IF v_turn.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'AI turn is not in progress' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.ai_messages (
    session_id,
    turn_id,
    portfolio_id,
    user_id,
    role,
    content,
    widgets,
    content_blocks
  ) VALUES (
    v_turn.session_id,
    v_turn.id,
    v_turn.portfolio_id,
    v_turn.user_id,
    'assistant',
    p_content,
    p_widgets,
    p_content_blocks
  );

  UPDATE public.ai_turns
  SET status = 'completed',
      response = p_response,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_turn.id;

  UPDATE public.ai_sessions
  SET updated_at = NOW()
  WHERE id = v_turn.session_id
    AND portfolio_id = v_turn.portfolio_id
    AND user_id = v_turn.user_id;

  RETURN p_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_ai_turn(
  p_turn_id        UUID,
  p_portfolio_id   UUID,
  p_user_id        UUID,
  p_failure_code   TEXT,
  p_failure_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS DISTINCT FROM p_user_id
       OR public.can_view_portfolio(p_portfolio_id) IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_turns
  SET status = 'failed',
      failure_code = NULLIF(BTRIM(p_failure_code), ''),
      failure_message = COALESCE(NULLIF(BTRIM(p_failure_message), ''), 'AI turn failed'),
      failed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_turn_id
    AND portfolio_id = p_portfolio_id
    AND user_id = p_user_id
    AND status = 'in_progress';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_ai_action(p_action_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action RECORD;
BEGIN
  SELECT * INTO v_action FROM public.ai_actions WHERE id = p_action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND public.can_edit_portfolio(v_action.portfolio_id) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;
  IF v_action.status = 'undone' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action already undone');
  END IF;
  UPDATE public.ai_actions SET status = 'undone', updated_at = NOW() WHERE id = p_action_id;
  RETURN jsonb_build_object('success', true, 'action', v_action.operation_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.redo_ai_action(p_action_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action RECORD;
BEGIN
  SELECT * INTO v_action FROM public.ai_actions WHERE id = p_action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND public.can_edit_portfolio(v_action.portfolio_id) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;
  IF v_action.status != 'undone' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action is not undone');
  END IF;
  UPDATE public.ai_actions SET status = 'redone', updated_at = NOW() WHERE id = p_action_id;
  RETURN jsonb_build_object('success', true, 'action', v_action.operation_data);
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_ai_session(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_ai_turn(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_ai_turn(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_ai_action(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redo_ai_action(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_recommendation_interaction_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_recommendation_interaction_status(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_ai_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_ai_session(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_turn(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_turn(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_ai_turn(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_ai_turn(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_ai_action(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_ai_action(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.redo_ai_action(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redo_ai_action(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_sessions_read" ON public.ai_sessions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "ai_sessions_write" ON public.ai_sessions
  FOR ALL TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND user_id = auth.uid())
  WITH CHECK (public.can_view_portfolio(portfolio_id) AND user_id = auth.uid());

CREATE POLICY "ai_sessions_service" ON public.ai_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_turns_read" ON public.ai_turns
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND user_id = auth.uid());

CREATE POLICY "ai_turns_service" ON public.ai_turns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_messages_read" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND user_id = auth.uid());

CREATE POLICY "ai_messages_service" ON public.ai_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_actions_read" ON public.ai_actions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "ai_actions_write" ON public.ai_actions
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "ai_actions_service" ON public.ai_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "recommendations_read" ON public.portfolio_recommendations
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "recommendations_write" ON public.portfolio_recommendations
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "recommendations_service" ON public.portfolio_recommendations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "rec_comments_read" ON public.recommendation_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_comments.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );

CREATE POLICY "rec_comments_write" ON public.recommendation_comments
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_comments.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_comments.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );

CREATE POLICY "rec_comments_service" ON public.recommendation_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "rec_favorites_read" ON public.recommendation_favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "rec_favorites_write" ON public.recommendation_favorites
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_favorites.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_favorites.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );

CREATE POLICY "rec_favorites_service" ON public.recommendation_favorites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "rec_status_history_read" ON public.recommendation_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_status_history.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );

CREATE POLICY "rec_status_history_service" ON public.recommendation_status_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_sessions TO authenticated;
GRANT SELECT ON public.ai_turns TO authenticated;
GRANT SELECT ON public.ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_favorites TO authenticated;
GRANT SELECT ON public.recommendation_status_history TO authenticated;

GRANT ALL ON public.ai_sessions TO service_role;
GRANT ALL ON public.ai_turns TO service_role;
GRANT ALL ON public.ai_messages TO service_role;
GRANT ALL ON public.ai_actions TO service_role;
GRANT ALL ON public.portfolio_recommendations TO service_role;
GRANT ALL ON public.recommendation_comments TO service_role;
GRANT ALL ON public.recommendation_favorites TO service_role;
GRANT ALL ON public.recommendation_status_history TO service_role;
