-- Portfolio Recommendations Table
-- Allows portfolio owners/admins to curate recommended philanthropic organizations

CREATE TABLE IF NOT EXISTS public.portfolio_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,

  -- Organization details
  organization_name text NOT NULL,
  website text,
  sector text,
  ein text, -- Employer Identification Number
  location text,

  -- Recommendation details
  description text,
  impact_focus text[], -- Array of focus areas
  recommended_by uuid REFERENCES auth.users(id),
  recommended_at timestamptz DEFAULT now(),

  -- Metadata
  accreditation jsonb, -- Store accreditation info (GuideStar rating, etc.)
  contact_info jsonb, -- {email, phone, contact_name}
  min_investment numeric,
  max_investment numeric,

  -- Display order
  order_index int DEFAULT 0,

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_portfolio_recommendations_portfolio ON public.portfolio_recommendations(portfolio_id);
CREATE INDEX idx_portfolio_recommendations_status ON public.portfolio_recommendations(portfolio_id, status) WHERE status = 'active';
CREATE INDEX idx_portfolio_recommendations_order ON public.portfolio_recommendations(portfolio_id, order_index);

-- Comments
COMMENT ON TABLE public.portfolio_recommendations IS 'Curated recommendations of philanthropic organizations for each portfolio';
COMMENT ON COLUMN public.portfolio_recommendations.ein IS 'IRS Employer Identification Number for US nonprofits';
COMMENT ON COLUMN public.portfolio_recommendations.accreditation IS 'JSON object with ratings from Charity Navigator, GuideStar, etc.';
COMMENT ON COLUMN public.portfolio_recommendations.contact_info IS 'JSON object with email, phone, contact_name';
COMMENT ON COLUMN public.portfolio_recommendations.impact_focus IS 'Array of focus areas like Immigration Justice, Climate Action, etc.';

-- Enable RLS
ALTER TABLE public.portfolio_recommendations ENABLE ROW LEVEL SECURITY;

-- Policy: Viewers/editors can view active recommendations for their portfolios
CREATE POLICY "view_portfolio_recommendations"
  ON public.portfolio_recommendations FOR SELECT
  USING (
    status = 'active' AND
    portfolio_id IN (
      SELECT portfolio_id FROM public.portfolio_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Owners can insert/update/delete recommendations for their portfolios
CREATE POLICY "manage_portfolio_recommendations"
  ON public.portfolio_recommendations FOR ALL
  USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.portfolio_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Policy: Admins can manage all recommendations
CREATE POLICY "admin_manage_recommendations"
  ON public.portfolio_recommendations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE user_id = auth.uid()
    )
  );
