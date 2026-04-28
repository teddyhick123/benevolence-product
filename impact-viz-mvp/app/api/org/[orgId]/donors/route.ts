import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/donors — list donors via v_donor_summary
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let query = supabase
      .from('v_donor_summary')
      .select('*')
      .eq('org_id', orgId);

    const name = searchParams.get('name');
    const tier = searchParams.get('donor_tier');
    const recencyStatus = searchParams.get('recency_status');
    const minGiving = searchParams.get('min_lifetime_giving');
    const pendingAcks = searchParams.get('pending_acknowledgments');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    if (name) query = query.ilike('display_name', `%${name}%`);
    if (tier) query = query.eq('computed_tier', tier);
    if (recencyStatus) query = query.eq('recency_status', recencyStatus);
    if (minGiving) query = query.gte('total_lifetime_giving', parseFloat(minGiving));
    if (pendingAcks === 'true') query = query.eq('has_pending_acknowledgments', true);

    const { data: donors, error } = await query
      .order('total_lifetime_giving', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ donors, count: donors?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/donors — create donor
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(donor, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
