import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * GET /api/portfolio/[id]/compliance/payout-forecast?year=2025&include_pending=true
 * Real-time §4942 payout forecast including pipeline grants
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();
    const includePending = searchParams.get('include_pending') !== 'false';

    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    // Check portfolio access
    const { data: member } = await sb
      .from('portfolio_members')
      .select('portfolio_id')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    // Get payout_history base
    const { data: payout } = await sb
      .from('payout_history')
      .select('distributable_amount, minimum_investment_return, net_value_non_charitable')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();

    const distributableAmount = payout?.distributable_amount ?? 0;

    // Sum qualifying distributions already recorded
    const { data: qdRows } = await sb
      .from('qualifying_distributions')
      .select('qualifying_amount')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year);

    const distributionsToDate = (qdRows || []).reduce(
      (sum, r) => sum + (r.qualifying_amount || 0), 0
    );

    // Pipeline: approved or scheduled grant payments not yet counted as distributions
    let pipelineTotal = 0;
    let pipelinePayments: any[] = [];

    if (includePending) {
      // Get all grant IDs in this portfolio
      const { data: holdings } = await sb
        .from('holdings')
        .select('id')
        .eq('portfolio_id', portfolioId);

      if (holdings && holdings.length > 0) {
        const holdingIds = holdings.map(h => h.id);

        const { data: grants } = await sb
          .from('grants')
          .select('id')
          .in('holding_id', holdingIds);

        if (grants && grants.length > 0) {
          const grantIds = grants.map(g => g.id);

          const { data: payments } = await sb
            .from('grant_payments')
            .select('id, amount, status, scheduled_date')
            .in('grant_id', grantIds)
            .in('status', ['approved', 'scheduled'])
            .not('id', 'in', `(SELECT grant_payment_id FROM public.qualifying_distributions WHERE portfolio_id = '${portfolioId}' AND tax_year = ${year} AND grant_payment_id IS NOT NULL)`);

          pipelinePayments = payments || [];
          pipelineTotal = pipelinePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        }
      }
    }

    const shortfallBeforePipeline = Math.max(0, distributableAmount - distributionsToDate);
    const shortfallAfterPipeline = Math.max(0, shortfallBeforePipeline - pipelineTotal);
    const onTrack = shortfallAfterPipeline <= 0;

    // Days remaining in tax year
    const yearEnd = new Date(`${year}-12-31`);
    const today = new Date();
    const daysRemaining = Math.max(0, Math.floor((yearEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    return NextResponse.json({
      tax_year: year,
      distributable_amount: distributableAmount,
      distributions_to_date: distributionsToDate,
      pipeline_total: pipelineTotal,
      pipeline_payments: pipelinePayments,
      shortfall_before_pipeline: shortfallBeforePipeline,
      shortfall_after_pipeline: shortfallAfterPipeline,
      on_track: onTrack,
      days_remaining: daysRemaining,
      pct_complete: distributableAmount > 0
        ? Math.min(100, Math.round((distributionsToDate / distributableAmount) * 1000) / 10)
        : 100,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
