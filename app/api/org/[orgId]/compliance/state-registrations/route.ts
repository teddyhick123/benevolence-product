import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

// GET /api/org/[orgId]/compliance/state-registrations
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('state_registrations')
      .select('*')
      .eq('org_id', orgId)
      .order('state');

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ data: data || [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/compliance/state-registrations — upsert on org+state+type
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const {
      state, registration_number, registration_type, registration_date,
      expiration_date, renewal_due_date, last_renewed_date, status,
      exemption_basis, annual_fee, notes,
    } = body;

    if (!state) {
      return json({ error: 'state is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('state_registrations')
      .upsert(
        {
          org_id: orgId,
          state: state.toUpperCase(),
          registration_number: registration_number || null,
          registration_type: registration_type || 'charitable_solicitation',
          registration_date: registration_date || null,
          expiration_date: expiration_date || null,
          renewal_due_date: renewal_due_date || null,
          last_renewed_date: last_renewed_date || null,
          status: status || 'active',
          exemption_basis: exemption_basis || null,
          annual_fee: annual_fee ?? null,
          notes: notes || null,
        },
        { onConflict: 'org_id,state,registration_type' }
      )
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ data }, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
