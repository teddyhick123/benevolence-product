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
 * GET /api/portfolio/[id]/compliance/payout?year=2025
 * Get payout history for a portfolio year
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();

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

    // Get payout_history row
    const { data: payout, error } = await sb
      .from('payout_history')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();

    if (error) throw error;

    // Get real-time payout status from view
    const { data: status } = await sb
      .from('v_payout_status')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();

    // Get qualifying distributions for this year
    const { data: distributions } = await sb
      .from('qualifying_distributions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .order('distribution_date', { ascending: false });

    return NextResponse.json({
      payout_history: payout || null,
      payout_status: status || null,
      qualifying_distributions: distributions || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/compliance/payout
 * Create or update payout_history row for a tax year
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    // Check can_edit_portfolio
    const { data: canEdit } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolioId });
    if (!canEdit) return NextResponse.json({ error: 'Not authorized to edit this portfolio' }, { status: 403 });

    const body = await req.json();
    const { tax_year, ...fields } = body;
    if (!tax_year) return NextResponse.json({ error: 'tax_year is required' }, { status: 400 });

    // Upsert payout_history row
    const upsertData: any = {
      portfolio_id: portfolioId,
      tax_year,
    };

    const allowedFields = [
      'avg_fair_market_value', 'investment_assets', 'cash_and_equivalents',
      'corpus_add_back', 'acquisition_indebtedness', 'net_value_non_charitable',
      'excise_tax_paid', 'qualifying_distributions_total', 'grants_total',
      'program_expenses_total', 'admin_qualifying_total', 'set_asides_total',
      'carryover_from_prior_years', 'carryover_to_next_year', 'carryover_expires_year',
      'is_year_complete', 'notes',
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) upsertData[field] = fields[field];
    }

    const { data, error } = await sb
      .from('payout_history')
      .upsert(upsertData, { onConflict: 'portfolio_id,tax_year' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
