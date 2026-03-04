-- ============================================================================
-- ONBOARDING MODULE
-- ============================================================================
-- Description: AI-powered onboarding with structured intake and conversational discovery
-- Tables: onboarding_sessions, onboarding_profiles, onboarding_recommendations,
--         onboarding_analytics
-- Functions: get_or_create_onboarding_session(), has_completed_onboarding(),
--            get_latest_onboarding_session()
-- ============================================================================

-- ============================================================================
-- 1. ONBOARDING SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- Session status
  status TEXT NOT NULL DEFAULT 'intake' CHECK (status IN ('intake', 'conversation', 'recommendations', 'completed', 'abandoned')),

  -- Quick intake data (Step 1)
  quick_intake JSONB DEFAULT '{}'::jsonb,
  -- Schema: {
  --   org_type: 'foundation' | 'daf' | 'nonprofit' | 'impact_investor',
  --   org_name: string,
  --   org_size: 'solo' | 'small' | 'medium' | 'large',
  --   primary_focus: string[],  -- e.g., ['education', 'environment', 'health']
  --   existing_tools: string[]  -- e.g., ['spreadsheets', 'quickbooks']
  -- }

  -- Conversation history (same pattern as ai_sessions)
  messages JSONB DEFAULT '[]'::jsonb,
  -- Schema: [{ role: 'user' | 'assistant', content: string, timestamp: string }]

  -- AI conversation state
  conversation_state JSONB DEFAULT '{}'::jsonb,
  -- Schema: {
  --   current_topic: string,
  --   topics_covered: string[],
  --   confidence_scores: { pain_points: number, goals: number, workflows: number, team: number },
  --   message_count: number,
  --   ready_for_recommendations: boolean
  -- }

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  intake_completed_at TIMESTAMPTZ,
  conversation_completed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.onboarding_sessions IS 'Tracks onboarding session lifecycle from intake through completion';
COMMENT ON COLUMN public.onboarding_sessions.quick_intake IS 'Structured data from quick intake form (org type, name, size, focus areas)';
COMMENT ON COLUMN public.onboarding_sessions.messages IS 'Conversation history with Ben the onboarding AI';
COMMENT ON COLUMN public.onboarding_sessions.conversation_state IS 'AI-tracked state including topics covered and confidence scores';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON public.onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_org_id ON public.onboarding_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status ON public.onboarding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_created_at ON public.onboarding_sessions(created_at DESC);

-- ============================================================================
-- 2. ONBOARDING PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,

  -- Extracted pain points
  pain_points JSONB DEFAULT '[]'::jsonb,
  -- Schema: [{
  --   id: string,
  --   category: 'tracking' | 'reporting' | 'compliance' | 'communication' | 'efficiency' | 'other',
  --   description: string,
  --   severity: 'low' | 'medium' | 'high',
  --   related_modules: string[],
  --   extracted_from: string  -- message reference
  -- }]

  -- Extracted goals
  goals JSONB DEFAULT '[]'::jsonb,
  -- Schema: [{
  --   id: string,
  --   goal: string,
  --   priority: 'low' | 'medium' | 'high',
  --   timeframe: 'immediate' | 'short_term' | 'long_term',
  --   related_modules: string[]
  -- }]

  -- Workflow information
  workflows JSONB DEFAULT '{}'::jsonb,
  -- Schema: {
  --   grant_cycle: { has_grants: boolean, stages: string[], pain_points: string[] },
  --   donor_communications: { donor_count: string, communication_methods: string[], challenges: string[] },
  --   impact_tracking: { current_method: string, metrics_tracked: string[], reporting_frequency: string },
  --   reporting: { report_types: string[], audience: string[], frequency: string }
  -- }

  -- Team context
  team_context JSONB DEFAULT '{}'::jsonb,
  -- Schema: {
  --   size: 'solo' | 'small' | 'medium' | 'large',
  --   roles: string[],
  --   technical_comfort: 'low' | 'medium' | 'high',
  --   key_users: [{ role: string, needs: string[] }],
  --   decision_makers: string[]
  -- }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.onboarding_profiles IS 'AI-extracted insights from onboarding conversation';
COMMENT ON COLUMN public.onboarding_profiles.pain_points IS 'Pain points extracted from conversation with severity and module mapping';
COMMENT ON COLUMN public.onboarding_profiles.goals IS 'User goals with priority and timeframe';
COMMENT ON COLUMN public.onboarding_profiles.workflows IS 'Current workflows for grants, donors, impact tracking, reporting';
COMMENT ON COLUMN public.onboarding_profiles.team_context IS 'Team size, roles, and technical comfort level';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_profiles_session_id ON public.onboarding_profiles(session_id);

-- ============================================================================
-- 3. ONBOARDING RECOMMENDATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,

  -- Recommended modules with reasoning
  recommended_modules JSONB DEFAULT '[]'::jsonb,
  -- Schema: [{
  --   module_id: string,
  --   confidence: number (0-1),
  --   reasoning: string,
  --   pain_points_addressed: string[],
  --   goals_addressed: string[]
  -- }]

  -- Excluded modules with reasoning
  excluded_modules JSONB DEFAULT '[]'::jsonb,
  -- Schema: [{
  --   module_id: string,
  --   reason: string
  -- }]

  -- What user actually accepted
  final_modules TEXT[] DEFAULT '{}',

  -- User adjustments
  user_added TEXT[] DEFAULT '{}',
  user_removed TEXT[] DEFAULT '{}',

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.onboarding_recommendations IS 'AI-generated module recommendations with user adjustments';
COMMENT ON COLUMN public.onboarding_recommendations.recommended_modules IS 'Modules recommended by AI with confidence scores and reasoning';
COMMENT ON COLUMN public.onboarding_recommendations.excluded_modules IS 'Modules explicitly not recommended with reasons';
COMMENT ON COLUMN public.onboarding_recommendations.final_modules IS 'Final set of modules after user adjustments';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_recommendations_session_id ON public.onboarding_recommendations(session_id);

