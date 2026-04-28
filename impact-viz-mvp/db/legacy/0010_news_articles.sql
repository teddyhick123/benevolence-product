-- Create news_articles table to store news related to holdings
CREATE TABLE IF NOT EXISTS public.news_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  source text,
  published_at timestamp with time zone,
  summary text,
  image_url text,
  sentiment text CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT news_articles_pkey PRIMARY KEY (id),
  CONSTRAINT news_articles_holding_id_fkey FOREIGN KEY (holding_id) REFERENCES public.holdings(id) ON DELETE CASCADE,
  CONSTRAINT news_articles_url_unique UNIQUE (url, holding_id)
);

-- Index for fast queries by holding and date
CREATE INDEX IF NOT EXISTS idx_news_holding_published ON public.news_articles(holding_id, published_at DESC);

-- Index for querying recent news across all holdings
CREATE INDEX IF NOT EXISTS idx_news_published ON public.news_articles(published_at DESC);

-- Enable RLS
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

-- Read policy: anyone who can view the holding can view its news
CREATE POLICY news_articles_read ON public.news_articles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.holdings h
    JOIN public.portfolio_members m ON m.portfolio_id = h.portfolio_id
    WHERE h.id = news_articles.holding_id
    AND m.user_id = auth.uid()
  )
);

-- Write policy: only admins can insert/update/delete news articles
CREATE POLICY news_articles_write ON public.news_articles
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid()
  )
);
