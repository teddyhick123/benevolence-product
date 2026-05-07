-- Recommendation Favorites/Shortlist Table
-- Allows portfolio members to save recommendations to their personal shortlist

CREATE TABLE IF NOT EXISTS public.recommendation_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES public.portfolio_recommendations(id) ON DELETE CASCADE,

  -- Metadata
  created_at timestamptz DEFAULT now(),

  -- Ensure a user can only favorite a recommendation once
  UNIQUE(user_id, recommendation_id)
);

-- Indexes
CREATE INDEX idx_recommendation_favorites_user ON public.recommendation_favorites(user_id);
CREATE INDEX idx_recommendation_favorites_recommendation ON public.recommendation_favorites(recommendation_id);
CREATE INDEX idx_recommendation_favorites_user_created ON public.recommendation_favorites(user_id, created_at DESC);

-- Comments
COMMENT ON TABLE public.recommendation_favorites IS 'Personal shortlist/favorites for portfolio members to track recommendations they are interested in';

-- Enable RLS
ALTER TABLE public.recommendation_favorites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own favorites
CREATE POLICY "view_own_favorites"
  ON public.recommendation_favorites FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can add/remove their own favorites
CREATE POLICY "manage_own_favorites"
  ON public.recommendation_favorites FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add favorite_count to recommendations view (useful for analytics)
-- Create a view that includes favorite counts
CREATE OR REPLACE VIEW public.recommendations_with_stats AS
SELECT
  pr.*,
  COUNT(DISTINCT rf.id) as favorite_count,
  EXISTS(
    SELECT 1 FROM public.recommendation_favorites rf2
    WHERE rf2.recommendation_id = pr.id
    AND rf2.user_id = auth.uid()
  ) as is_favorited
FROM public.portfolio_recommendations pr
LEFT JOIN public.recommendation_favorites rf ON pr.id = rf.recommendation_id
GROUP BY pr.id;

COMMENT ON VIEW public.recommendations_with_stats IS 'Recommendations with favorite counts and user favorite status';
