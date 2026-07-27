import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/org — list orgs the current user belongs to
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('organization_members')
      .select(`role, organizations (*)`)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const organizations = (data || []).map((row: any) => ({
      ...row.organizations,
      role: row.role,
    }));

    return NextResponse.json({ organizations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org — create a new organization
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, ein, org_type, fiscal_year_end, state_of_incorporation } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Create organization
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .insert({
        name: name.trim(),
        ein: ein?.trim() || null,
        org_type: org_type || 'private_foundation',
        org_type_config: {
          fiscal_year_end: fiscal_year_end || null,
          state_of_incorporation: state_of_incorporation?.trim() || null,
        },
        modules: { portfolio: true },
      })
      .select()
      .single();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // Add creator as owner
    const { error: memberError } = await adminClient
      .from('organization_members')
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: 'owner',
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      await adminClient.from('organizations').delete().eq('id', org.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    // Auto-create a default portfolio so new users can reach the dashboard immediately
    let portfolio_id: string | null = null;
    const { data: portfolio, error: portfolioError } = await adminClient
      .from('portfolios')
      .insert({
        org_id: org.id,
        owner_id: user.id,
        name: name.trim(),
        settings: { base_currency: 'USD' },
      })
      .select('id')
      .single();

    if (!portfolioError && portfolio) {
      portfolio_id = portfolio.id;
      await adminClient
        .from('portfolio_members')
        .insert({ user_id: user.id, portfolio_id: portfolio.id, role: 'owner' });
    }

    // Auto-seed standard foundation filings for the current year
    const currentYear = new Date().getFullYear();
    try {
      await adminClient.from('filing_calendar').insert([
        {
          org_id: org.id,
          filing_type: 'form_990_pf',
          title: 'Form 990-PF Annual Return',
          description: 'Annual return for private foundations — reports assets, income, distributions, and officer compensation.',
          jurisdiction: 'federal',
          due_date: `${currentYear}-05-15`,
          extension_due_date: `${currentYear}-11-15`,
          period_start: `${currentYear - 1}-01-01`,
          period_end: `${currentYear - 1}-12-31`,
          status: 'upcoming',
        },
        {
          org_id: org.id,
          filing_type: 'irs_extension',
          title: 'Form 8868 — Extension Request',
          description: 'Automatic 6-month extension of time to file Form 990-PF. Extends deadline from May 15 to November 15.',
          jurisdiction: 'federal',
          due_date: `${currentYear}-05-15`,
          period_start: `${currentYear - 1}-01-01`,
          period_end: `${currentYear - 1}-12-31`,
          status: 'upcoming',
        },
      ]);
    } catch {
      // Filing seed failure should not block organization creation.
    }

    return NextResponse.json({ ...org, portfolio_id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
