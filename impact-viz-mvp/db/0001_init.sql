-- Enable extensions as needed
create extension if not exists "uuid-ossp";

-- Portfolio backbone
create table if not exists portfolios(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_family text,
  base_currency text default 'USD',
  created_at timestamptz default now()
);

create table if not exists investees(
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  sector text,
  impact_theme text,
  country text,
  region text,
  listed_private text,
  created_at timestamptz default now()
);

create table if not exists holdings(
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  investee_id uuid references investees(id) on delete cascade,
  instrument_type text,
  asset_class text,
  nav numeric,
  as_of_date date,
  custodian text,
  valuation_method text,
  created_at timestamptz default now()
);

create table if not exists metrics(
  code text primary key,
  name text not null,
  unit text,
  directionality text check (directionality in ('higher_is_better','lower_is_better')),
  aggregation_function text
);

create table if not exists metric_facts(
  id uuid primary key default gen_random_uuid(),
  investee_id uuid references investees(id) on delete set null,
  holding_id uuid references holdings(id) on delete set null,
  metric_code text references metrics(code),
  period_start date,
  period_end date,
  value numeric,
  source text,
  verification_level text,
  data_quality_score numeric,
  last_updated timestamptz default now()
);

create table if not exists targets(
  id uuid primary key default gen_random_uuid(),
  scope text check (scope in ('Portfolio','Investee')),
  portfolio_id uuid references portfolios(id) on delete cascade,
  investee_id uuid references investees(id) on delete cascade,
  metric_code text references metrics(code),
  target_value numeric,
  target_date date,
  baseline_value numeric,
  baseline_date date,
  owner text,
  created_at timestamptz default now()
);

create table if not exists sdg_mapping(
  metric_code text references metrics(code),
  sdg text,
  sdg_target text,
  weight numeric default 1.0
);

create table if not exists events(
  id uuid primary key default gen_random_uuid(),
  investee_id uuid references investees(id) on delete cascade,
  event_date date,
  severity text,
  headline text,
  source_link text,
  created_at timestamptz default now()
);

-- Staging tables for human-in-the-loop approvals
create schema if not exists staging;
create table if not exists staging.metric_facts like public.metric_facts including all;
alter table staging.metric_facts add column staged_by text, add column note text;
