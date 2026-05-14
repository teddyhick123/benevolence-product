import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; donorId: string }>;
}

// GET /api/org/[orgId]/donors/[donorId]
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: donor, error } = await supabase
      .from('v_donor_summary')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', donorId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!donor) {
      return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
    }

    // Fetch contribution history
    const { data: contributions } = await supabase
      .from('contributions_received')
      .select('*')
      .eq('org_id', orgId)
      .eq('donor_id', donorId)
      .order('contribution_date', { ascending: false });

    // Fetch acknowledgment letters
    const { data: letters } = await supabase
      .from('acknowledgment_letters')
      .select('id, letter_type, status, subject, sent_via, sent_at, pdf_url, created_at')
      .eq('org_id', orgId)
      .eq('donor_id', donorId)
      .order('created_at', { ascending: false });

    return NextResponse.json({ donor, contributions: contributions || [], letters: letters || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/donors/[donorId]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone',
      'organization_name', 'is_organization', 'preferred_name',
      'address_line1', 'address_line2', 'city', 'state', 'zip', 'country',
      'tier', 'recency_status', 'notes', 'tags',
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    const { data: donor, error } = await supabase
      .from('donors')
      .update(updates)
      .eq('id', donorId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(donor);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/donors/[donorId]
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { error } = await supabase
      .from('donors')
      .delete()
      .eq('id', donorId)
      .eq('org_id', orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
