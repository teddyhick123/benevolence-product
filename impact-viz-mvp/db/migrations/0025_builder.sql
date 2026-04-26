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

-- Org admins can read their own org's proposals
CREATE POLICY "org admins can read builder proposals"
  ON builder_proposals FOR SELECT
  USING (is_org_admin(org_id));

-- Insert and updates only via service role (admin client)

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

-- Users can read and write only their own session
CREATE POLICY "users can manage own builder session"
  ON builder_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