-- ============================================================================
-- 4. ONBOARDING ANALYTICS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,

  -- Funnel metrics
  intake_duration_seconds INTEGER,
  conversation_duration_seconds INTEGER,
  recommendation_duration_seconds INTEGER,
  total_duration_seconds INTEGER,

  -- Engagement metrics
  message_count INTEGER DEFAULT 0,
  pain_points_extracted INTEGER DEFAULT 0,
  goals_extracted INTEGER DEFAULT 0,

  -- Recommendation metrics
  modules_recommended INTEGER DEFAULT 0,
  modules_accepted INTEGER DEFAULT 0,
  modules_added INTEGER DEFAULT 0,
  modules_removed INTEGER DEFAULT 0,

  -- Outcome tracking
  completed_successfully BOOLEAN DEFAULT FALSE,
  abandonment_stage TEXT,  -- 'intake' | 'conversation' | 'recommendations'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.onboarding_analytics IS 'Metrics for tracking onboarding funnel performance';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_session_id ON public.onboarding_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_completed ON public.onboarding_analytics(completed_successfully);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get or create onboarding session for a user
CREATE OR REPLACE FUNCTION public.get_or_create_onboarding_session(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Try to find an active (non-completed, non-abandoned) session
  SELECT id INTO v_session_id
  FROM public.onboarding_sessions
  WHERE user_id = p_user_id
    AND status NOT IN ('completed', 'abandoned')
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no active session, create one
  IF v_session_id IS NULL THEN
    INSERT INTO public.onboarding_sessions (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_session_id;

    -- Create associated profile
    INSERT INTO public.onboarding_profiles (session_id)
    VALUES (v_session_id);

    -- Create analytics record
    INSERT INTO public.onboarding_analytics (session_id)
    VALUES (v_session_id);
  END IF;

  RETURN v_session_id;
END;
$$;

-- Check if user has completed onboarding
CREATE OR REPLACE FUNCTION public.has_completed_onboarding(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_sessions
    WHERE user_id = p_user_id
    AND status = 'completed'
  );
$$;

-- Get user's most recent onboarding session
CREATE OR REPLACE FUNCTION public.get_latest_onboarding_session(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  status TEXT,
  quick_intake JSONB,
  conversation_state JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    status,
    quick_intake,
    conversation_state,
    created_at
  FROM public.onboarding_sessions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Onboarding Sessions
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_sessions_own" ON public.onboarding_sessions;
CREATE POLICY "onboarding_sessions_own" ON public.onboarding_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "onboarding_sessions_service" ON public.onboarding_sessions;
CREATE POLICY "onboarding_sessions_service" ON public.onboarding_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Onboarding Profiles
ALTER TABLE public.onboarding_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_profiles_own" ON public.onboarding_profiles;
CREATE POLICY "onboarding_profiles_own" ON public.onboarding_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_profiles.session_id
      AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_profiles.session_id
      AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "onboarding_profiles_service" ON public.onboarding_profiles;
CREATE POLICY "onboarding_profiles_service" ON public.onboarding_profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Onboarding Recommendations
ALTER TABLE public.onboarding_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_recommendations_own" ON public.onboarding_recommendations;
CREATE POLICY "onboarding_recommendations_own" ON public.onboarding_recommendations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_recommendations.session_id
      AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_recommendations.session_id
      AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "onboarding_recommendations_service" ON public.onboarding_recommendations;
CREATE POLICY "onboarding_recommendations_service" ON public.onboarding_recommendations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Onboarding Analytics
ALTER TABLE public.onboarding_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_analytics_own" ON public.onboarding_analytics;
CREATE POLICY "onboarding_analytics_own" ON public.onboarding_analytics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_analytics.session_id
      AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "onboarding_analytics_service" ON public.onboarding_analytics;
CREATE POLICY "onboarding_analytics_service" ON public.onboarding_analytics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_sessions TO authenticated;
GRANT ALL ON public.onboarding_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_profiles TO authenticated;
GRANT ALL ON public.onboarding_profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_recommendations TO authenticated;
GRANT ALL ON public.onboarding_recommendations TO service_role;

GRANT SELECT ON public.onboarding_analytics TO authenticated;
GRANT ALL ON public.onboarding_analytics TO service_role;

-- Function grants
REVOKE ALL ON FUNCTION public.get_or_create_onboarding_session(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_onboarding_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_onboarding_session(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.has_completed_onboarding(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.has_completed_onboarding(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_completed_onboarding(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_latest_onboarding_session(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_latest_onboarding_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_onboarding_session(UUID) TO service_role;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================
DROP TRIGGER IF EXISTS set_onboarding_sessions_updated_at ON public.onboarding_sessions;
CREATE TRIGGER set_onboarding_sessions_updated_at
  BEFORE UPDATE ON public.onboarding_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_onboarding_profiles_updated_at ON public.onboarding_profiles;
CREATE TRIGGER set_onboarding_profiles_updated_at
  BEFORE UPDATE ON public.onboarding_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_onboarding_recommendations_updated_at ON public.onboarding_recommendations;
CREATE TRIGGER set_onboarding_recommendations_updated_at
  BEFORE UPDATE ON public.onboarding_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_onboarding_analytics_updated_at ON public.onboarding_analytics;
CREATE TRIGGER set_onboarding_analytics_updated_at
  BEFORE UPDATE ON public.onboarding_analytics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
