import type { SessionClient } from '@/lib/api/server-client';

export async function getHoldingCharityLink(db: SessionClient, holdingId: string) {
  const { data, error } = await db
    .from('holdings')
    .select('id, name, portfolio_id, investees(charity_id)')
    .eq('id', holdingId)
    .is('deleted_at', null)
    .single();
  if (error) throw error;

  const investee = Array.isArray(data.investees) ? data.investees[0] : data.investees;
  return {
    id: data.id,
    name: data.name,
    portfolioId: data.portfolio_id,
    charityId: investee?.charity_id ?? null,
  };
}

export function toCharityResponseAliases(charity: {
  id: string;
  ein: string;
  name: string;
  ntee_code?: string | null;
  city?: string | null;
  state?: string | null;
  mission?: string | null;
  total_revenue?: number | null;
  total_expenses?: number | null;
  net_assets?: number | null;
  deductibility_code?: string | null;
  fiscal_year?: number | null;
}) {
  return {
    ...charity,
    sector: charity.ntee_code ?? null,
    mission_statement: charity.mission ?? null,
    annual_revenue: charity.total_revenue ?? null,
    annual_expenses: charity.total_expenses ?? null,
    assets: charity.net_assets ?? null,
    program_expense_ratio: null,
    irs_deductibility_status: charity.deductibility_code ?? null,
    last_form_990_date: charity.fiscal_year?.toString() ?? null,
  };
}
