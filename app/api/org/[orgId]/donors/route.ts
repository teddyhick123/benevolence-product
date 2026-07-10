import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { isOrgOperator } from '@/lib/roles';

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

// GET /api/org/[orgId]/donors — list donors via v_donor_summary
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    // Donor PII (email, phone, address) is restricted to member-and-above.
    // Viewer role can read aggregate org data but not individual donor records.
    if (!isOrgOperator(role)) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    let query = supabase
      .from('v_donor_summary')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId);

    const name = searchParams.get('name');
    const tier = searchParams.get('donor_tier');
    const recencyStatus = searchParams.get('recency_status');
    const minGiving = searchParams.get('min_lifetime_giving');
    const pendingAcks = searchParams.get('pending_acknowledgments');
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 50;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    if (name) query = query.ilike('display_name', `%${name}%`);
    if (tier) query = query.eq('computed_tier', tier);
    if (recencyStatus) query = query.eq('recency_status', recencyStatus);
    if (minGiving) {
      const parsedMinGiving = Number.parseFloat(minGiving);
      if (Number.isFinite(parsedMinGiving)) {
        query = query.gte('total_lifetime_giving', parsedMinGiving);
      }
    }
    if (pendingAcks === 'true') query = query.eq('has_pending_acknowledgments', true);

    const { data: donors, count, error } = await query
      .order('total_lifetime_giving', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({
      donors,
      total: count ?? donors?.length ?? 0,
      count: donors?.length || 0,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/donors — create donor
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const {
      first_name, last_name, email, phone,
      organization_name, is_organization, preferred_name,
      address_line1, address_line2, city, state, zip, country,
      tier, notes, tags,
    } = body;

    const { data: donor, error } = await supabase
      .from('donors')
      .insert({
        org_id: orgId,
        first_name: first_name || null,
        last_name: last_name || null,
        email: email || null,
        phone: phone || null,
        organization_name: organization_name || null,
        is_organization: is_organization || false,
        preferred_name: preferred_name || null,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        country: country || 'US',
        tier: tier || 'prospect',
        notes: notes || null,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json(donor, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
