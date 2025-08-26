-- Raw uploads (metadata)
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_ext text,
  bytes bigint,
  uploaded_by uuid,
  status text not null default 'queued', -- queued|processing|done|error
  job_id uuid,                           -- n8n job correlation
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Staging rows parsed from reports (one row per holding or metric)
create table if not exists public.staging_metric_facts (
  id bigint generated always as identity primary key,
  upload_id uuid references public.uploads(id) on delete cascade,
  as_of_date date,
  portfolio_code text,
  holding_id text,
  holding_name text,
  sector text,
  country text,
  metric_name text,    -- e.g. "CO2e_tons", "Jobs", "MW"
  metric_value numeric,
  currency text,
  raw jsonb
);

-- Canonical holdings (for dashboard)
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_code text not null,
  holding_id text not null,
  holding_name text not null,
  sector text,
  country text,
  created_at timestamptz default now(),
  unique (portfolio_code, holding_id)
);

-- Facts table (star schema)
create table if not exists public.holding_facts (
  id bigint generated always as identity primary key,
  holding_uuid uuid references public.holdings(id) on delete cascade,
  as_of_date date not null,
  metric_name text not null,
  metric_value numeric not null,
  currency text,
  upload_id uuid references public.uploads(id) on delete set null
);

-- Helpful view (used by /api/portfolio/.../overview)
create or replace view public.v_portfolio_latest as
select h.portfolio_code,
       h.holding_name,
       h.sector,
       h.country,
       f.metric_name,
       f.metric_value,
       f.as_of_date
from public.holdings h
join lateral (
  select metric_name, metric_value, as_of_date
  from public.holding_facts f
  where f.holding_uuid = h.id
  order by as_of_date desc
  limit 1
) f on true;

-- RLS
alter table public.uploads enable row level security;
alter table public.staging_metric_facts enable row level security;
alter table public.holdings enable row level security;
alter table public.holding_facts enable row level security;

create policy "read all for dashboards" on public.v_portfolio_latest
for select using (true);

create policy "uploads readable" on public.uploads for select using (true);
create policy "facts readable" on public.holding_facts for select using (true);
create policy "holdings readable" on public.holdings for select using (true);
create policy "staging readable" on public.staging_metric_facts for select using (true);
