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
 * GET /api/portfolio/[id]/compliance/er-grants?status=deficient
 * List ER grant tracking records with compliance flags
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');

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

    let query = sb
      .from('v_er_grant_compliance')
      .select('*')
      .eq('portfolio_id', portfolioId);

    if (statusFilter) {
      query = query.eq('er_status', statusFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return json({ data: data || [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/compliance/er-grants
 * Create a new ER tracking record for a grant
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
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();
    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canEditErr) return json({ error: canEditErr.message }, { status: 500 });
    if (!canEdit) return json({ error: 'Not authorized' }, { status: 403 });

    const body = await req.json();
    const { grant_id, ...rest } = body;
    if (!grant_id) return json({ error: 'grant_id is required' }, { status: 400 });

    const { data: grant, error: grantError } = await sb
      .from('grants')
      .select('id')
      .eq('id', grant_id)
      .eq('portfolio_id', portfolioId)
      .is('deleted_at', null)
      .maybeSingle();
    if (grantError) throw grantError;
    if (!grant) return json({ error: 'Grant not found' }, { status: 404 });

    const { data, error } = await sb
      .from('expenditure_responsibility_grants')
      .insert({ portfolio_id: portfolioId, grant_id, ...rest })
      .select()
      .single();

    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/portfolio/[id]/compliance/er-grants?id=<er_grant_id>
 * Update an ER record (record received reports, terminal report, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const erGrantId = searchParams.get('id');
    if (!erGrantId) return json({ error: 'id query param required' }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();
    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canEditErr) return json({ error: canEditErr.message }, { status: 500 });
    if (!canEdit) return json({ error: 'Not authorized' }, { status: 403 });

    const body = await req.json();
    const allowedFields = [
      'grantee_is_public_charity', 'grantee_ein', 'grantee_501c3_verified',
      'grantee_501c3_verified_at', 'er_agreement_signed_date', 'er_agreement_url',
      'er_reports_required', 'er_report_frequency', 'er_reports_required_count',
      'er_reports_received_count', 'terminal_report_required', 'terminal_report_received',
      'terminal_report_date', 'er_status', 'notes',
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const { data, error } = await sb
      .from('expenditure_responsibility_grants')
      .update(updateData)
      .eq('id', erGrantId)
      .eq('portfolio_id', portfolioId)
      .select()
      .single();

    if (error) throw error;
    return json({ data });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
