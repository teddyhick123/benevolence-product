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

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
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
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canViewErr) return json({ error: canViewErr.message }, { status: 500 });
    if (!canView) return json({ error: 'Access denied' }, { status: 403 });

    const sb = getServiceClient();

    // Get payout_history base
    const { data: payout, error: payoutError } = await sb
      .from('payout_history')
      .select('distributable_amount, minimum_investment_return, net_value_non_charitable')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();
    if (payoutError) throw payoutError;

    // Days remaining in tax year
    const yearEnd = new Date(`${year}-12-31`);
    const today = new Date();
    const daysRemaining = Math.max(0, Math.floor((yearEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    if (!payout) {
      return json({
        tax_year: year,
        data_missing: true,
        warning: 'Payout history is missing for this tax year. Enter §4942 payout inputs before relying on forecast status.',
        distributable_amount: null,
        distributions_to_date: null,
        pipeline_total: null,
        pipeline_payments: [],
        shortfall_before_pipeline: null,
        shortfall_after_pipeline: null,
        on_track: null,
        days_remaining: daysRemaining,
        pct_complete: null,
      });
    }

    const distributableAmount = payout?.distributable_amount ?? 0;

    // Sum qualifying distributions already recorded
    const { data: qdRows, error: qdError } = await sb
      .from('qualifying_distributions')
      .select('qualifying_amount, grant_payment_id')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year);
    if (qdError) throw qdError;

    const distributionsToDate = (qdRows || []).reduce(
      (sum, r) => sum + (r.qualifying_amount || 0), 0
    );

    // Pipeline: approved or scheduled grant payments not yet counted as distributions
    let pipelineTotal = 0;
    let pipelinePayments: any[] = [];

    if (includePending) {
      // Get all grant IDs in this portfolio
      const { data: grants, error: grantsError } = await sb
        .from('grants')
        .select('id')
        .eq('portfolio_id', portfolioId)
        .is('deleted_at', null);

      if (grantsError) throw grantsError;

      if (grants && grants.length > 0) {
        const grantIds = grants.map(g => g.id);
        const countedPaymentIds = new Set(
          (qdRows || [])
            .map(r => r.grant_payment_id)
            .filter((id): id is string => typeof id === 'string')
        );

        const { data: payments, error: paymentsError } = await sb
          .from('grant_payments')
          .select('id, amount, status, scheduled_date')
          .in('grant_id', grantIds)
          .in('status', ['approved', 'scheduled']);

        if (paymentsError) throw paymentsError;

        pipelinePayments = (payments || []).filter(p => !countedPaymentIds.has(p.id));
        pipelineTotal = pipelinePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      }
    }

    const shortfallBeforePipeline = Math.max(0, distributableAmount - distributionsToDate);
    const shortfallAfterPipeline = Math.max(0, shortfallBeforePipeline - pipelineTotal);
    const onTrack = shortfallAfterPipeline <= 0;

    return json({
      tax_year: year,
      data_missing: false,
      warning: null,
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
    return json({ error: err.message }, { status: 500 });
  }
}
