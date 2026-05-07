-- Migration: AI Usage Log
-- Description: Track token consumption per AI chat call for cost visibility
-- Date: 2026-05-06

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  portfolio_id    UUID REFERENCES public.portfolios(id) ON DELETE SET NULL,
  session_id      UUID,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_user_id_idx     ON public.ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_org_id_idx      ON public.ai_usage_log(org_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx  ON public.ai_usage_log(created_at);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage logs; service role reads all
CREATE POLICY "ai_usage_log_self_read" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Only service role can insert (done server-side, never from client)
CREATE POLICY "ai_usage_log_service" ON public.ai_usage_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL    ON public.ai_usage_log TO service_role;
