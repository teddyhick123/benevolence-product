import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/compliance/state-registrations
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('state_registrations')
      .select('*')
      .eq('organization_id', orgId)
      .order('state');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/compliance/state-registrations — upsert on org+state
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const {
      state, registration_number, registered_name, registration_date,
      expiration_date, renewal_due_date, status, annual_report_due,
      annual_report_filed, filing_fee, notes,
    } = body;

    if (!state) {
      return NextResponse.json({ error: 'state is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('state_registrations')
      .upsert(
        {
          organization_id: orgId,
          state: state.toUpperCase(),
          registration_number: registration_number || null,
          registered_name: registered_name || null,
          registration_date: registration_date || null,
          expiration_date: expiration_date || null,
          renewal_due_date: renewal_due_date || null,
          status: status || 'pending',
          annual_report_due: annual_report_due || null,
          annual_report_filed: annual_report_filed || null,
          filing_fee: filing_fee ?? null,
          notes: notes || null,
        },
        { onConflict: 'organization_id,state' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
