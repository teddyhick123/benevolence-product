-- db/migrations/0044_builder_events.sql
-- Builder telemetry: captures config changes, AI requests, and proposal lifecycle events

CREATE TABLE IF NOT EXISTS public.builder_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id),
  event_type   text        NOT NULL
               CHECK (event_type IN (
                 'tool_call', 'ai_request',
                 'proposal_created', 'proposal_applied', 'proposal_rejected'
               )),
  tool_name    text,
  request_text text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_events_org_created_idx
  ON public.builder_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS builder_events_type_created_idx
  ON public.builder_events (event_type, created_at DESC);

ALTER TABLE public.builder_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_events: org admins read"
  ON public.builder_events FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

-- No INSERT/UPDATE/DELETE for authenticated role — all writes go through service_role API routes only.
-- This prevents event spoofing: users cannot fabricate telemetry records from the client.
CREATE POLICY "builder_events: service role"
  ON public.builder_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.builder_events TO authenticated;
GRANT ALL ON public.builder_events TO service_role;

-- Cross-org tool usage (app admin only — predicate enforced in view body)
CREATE OR REPLACE VIEW public.v_builder_tool_usage
WITH (security_invoker = true) AS
  SELECT tool_name,
         COUNT(*)              AS call_count,
         COUNT(DISTINCT org_id) AS org_count
  FROM   public.builder_events
  WHERE  event_type = 'tool_call'
    AND  public.is_app_admin()
  GROUP BY tool_name;

-- AI request corpus (app admin only)
CREATE OR REPLACE VIEW public.v_builder_ai_requests
WITH (security_invoker = true) AS
  SELECT org_id, request_text, created_at
  FROM   public.builder_events
  WHERE  event_type = 'ai_request'
    AND  public.is_app_admin()
  ORDER BY created_at DESC;

GRANT SELECT ON public.v_builder_tool_usage   TO authenticated;
GRANT SELECT ON public.v_builder_ai_requests  TO authenticated;
