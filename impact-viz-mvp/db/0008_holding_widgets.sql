-- Create holding_widgets table for holding-specific visualizations
CREATE TABLE IF NOT EXISTS public.holding_widgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL,
  type text NOT NULL,
  title text,
  config jsonb,
  position integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT holding_widgets_pkey PRIMARY KEY (id),
  CONSTRAINT holding_widgets_holding_id_fkey FOREIGN KEY (holding_id) REFERENCES public.holdings(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.holding_widgets ENABLE ROW LEVEL SECURITY;

-- Read policy: anyone who can read the holding can read its widgets
CREATE POLICY holding_widgets_read ON public.holding_widgets
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.holdings h
    JOIN public.portfolio_members m ON m.portfolio_id = h.portfolio_id
    WHERE h.id = holding_widgets.holding_id
    AND m.user_id = auth.uid()
  )
);

-- Write policy: only editors, owners, and admins can manage widgets
CREATE POLICY holding_widgets_write ON public.holding_widgets
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.holdings h
    WHERE h.id = holding_widgets.holding_id
    AND public.can_edit_portfolio(h.portfolio_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.holdings h
    WHERE h.id = holding_widgets.holding_id
    AND public.can_edit_portfolio(h.portfolio_id)
  )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS holding_widgets_holding_id_idx ON public.holding_widgets(holding_id);
CREATE INDEX IF NOT EXISTS holding_widgets_position_idx ON public.holding_widgets(position);
