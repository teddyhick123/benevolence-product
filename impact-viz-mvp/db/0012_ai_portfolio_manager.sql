-- AI Portfolio Manager Schema
-- Tracks AI-initiated changes and enables undo/redo functionality

-- AI Sessions: Tracks conversation sessions with the AI assistant
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  messages jsonb DEFAULT '[]'::jsonb, -- Array of {role, content, timestamp}
  context jsonb DEFAULT '{}'::jsonb, -- Portfolio context snapshot
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AI Actions: Tracks all AI-initiated changes with undo/redo capability
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action metadata
  action_type text NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
  entity_type text NOT NULL CHECK (entity_type IN ('holding', 'metric_fact', 'widget', 'location', 'contribution', 'kpi_definition')),
  entity_id uuid, -- The ID of the affected entity

  -- Operation data for undo/redo
  operation_data jsonb NOT NULL, -- { before: {...}, after: {...}, table: '...' }

  -- AI context
  ai_reasoning text, -- Why the AI made this change
  user_prompt text, -- The user's request that triggered this

  -- Status tracking
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'undone', 'redone')),

  -- Grouping related actions
  batch_id uuid, -- Groups multiple related actions together
  sequence_order integer DEFAULT 0, -- Order within a batch

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS ai_sessions_portfolio_id_idx ON public.ai_sessions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_sessions_user_id_idx ON public.ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS ai_sessions_started_at_idx ON public.ai_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS ai_actions_session_id_idx ON public.ai_actions(session_id);
CREATE INDEX IF NOT EXISTS ai_actions_portfolio_id_idx ON public.ai_actions(portfolio_id);
CREATE INDEX IF NOT EXISTS ai_actions_user_id_idx ON public.ai_actions(user_id);
CREATE INDEX IF NOT EXISTS ai_actions_entity_idx ON public.ai_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_actions_batch_id_idx ON public.ai_actions(batch_id);
CREATE INDEX IF NOT EXISTS ai_actions_status_idx ON public.ai_actions(status);
CREATE INDEX IF NOT EXISTS ai_actions_created_at_idx ON public.ai_actions(created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_sessions
CREATE POLICY ai_sessions_read ON public.ai_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.portfolio_members m
    WHERE m.portfolio_id = ai_sessions.portfolio_id
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY ai_sessions_write ON public.ai_sessions
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.portfolio_members m
    WHERE m.portfolio_id = ai_sessions.portfolio_id
    AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portfolio_members m
    WHERE m.portfolio_id = ai_sessions.portfolio_id
    AND m.user_id = auth.uid()
  )
  AND user_id = auth.uid() -- Can only create sessions for themselves
);

-- RLS Policies for ai_actions
CREATE POLICY ai_actions_read ON public.ai_actions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.portfolio_members m
    WHERE m.portfolio_id = ai_actions.portfolio_id
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY ai_actions_write ON public.ai_actions
FOR ALL TO authenticated
USING (
  public.can_edit_portfolio(portfolio_id)
)
WITH CHECK (
  public.can_edit_portfolio(portfolio_id)
);

-- Helper function to get the latest active session for a portfolio
CREATE OR REPLACE FUNCTION public.get_or_create_ai_session(
  p_portfolio_id uuid,
  p_user_id uuid
) RETURNS uuid AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Try to find an active session (started in last 24 hours, not ended)
  SELECT id INTO v_session_id
  FROM public.ai_sessions
  WHERE portfolio_id = p_portfolio_id
    AND user_id = p_user_id
    AND ended_at IS NULL
    AND started_at > now() - interval '24 hours'
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

-- Helper function to undo an action
CREATE OR REPLACE FUNCTION public.undo_ai_action(p_action_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_action record;
  v_result jsonb;
BEGIN
  -- Get the action
  SELECT * INTO v_action FROM public.ai_actions WHERE id = p_action_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;

  IF v_action.status = 'undone' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action already undone');
  END IF;

  -- The actual undo logic will be handled in the application layer
  -- This function just marks the action as undone
  UPDATE public.ai_actions
  SET status = 'undone', updated_at = now()
  WHERE id = p_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action.operation_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to redo an action
CREATE OR REPLACE FUNCTION public.redo_ai_action(p_action_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_action record;
BEGIN
  -- Get the action
  SELECT * INTO v_action FROM public.ai_actions WHERE id = p_action_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;

  IF v_action.status != 'undone' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action is not undone');
  END IF;

  -- Mark as redone
  UPDATE public.ai_actions
  SET status = 'redone', updated_at = now()
  WHERE id = p_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action.operation_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
