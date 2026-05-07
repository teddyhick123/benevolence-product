-- =============================================================================
-- 0020_ai_portfolio_manager.sql
-- AI portfolio manager: conversation threads, tool call audit trail,
-- and AI action log.
-- Depends on: 0001, 0002, 0004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ai_conversations — chat threads between users and the AI assistant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_conversations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id    uuid REFERENCES portfolios(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id),

  title           text,           -- auto-generated or user-set
  context         jsonb,          -- snapshot of portfolio context at thread start
  is_active       boolean NOT NULL DEFAULT true,
  last_message_at timestamptz
);

CREATE INDEX idx_ai_conversations_portfolio ON ai_conversations (portfolio_id, last_message_at DESC);
CREATE INDEX idx_ai_conversations_user      ON ai_conversations (user_id);
CREATE INDEX idx_ai_conversations_org       ON ai_conversations (org_id);

CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_messages — individual messages in a conversation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_messages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,

  role            text NOT NULL,  -- 'user', 'assistant', 'tool'
  content         text,
  tool_calls      jsonb,          -- raw tool_calls from Claude API
  tool_results    jsonb,          -- results fed back to model

  -- Token usage for cost tracking
  input_tokens    int,
  output_tokens   int,
  model           text,

  is_error        boolean NOT NULL DEFAULT false,
  error_message   text
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- ai_action_log — audit trail of every action the AI takes on real data
-- (separate from audit_log which covers all tables — this is AI-specific)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_action_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  message_id      uuid REFERENCES ai_messages(id) ON DELETE SET NULL,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id    uuid REFERENCES portfolios(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id),

  action          text NOT NULL,  -- e.g. 'create_holding', 'update_kpi', 'run_analysis'
  tool_name       text,           -- Claude tool name used
  input           jsonb,          -- tool input
  output          jsonb,          -- tool output (summary)
  affected_table  text,
  affected_record_id uuid,

  succeeded       boolean NOT NULL DEFAULT true,
  error_message   text,

  -- Human review
  requires_review  boolean NOT NULL DEFAULT false,
  reviewed_by      uuid REFERENCES auth.users(id),
  reviewed_at      timestamptz,
  review_outcome   text           -- 'approved', 'reverted', 'acknowledged'
);

CREATE INDEX idx_ai_action_log_portfolio ON ai_action_log (portfolio_id, created_at DESC);
CREATE INDEX idx_ai_action_log_org       ON ai_action_log (org_id, created_at DESC);
CREATE INDEX idx_ai_action_log_review    ON ai_action_log (portfolio_id) WHERE requires_review AND reviewed_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversations: portfolio members can view"
  ON ai_conversations FOR SELECT
  USING (
    can_view_portfolio(portfolio_id)
    OR (portfolio_id IS NULL AND can_view_org(org_id))
  );
CREATE POLICY "ai_conversations: users own their conversations"
  ON ai_conversations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_messages: inherit from conversation"
  ON ai_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations ac
      WHERE ac.id = ai_messages.conversation_id
        AND (
          ac.user_id = auth.uid()
          OR can_view_portfolio(ac.portfolio_id)
        )
    )
  );
CREATE POLICY "ai_messages: users can insert into own conversations"
  ON ai_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations ac
      WHERE ac.id = ai_messages.conversation_id
        AND ac.user_id = auth.uid()
    )
  );

ALTER TABLE ai_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_action_log: portfolio members can view"
  ON ai_action_log FOR SELECT
  USING (can_view_portfolio(portfolio_id) OR (portfolio_id IS NULL AND can_view_org(org_id)));
-- Insert only via service role / backend
CREATE POLICY "ai_action_log: no direct user insert"
  ON ai_action_log FOR INSERT
  WITH CHECK (false);
CREATE POLICY "ai_action_log: portfolio admins can review"
  ON ai_action_log FOR UPDATE
  USING (user_portfolio_role(portfolio_id) IN ('admin','owner'))
  WITH CHECK (user_portfolio_role(portfolio_id) IN ('admin','owner'));
