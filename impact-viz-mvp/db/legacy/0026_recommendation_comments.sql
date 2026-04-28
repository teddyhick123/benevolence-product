-- Recommendation Comments/Discussion Table
-- Allows portfolio members to discuss and share notes about recommendations

CREATE TABLE IF NOT EXISTS public.recommendation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Comment content
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),

  -- Threading support (optional parent comment for replies)
  parent_comment_id uuid REFERENCES public.recommendation_comments(id) ON DELETE CASCADE,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_edited boolean DEFAULT false,

  -- Soft delete
  deleted_at timestamptz DEFAULT NULL
);

-- Indexes for performance
CREATE INDEX idx_recommendation_comments_recommendation ON public.recommendation_comments(recommendation_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_recommendation_comments_user ON public.recommendation_comments(user_id);
CREATE INDEX idx_recommendation_comments_parent ON public.recommendation_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;

-- Comments
COMMENT ON TABLE public.recommendation_comments IS 'Discussion threads and notes on portfolio recommendations';
COMMENT ON COLUMN public.recommendation_comments.parent_comment_id IS 'For threaded replies - references parent comment';
COMMENT ON COLUMN public.recommendation_comments.is_edited IS 'Indicates if comment was edited after creation';
COMMENT ON COLUMN public.recommendation_comments.deleted_at IS 'Soft delete timestamp - null means comment is active';

-- Enable RLS
ALTER TABLE public.recommendation_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Portfolio members can view comments on recommendations they have access to
CREATE POLICY "view_recommendation_comments"
  ON public.recommendation_comments FOR SELECT
  USING (
    deleted_at IS NULL AND
    recommendation_id IN (
      SELECT pr.id
      FROM public.portfolio_recommendations pr
      JOIN public.portfolio_members pm ON pr.portfolio_id = pm.portfolio_id
      WHERE pm.user_id = auth.uid()
        AND pr.status = 'active'
    )
  );

-- Policy: Portfolio members can create comments on recommendations they have access to
CREATE POLICY "create_recommendation_comments"
  ON public.recommendation_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    recommendation_id IN (
      SELECT pr.id
      FROM public.portfolio_recommendations pr
      JOIN public.portfolio_members pm ON pr.portfolio_id = pm.portfolio_id
      WHERE pm.user_id = auth.uid()
        AND pr.status = 'active'
    )
  );

-- Policy: Users can update their own comments
CREATE POLICY "update_own_comments"
  ON public.recommendation_comments FOR UPDATE
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can soft-delete their own comments
CREATE POLICY "delete_own_comments"
  ON public.recommendation_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND deleted_at IS NOT NULL);

-- Function to update comment count on recommendations
-- This can be called via trigger or manually
CREATE OR REPLACE FUNCTION get_recommendation_comment_count(rec_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)
  FROM public.recommendation_comments
  WHERE recommendation_id = rec_id
    AND deleted_at IS NULL;
$$;

COMMENT ON FUNCTION get_recommendation_comment_count IS 'Returns count of active comments for a recommendation';

-- Trigger to automatically set is_edited flag when content changes
CREATE OR REPLACE FUNCTION set_comment_edited()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.is_edited := true;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_comment_edited
  BEFORE UPDATE ON public.recommendation_comments
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION set_comment_edited();

COMMENT ON TRIGGER trigger_set_comment_edited ON public.recommendation_comments IS 'Automatically marks comments as edited when content changes';
