-- db/migrations/0025_builder.sql
-- Builder Tab: builder_proposals, builder_sessions
-- Depends on: 0001-0024

-- ---------------------------------------------------------------------------
-- builder_proposals — stores code and config proposals from the Builder chat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  request_text    text NOT NULL,
  proposal_type   text NOT NULL
                  CHECK (proposal_type IN ('config', 'code')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  generated_code  jsonb,
  -- { files: [{ path: string, content: string, diff: string }] }
  config_patch    jsonb,
  reviewer_notes  text,
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_proposals_org_status_idx
  ON builder_proposals (org_id, status);
CREATE INDEX IF NOT EXISTS builder_proposals_status_created_idx
  ON builder_proposals (status, created_at DESC);

ALTER TABLE builder_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_proposals: org admins read"
  ON builder_proposals FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "builder_proposals: service role"
  ON builder_proposals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON builder_proposals TO authenticated;
GRANT ALL ON builder_proposals TO service_role;

-- ---------------------------------------------------------------------------
-- builder_sessions — persists Builder chat history per org+user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  messages    jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS builder_sessions_org_updated_idx
  ON builder_sessions (org_id, updated_at DESC);

ALTER TABLE builder_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_sessions: users can manage own session"
  ON builder_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "builder_sessions: service role"
  ON builder_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON builder_sessions TO authenticated;
GRANT ALL ON builder_sessions TO service_role;

CREATE TRIGGER set_builder_sessions_updated_at
  BEFORE UPDATE ON builder_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
