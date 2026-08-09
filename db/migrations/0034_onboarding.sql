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
