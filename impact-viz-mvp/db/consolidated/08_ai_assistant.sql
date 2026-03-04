-- ============================================================================
-- AI ASSISTANT MODULE (Part of Core)
-- ============================================================================
-- Description: AI-powered features including chat sessions and recommendations
-- Tables: ai_sessions, ai_actions, portfolio_recommendations,
--         recommendation_comments, recommendation_favorites,
--         recommendation_status_history
-- ============================================================================

-- ============================================================================
-- 1. AI SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  messages JSONB DEFAULT '[]'::jsonb,  -- [{role, content, timestamp}]
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_sessions_portfolio_id_idx ON public.ai_sessions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_sessions_user_id_idx ON public.ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS ai_sessions_started_at_idx ON public.ai_sessions(started_at DESC);

COMMENT ON TABLE public.ai_sessions IS 'Conversation sessions with the AI assistant';

-- ============================================================================
-- 2. AI ACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action metadata
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('holding', 'metric_fact', 'widget', 'location', 'contribution', 'kpi_definition')),
  entity_id UUID,

  -- Operation data for undo/redo
  operation_data JSONB NOT NULL,  -- {before: {...}, after: {...}, table: '...'}

  -- AI context
  ai_reasoning TEXT,
  user_prompt TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'undone', 'redone')),

  -- Grouping related actions
  batch_id UUID,
  sequence_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_actions_session_id_idx ON public.ai_actions(session_id);
CREATE INDEX IF NOT EXISTS ai_actions_portfolio_id_idx ON public.ai_actions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_actions_user_id_idx ON public.ai_actions(user_id);
CREATE INDEX IF NOT EXISTS ai_actions_entity_idx ON public.ai_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_actions_batch_id_idx ON public.ai_actions(batch_id);
CREATE INDEX IF NOT EXISTS ai_actions_status_idx ON public.ai_actions(status);
CREATE INDEX IF NOT EXISTS ai_actions_created_at_idx ON public.ai_actions(created_at DESC);

COMMENT ON TABLE public.ai_actions IS 'Actions taken by AI with undo/redo capability';

