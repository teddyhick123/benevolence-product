-- DOCUMENTATION ONLY — DO NOT RUN as a migration
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admins_pkey PRIMARY KEY (user_id),
  CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  investee_id uuid,
  event_date date,
  severity text,
  headline text,
  source_link text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_investee_id_fkey FOREIGN KEY (investee_id) REFERENCES public.investees(id)
);
CREATE TABLE public.holding_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  holding_id uuid NOT NULL,
  amount numeric NOT NULL,
  contributed_at timestamp with time zone NOT NULL DEFAULT now(),
  memo text,
  source text,
  inserted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT holding_contributions_pkey PRIMARY KEY (id),
  CONSTRAINT holding_contributions_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id),
  CONSTRAINT holding_contributions_holding_id_fkey FOREIGN KEY (holding_id) REFERENCES public.holdings(id)
);
CREATE TABLE public.holding_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  holding_id uuid,
  name text NOT NULL,
  tags ARRAY DEFAULT '{}'::text[],
  status text,
  as_of date,
  amount_usd numeric,
  lon double precision NOT NULL,
  lat double precision NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT holding_locations_pkey PRIMARY KEY (id),
  CONSTRAINT holding_locations_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id),
  CONSTRAINT holding_locations_holding_id_fkey FOREIGN KEY (holding_id) REFERENCES public.holdings(id)
);
CREATE TABLE public.holdings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_id uuid,
  investee_id uuid,
  asset_class text,
  custodian text,
  valuation_method text,
  created_at timestamp with time zone DEFAULT now(),
  name text,
  status USER-DEFINED DEFAULT 'Active'::holding_status,
  funds_allocated numeric,
  as_of date,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  sector text,
  country text,
  primary_contact_name text,
  primary_contact_email text,
  location_city text,
  location_state text,
  location_country text,
  theory_of_action text,
  cost_per_outcome numeric,
  cost_per_outcome_unit text,
  description text,
  CONSTRAINT holdings_pkey PRIMARY KEY (id),
  CONSTRAINT holdings_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id),
  CONSTRAINT holdings_investee_id_fkey FOREIGN KEY (investee_id) REFERENCES public.investees(id)
);
CREATE TABLE public.investees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  sector text,
  impact_theme text,
  country text,
  region text,
  listed_private text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT investees_pkey PRIMARY KEY (id)
);
CREATE TABLE public.kpi_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  metric_code text NOT NULL,
  display_name text,
  target_value numeric,
  target_date date,
  calculation text,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  unit text,
  CONSTRAINT kpi_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT kpi_definitions_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id),
  CONSTRAINT kpi_definitions_metric_code_fkey FOREIGN KEY (metric_code) REFERENCES public.metrics(code)
);
CREATE TABLE public.metric_facts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  investee_id uuid,
  holding_id uuid,
  metric_code text,
  period_start date,
  period_end date,
  value numeric,
  source text,
  verification_level text,
  data_quality_score numeric,
  updated_at timestamp with time zone DEFAULT now(),
  unit text,
  CONSTRAINT metric_facts_pkey PRIMARY KEY (id),
  CONSTRAINT metric_facts_investee_id_fkey FOREIGN KEY (investee_id) REFERENCES public.investees(id),
  CONSTRAINT metric_facts_holding_id_fkey FOREIGN KEY (holding_id) REFERENCES public.holdings(id),
  CONSTRAINT metric_facts_metric_code_fkey FOREIGN KEY (metric_code) REFERENCES public.metrics(code)
);
CREATE TABLE public.metrics (
  code text NOT NULL,
  name text NOT NULL,
  unit text,
  directionality text CHECK (directionality = ANY (ARRAY['higher_is_better'::text, 'lower_is_better'::text])),
  aggregation_function text,
  description text,
  CONSTRAINT metrics_pkey PRIMARY KEY (code)
);
CREATE TABLE public.portfolio_members (
  user_id uuid NOT NULL,
  portfolio_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])),
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT portfolio_members_pkey PRIMARY KEY (user_id, portfolio_id),
  CONSTRAINT portfolio_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT portfolio_members_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id)
);
CREATE TABLE public.portfolio_settings (
  portfolio_id uuid NOT NULL,
  show_map boolean DEFAULT true,
  widgets jsonb DEFAULT '["kpi_waci", "sector_emissions"]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT portfolio_settings_pkey PRIMARY KEY (portfolio_id),
  CONSTRAINT portfolio_settings_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id)
);
CREATE TABLE public.portfolios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_family text,
  base_currency text DEFAULT 'USD'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT portfolios_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  user_id uuid NOT NULL,
  portfolio_id uuid,
  display_name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT profiles_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id)
);
CREATE TABLE public.sdg_mapping (
  metric_code text,
  sdg text,
  sdg_target text,
  weight numeric DEFAULT 1.0,
  CONSTRAINT sdg_mapping_metric_code_fkey FOREIGN KEY (metric_code) REFERENCES public.metrics(code)
);
CREATE TABLE public.targets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scope text CHECK (scope = ANY (ARRAY['Portfolio'::text, 'Investee'::text])),
  portfolio_id uuid,
  investee_id uuid,
  metric_code text,
  target_value numeric,
  target_date date,
  baseline_value numeric,
  baseline_date date,
  owner text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT targets_pkey PRIMARY KEY (id),
  CONSTRAINT targets_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id),
  CONSTRAINT targets_investee_id_fkey FOREIGN KEY (investee_id) REFERENCES public.investees(id),
  CONSTRAINT targets_metric_code_fkey FOREIGN KEY (metric_code) REFERENCES public.metrics(code)
);
CREATE TABLE public.uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_name text,
  file_ext text,
  bytes bigint,
  uploaded_by uuid,
  status text NOT NULL DEFAULT 'queued'::text,
  job_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  portfolio_id uuid,
  holding_id uuid,
  ai_mode boolean,
  selected_metrics ARRAY,
  storage_path text,
  CONSTRAINT uploads_pkey PRIMARY KEY (id),
  CONSTRAINT uploads_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id),
  CONSTRAINT uploads_holding_id_fkey FOREIGN KEY (holding_id) REFERENCES public.holdings(id)
);
CREATE TABLE public.widgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  type text NOT NULL,
  title text,
  config jsonb,
  position integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT widgets_pkey PRIMARY KEY (id),
  CONSTRAINT widgets_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id)
);