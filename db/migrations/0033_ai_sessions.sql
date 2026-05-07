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
  messages     JSONB NOT NULL DEFAULT '[]'::jsonb,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_sessions_portfolio_id_idx ON public.ai_sessions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_sessions_user_id_idx      ON public.ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS ai_sessions_started_at_idx   ON public.ai_sessions(started_at DESC);

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

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_portfolio ON public.portfolio_recommendations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_status    ON public.portfolio_recommendations(portfolio_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_charity   ON public.portfolio_recommendations(charity_id);

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
  changed_by        UUID REFERENCES auth.users(id),
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_status_history_rec  ON public.recommendation_status_history(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_status_history_date ON public.recommendation_status_history(created_at DESC);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
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
  IF v_action.status != 'undone' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action is not undone');
  END IF;
  UPDATE public.ai_actions SET status = 'redone', updated_at = NOW() WHERE id = p_action_id;
  RETURN jsonb_build_object('success', true, 'action', v_action.operation_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_ai_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_ai_action(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redo_ai_action(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
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
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "rec_comments_service" ON public.recommendation_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "rec_favorites_read" ON public.recommendation_favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "rec_favorites_write" ON public.recommendation_favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_favorites TO authenticated;
GRANT SELECT ON public.recommendation_status_history TO authenticated;

GRANT ALL ON public.ai_sessions TO service_role;
GRANT ALL ON public.ai_actions TO service_role;
GRANT ALL ON public.portfolio_recommendations TO service_role;
GRANT ALL ON public.recommendation_comments TO service_role;
GRANT ALL ON public.recommendation_favorites TO service_role;
GRANT ALL ON public.recommendation_status_history TO service_role;