-- ============================================================================
-- 3. PORTFOLIO RECOMMENDATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.portfolio_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  charity_id UUID REFERENCES public.charities(id) ON DELETE SET NULL,

  -- Organization details
  organization_name TEXT NOT NULL,
  website TEXT,
  sector TEXT,
  ein TEXT,
  location TEXT,

  -- Recommendation details
  description TEXT,
  impact_focus TEXT[],
  recommended_by UUID REFERENCES auth.users(id),
  recommended_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  accreditation JSONB,
  contact_info JSONB,
  min_investment NUMERIC,
  max_investment NUMERIC,

  -- Display order
  order_index INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'converted')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_portfolio ON public.portfolio_recommendations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_status ON public.portfolio_recommendations(portfolio_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_order ON public.portfolio_recommendations(portfolio_id, order_index);
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_charity ON public.portfolio_recommendations(charity_id);

COMMENT ON TABLE public.portfolio_recommendations IS 'Curated recommendations of philanthropic organizations';

-- ============================================================================
-- 4. RECOMMENDATION COMMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recommendation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.recommendation_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_comments_rec ON public.recommendation_comments(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_comments_user ON public.recommendation_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_comments_parent ON public.recommendation_comments(parent_id);

COMMENT ON TABLE public.recommendation_comments IS 'Comments on recommendations';

-- ============================================================================
-- 5. RECOMMENDATION FAVORITES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recommendation_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recommendation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_favorites_rec ON public.recommendation_favorites(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_favorites_user ON public.recommendation_favorites(user_id);

COMMENT ON TABLE public.recommendation_favorites IS 'User favorites on recommendations';

-- ============================================================================
-- 6. RECOMMENDATION STATUS HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recommendation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_status_history_rec ON public.recommendation_status_history(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_status_history_date ON public.recommendation_status_history(created_at DESC);

COMMENT ON TABLE public.recommendation_status_history IS 'Status change tracking for recommendations';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Recommendations with statistics
CREATE OR REPLACE VIEW public.recommendations_with_stats AS
SELECT
  r.*,
  (SELECT COUNT(*) FROM public.recommendation_comments rc WHERE rc.recommendation_id = r.id) as comment_count,
  (SELECT COUNT(*) FROM public.recommendation_favorites rf WHERE rf.recommendation_id = r.id) as favorite_count,
  c.name as charity_name,
  c.charity_navigator_rating as cn_rating
FROM public.portfolio_recommendations r
LEFT JOIN public.charities c ON r.charity_id = c.id;

COMMENT ON VIEW public.recommendations_with_stats IS 'Recommendations with comment and favorite counts';

-- Recommendations with current status
CREATE OR REPLACE VIEW public.recommendations_with_status AS
SELECT
  r.*,
  rsh.new_status as current_status,
  rsh.changed_by as last_changed_by,
  rsh.created_at as status_changed_at
FROM public.portfolio_recommendations r
LEFT JOIN LATERAL (
  SELECT new_status, changed_by, created_at
  FROM public.recommendation_status_history
  WHERE recommendation_id = r.id
  ORDER BY created_at DESC
  LIMIT 1
) rsh ON true;

COMMENT ON VIEW public.recommendations_with_status IS 'Recommendations with latest status';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get or create AI session
CREATE OR REPLACE FUNCTION public.get_or_create_ai_session(
  p_portfolio_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Try to find an active session (started in last 24 hours, not ended)
  SELECT id INTO v_session_id
  FROM public.ai_sessions
  WHERE portfolio_id = p_portfolio_id
    AND user_id = p_user_id
    AND ended_at IS NULL
    AND started_at > NOW() - INTERVAL '24 hours'
  ORDER BY started_at DESC
  LIMIT 1;

  -- If no active session, create one
  IF v_session_id IS NULL THEN
    INSERT INTO public.ai_sessions (portfolio_id, user_id)
    VALUES (p_portfolio_id, p_user_id)
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Undo an AI action
CREATE OR REPLACE FUNCTION public.undo_ai_action(p_action_id UUID)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Redo an AI action
CREATE OR REPLACE FUNCTION public.redo_ai_action(p_action_id UUID)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get recommendation comment count
CREATE OR REPLACE FUNCTION public.get_recommendation_comment_count(p_recommendation_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM public.recommendation_comments WHERE recommendation_id = p_recommendation_id;
$$ LANGUAGE SQL STABLE;

-- Record recommendation status change
CREATE OR REPLACE FUNCTION public.record_recommendation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.recommendation_status_history (
      recommendation_id, old_status, new_status, changed_by
    ) VALUES (
      NEW.id, OLD.status, NEW.status, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recommendation_status_change ON public.portfolio_recommendations;
CREATE TRIGGER trg_recommendation_status_change
  AFTER UPDATE OF status ON public.portfolio_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.record_recommendation_status_change();

-- Sync recommendation to charity
CREATE OR REPLACE FUNCTION public.sync_recommendation_to_charity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ein IS NOT NULL AND NEW.charity_id IS NULL THEN
    SELECT id INTO NEW.charity_id
    FROM public.charities
    WHERE ein = NEW.ein
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_recommendation_charity ON public.portfolio_recommendations;
CREATE TRIGGER trg_sync_recommendation_charity
  BEFORE INSERT OR UPDATE ON public.portfolio_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_recommendation_to_charity();

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_or_create_ai_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_ai_action(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redo_ai_action(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommendation_comment_count(UUID) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_status_history ENABLE ROW LEVEL SECURITY;

-- AI Sessions
DROP POLICY IF EXISTS "ai_sessions_read" ON public.ai_sessions;
CREATE POLICY "ai_sessions_read" ON public.ai_sessions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "ai_sessions_write" ON public.ai_sessions;
CREATE POLICY "ai_sessions_write" ON public.ai_sessions
  FOR ALL TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND user_id = auth.uid())
  WITH CHECK (public.can_view_portfolio(portfolio_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "ai_sessions_service" ON public.ai_sessions;
CREATE POLICY "ai_sessions_service" ON public.ai_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- AI Actions
DROP POLICY IF EXISTS "ai_actions_read" ON public.ai_actions;
CREATE POLICY "ai_actions_read" ON public.ai_actions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "ai_actions_write" ON public.ai_actions;
CREATE POLICY "ai_actions_write" ON public.ai_actions
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "ai_actions_service" ON public.ai_actions;
CREATE POLICY "ai_actions_service" ON public.ai_actions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Portfolio Recommendations
DROP POLICY IF EXISTS "recommendations_read" ON public.portfolio_recommendations;
CREATE POLICY "recommendations_read" ON public.portfolio_recommendations
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "recommendations_write" ON public.portfolio_recommendations;
CREATE POLICY "recommendations_write" ON public.portfolio_recommendations
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "recommendations_service" ON public.portfolio_recommendations;
CREATE POLICY "recommendations_service" ON public.portfolio_recommendations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Recommendation Comments
DROP POLICY IF EXISTS "rec_comments_read" ON public.recommendation_comments;
CREATE POLICY "rec_comments_read" ON public.recommendation_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_comments.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "rec_comments_write" ON public.recommendation_comments;
CREATE POLICY "rec_comments_write" ON public.recommendation_comments
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "rec_comments_service" ON public.recommendation_comments;
CREATE POLICY "rec_comments_service" ON public.recommendation_comments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Recommendation Favorites
DROP POLICY IF EXISTS "rec_favorites_read" ON public.recommendation_favorites;
CREATE POLICY "rec_favorites_read" ON public.recommendation_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "rec_favorites_write" ON public.recommendation_favorites;
CREATE POLICY "rec_favorites_write" ON public.recommendation_favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "rec_favorites_service" ON public.recommendation_favorites;
CREATE POLICY "rec_favorites_service" ON public.recommendation_favorites
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Recommendation Status History
DROP POLICY IF EXISTS "rec_status_history_read" ON public.recommendation_status_history;
CREATE POLICY "rec_status_history_read" ON public.recommendation_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_status_history.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "rec_status_history_service" ON public.recommendation_status_history;
CREATE POLICY "rec_status_history_service" ON public.recommendation_status_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
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

-- Views
GRANT SELECT ON public.recommendations_with_stats TO authenticated;
GRANT SELECT ON public.recommendations_with_status TO authenticated;
