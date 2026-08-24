-- Migration: AI Usage Log
-- Description: Track token consumption per AI chat call for cost visibility
-- Date: 2026-05-06

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id                uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  portfolio_id          uuid REFERENCES public.portfolios(id) ON DELETE SET NULL,
  session_id            uuid,
  scope_kind            text NOT NULL DEFAULT 'platform'
                          CHECK (scope_kind IN ('organization', 'platform')),
  workload_id           text NOT NULL DEFAULT 'assistant',
  operation             text NOT NULL DEFAULT 'tool_conversation'
                          CHECK (operation IN ('text_generation', 'structured_generation', 'tool_conversation', 'transcription')),
  connector             text NOT NULL DEFAULT 'anthropic',
  model_vendor          text,
  requested_model       text NOT NULL,
  resolved_model        text,
  resolved_provider     text,
  provider_request_id   text,
  input_tokens          integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens         integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens          integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cached_input_tokens   integer NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  reasoning_tokens      integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  audio_input_tokens    integer NOT NULL DEFAULT 0 CHECK (audio_input_tokens >= 0),
  audio_output_tokens   integer NOT NULL DEFAULT 0 CHECK (audio_output_tokens >= 0),
  -- Provider-reported cost when the provider supplies one; otherwise computed
  -- from the rate table at write time and frozen with its version.
  reported_cost         numeric,
  computed_cost         numeric,
  cost_source           text NOT NULL DEFAULT 'unpriced'
                          CHECK (cost_source IN ('reported','computed','unpriced')),
  rate_version          text,
  cost_currency         text,
  latency_ms            integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  status                text NOT NULL DEFAULT 'succeeded'
                          CHECK (status IN ('succeeded', 'failed', 'aborted', 'timed_out')),
  error_code            text,
  target_position       integer NOT NULL DEFAULT 0 CHECK (target_position >= 0),
  policy_snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  policy_hash           text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_log_scope_org_check
    CHECK (scope_kind = 'platform' OR org_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ai_usage_log_user_id_idx     ON public.ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_org_id_idx      ON public.ai_usage_log(org_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx  ON public.ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_log_org_workload_created_idx
  ON public.ai_usage_log(org_id, workload_id, created_at DESC);

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
