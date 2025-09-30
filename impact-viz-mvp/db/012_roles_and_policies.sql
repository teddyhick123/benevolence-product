-- 1) Helper: can the caller edit this portfolio?
create or replace function public.can_edit_portfolio(p_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
      or exists (
        select 1 from public.portfolio_members m
        where m.portfolio_id = p_portfolio_id
          and m.user_id = auth.uid()
          and m.role in ('editor','owner')
      );
$$;
revoke all on function public.can_edit_portfolio(uuid) from public;
grant execute on function public.can_edit_portfolio(uuid) to authenticated;

-- 2) Helper: caller's role within a portfolio
create or replace function public.role_for_portfolio(p_portfolio_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then 'admin'
    else (select m.role from public.portfolio_members m
          where m.portfolio_id = p_portfolio_id and m.user_id = auth.uid()
          limit 1)
  end;
$$;
revoke all on function public.role_for_portfolio(uuid) from public;
grant execute on function public.role_for_portfolio(uuid) to authenticated;

-- 3) (Already added earlier) Owner count RPC used by safety rails
-- create or replace function public.owner_count_for_portfolio(p_portfolio_id uuid) ...

-- 4) RLS for edit-able tables (adjust table names to your schema)
-- Holdings
alter table public.holdings enable row level security;
drop policy if exists holdings_read on public.holdings;
create policy holdings_read on public.holdings
for select to authenticated
using (exists (select 1 from public.portfolio_members m
               where m.portfolio_id = holdings.portfolio_id
                 and m.user_id = auth.uid()));

drop policy if exists holdings_write on public.holdings;
create policy holdings_write on public.holdings
for all to authenticated
using (public.can_edit_portfolio(holdings.portfolio_id))
with check (public.can_edit_portfolio(holdings.portfolio_id));

-- KPI definitions / widget layout / metric facts: mirror the same pattern
-- replace table names and portfolio_id column names accordingly