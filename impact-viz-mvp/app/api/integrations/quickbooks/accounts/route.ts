// app/api/integrations/quickbooks/accounts/route.ts
// GET /api/integrations/quickbooks/accounts?portfolio_id=<uuid>
// Returns the locally-synced QuickBooks accounts for the portfolio.

import { createServerClient } from '@/lib/supabase';

export async function GET(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get('portfolio_id');
  if (!portfolioId) {
    return Response.json({ error: 'portfolio_id is required' }, { status: 400 });
  }

  // RLS restricts to portfolios the user belongs to
  const { data: accounts, error } = await supabase
    .from('qb_accounts')
    .select('id, qb_account_id, name, type, subtype, current_balance, synced_at')
    .eq('portfolio_id', portfolioId)
    .order('type')
    .order('name');

  if (error) {
    return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  return Response.json({ accounts: accounts ?? [] });
}
