-- Recommendation Status Tracking
-- Track the progression of recommendations through various stages

-- Add status tracking fields to portfolio_recommendations
ALTER TABLE public.portfolio_recommendations
ADD COLUMN IF NOT EXISTS interaction_status text DEFAULT 'new' CHECK (
  interaction_status IN ('new', 'reviewing', 'interested', 'contacted', 'meeting_scheduled', 'in_discussion', 'approved', 'declined', 'donated')
);

ALTER TABLE public.portfolio_recommendations
ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now();

ALTER TABLE public.portfolio_recommendations
ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES auth.users(id);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_interaction_status
  ON public.portfolio_recommendations(portfolio_id, interaction_status, status_updated_at DESC)
  WHERE status = 'active';

-- Comments
COMMENT ON COLUMN public.portfolio_recommendations.interaction_status IS 'Tracks the engagement stage: new, reviewing, interested, contacted, meeting_scheduled, in_discussion, approved, declined, donated';
COMMENT ON COLUMN public.portfolio_recommendations.status_updated_at IS 'Timestamp of last status change';
COMMENT ON COLUMN public.portfolio_recommendations.status_updated_by IS 'User who last updated the status';

-- Create status history table for audit trail
CREATE TABLE IF NOT EXISTS public.recommendation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Status change
  old_status text,
  new_status text NOT NULL,
  notes text, -- Optional notes about the status change

  -- Metadata
  created_at timestamptz DEFAULT now()
);

-- Indexes for history
CREATE INDEX idx_recommendation_status_history_recommendation
  ON public.recommendation_status_history(recommendation_id, created_at DESC);
CREATE INDEX idx_recommendation_status_history_user
  ON public.recommendation_status_history(user_id);

COMMENT ON TABLE public.recommendation_status_history IS 'Audit trail of recommendation status changes';
COMMENT ON COLUMN public.recommendation_status_history.notes IS 'Optional context about why status changed';

-- Enable RLS on status history
ALTER TABLE public.recommendation_status_history ENABLE ROW LEVEL SECURITY;

-- Policy: Portfolio members can view status history for recommendations they have access to
CREATE POLICY "view_recommendation_status_history"
  ON public.recommendation_status_history FOR SELECT
  USING (
    recommendation_id IN (
      SELECT pr.id
      FROM public.portfolio_recommendations pr
      JOIN public.portfolio_members pm ON pr.portfolio_id = pm.portfolio_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Policy: Portfolio members can add status history for recommendations they have access to
CREATE POLICY "create_recommendation_status_history"
  ON public.recommendation_status_history FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    recommendation_id IN (
      SELECT pr.id
      FROM public.portfolio_recommendations pr
      JOIN public.portfolio_members pm ON pr.portfolio_id = pm.portfolio_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Function to automatically record status changes in history
CREATE OR REPLACE FUNCTION record_recommendation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if status actually changed
  IF (TG_OP = 'UPDATE' AND NEW.interaction_status IS DISTINCT FROM OLD.interaction_status) THEN
    INSERT INTO public.recommendation_status_history (
      recommendation_id,
      user_id,
      old_status,
      new_status,
      created_at
    ) VALUES (
      NEW.id,
      NEW.status_updated_by,
      OLD.interaction_status,
      NEW.interaction_status,
      NEW.status_updated_at
    );
  ELSIF (TG_OP = 'INSERT' AND NEW.interaction_status IS NOT NULL) THEN
    -- Record initial status on insert
    INSERT INTO public.recommendation_status_history (
      recommendation_id,
      user_id,
      old_status,
      new_status,
      created_at
    ) VALUES (
      NEW.id,
      NEW.recommended_by,
      NULL,
      NEW.interaction_status,
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-record status changes
DROP TRIGGER IF EXISTS trigger_record_status_change ON public.portfolio_recommendations;
CREATE TRIGGER trigger_record_status_change
  AFTER INSERT OR UPDATE ON public.portfolio_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION record_recommendation_status_change();

COMMENT ON FUNCTION record_recommendation_status_change IS 'Automatically records status changes to history table';
COMMENT ON TRIGGER trigger_record_status_change ON public.portfolio_recommendations IS 'Logs all status changes for audit trail';

-- Create view for recommendations with latest status info
CREATE OR REPLACE VIEW public.recommendations_with_status AS
SELECT
  pr.*,
  u.email as status_updated_by_email,
  (
    SELECT COUNT(*)
    FROM public.recommendation_status_history rsh
    WHERE rsh.recommendation_id = pr.id
  ) as status_change_count,
  (
    SELECT json_agg(
      json_build_object(
        'old_status', rsh.old_status,
        'new_status', rsh.new_status,
        'changed_by', u2.email,
        'changed_at', rsh.created_at,
        'notes', rsh.notes
      ) ORDER BY rsh.created_at DESC
    )
    FROM public.recommendation_status_history rsh
    LEFT JOIN auth.users u2 ON rsh.user_id = u2.id
    WHERE rsh.recommendation_id = pr.id
    LIMIT 5
  ) as recent_status_history
FROM public.portfolio_recommendations pr
LEFT JOIN auth.users u ON pr.status_updated_by = u.id;

COMMENT ON VIEW public.recommendations_with_status IS 'Recommendations enriched with status information and recent history';
