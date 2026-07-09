import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { calculatePayout } from '@/lib/compliance/payout';
import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/portfolio/[id]/compliance/990pf-export?year=2025
// Returns structured 990-PF data: qualifying distributions from grants, revenue summary
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: portfolioId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear() - 1;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canViewErr) {
      return json({ error: canViewErr.message }, { status: 500 });
    }
    if (!canView) {
      return json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: portfolio, error: portErr } = await supabase
      .from('portfolios')
      .select('id, name, org_id')
      .eq('id', portfolioId)
      .single();

    if (portErr || !portfolio) {
      return json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch 990-PF data and qualifying distributions in parallel.
    const [pf990Res, distributionsRes] = await Promise.all([
      supabase
        .from('foundation_990pf_data')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('tax_year', year)
        .maybeSingle(),
      supabase
        .from('qualifying_distributions')
        .select('id, grant_id, grant_payment_id, distribution_date, distribution_type, qualifying_amount, description, notes')
        .eq('portfolio_id', portfolioId)
        .eq('tax_year', year)
        .gte('distribution_date', `${year}-01-01`)
        .lte('distribution_date', `${year}-12-31`)
        .order('distribution_date'),
    ]);

    if (pf990Res.error) {
      return json({ error: pf990Res.error.message }, { status: 500 });
    }
    if (distributionsRes.error) {
      return json({ error: distributionsRes.error.message }, { status: 500 });
    }

    const pf990 = pf990Res.data;
    const distributions = distributionsRes.data || [];

    const totalQualifyingDistributions = distributions.reduce(
      (sum, distribution) => sum + Number(distribution.qualifying_amount || 0),
      0
    );
    const grantDistributions = distributions.filter(
      (distribution) => distribution.distribution_type === 'grant' || distribution.grant_id
    );
    const totalGrantAmount = grantDistributions.reduce(
      (sum, distribution) => sum + Number(distribution.qualifying_amount || 0),
      0
    );
    const payout = calculatePayout(pf990, totalQualifyingDistributions);

    const exportData = {
      portfolio: { id: portfolioId, name: portfolio.name },
      tax_year: year,
      generated_at: new Date().toISOString(),

      // Part I — Revenue and Expenses summary
      part_i: {
        net_investment_income: pf990?.net_investment_income ?? null,
        excise_tax_amount: pf990?.excise_tax_amount ?? null,
        excise_tax_rate: pf990?.excise_tax_rate ?? 1.39,
        total_grants: pf990?.total_grants ?? totalGrantAmount,
        total_expenses: pf990?.total_expenses ?? null,
      },

      // Part II — Minimum Distribution / Payout
      part_xi: {
        avg_fair_market_value: pf990?.avg_fair_market_value ?? null,
        fair_market_value_assets: pf990?.fair_market_value_assets ?? null,
        exempt_use_assets: payout.exemptUseAssets,
        acquisition_indebtedness: payout.acquisitionIndebtedness,
        net_value_non_charitable: payout.netValueNonCharitable,
        minimum_investment_return: payout.minimumInvestmentReturn,
        required_payout: payout.requiredPayout,
        actual_payout: payout.actualDistributions,
        payout_deficit: pf990?.payout_deficit ?? null,
        qualifying_distributions_total: totalQualifyingDistributions,
      },

      // Part XII — Qualifying Distributions (grants)
      part_xii: {
        grants_count: grantDistributions.length,
        distribution_count: distributions.length,
        grants_total: totalGrantAmount,
        qualifying_distributions_total: totalQualifyingDistributions,
        grants_detail: distributions.map(distribution => ({
          id: distribution.id,
          date: distribution.distribution_date,
          grant_id: distribution.grant_id,
          grant_payment_id: distribution.grant_payment_id,
          amount: distribution.qualifying_amount,
          qualifying_amount: distribution.qualifying_amount,
          type: distribution.distribution_type,
          description: distribution.description,
          notes: distribution.notes,
        })),
      },
    };

    await writeOrgAuditEvent(createAdminClient(), {
      orgId: portfolio.org_id,
      actorId: user.id,
      action: ORG_AUDIT_ACTIONS.COMPLIANCE_990PF_EXPORTED,
      targetId: portfolioId,
      metadata: {
        tax_year: year,
        total_qualifying_distributions: totalQualifyingDistributions,
        grants_count: grantDistributions.length,
        distribution_count: distributions.length,
        required_payout: payout.requiredPayout,
      },
    });

    return json(exportData);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
