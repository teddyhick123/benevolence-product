import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ALLOWED_DONOR_ROLES = ['owner', 'admin', 'member'];

interface RouteParams {
  params: Promise<{ orgId: string; donorId: string }>;
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

// GET /api/org/[orgId]/donors/[donorId]
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ALLOWED_DONOR_ROLES.includes(role)) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: donor, error } = await supabase
      .from('v_donor_summary')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', donorId)
      .maybeSingle();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }
    if (!donor) {
      return json({ error: 'Donor not found' }, { status: 404 });
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

    return json({ donor, contributions: contributions || [], letters: letters || [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/donors/[donorId]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return json({ error: 'Not authorized' }, { status: 403 });
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
    if (Object.keys(updates).length === 0) {
      return json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: donor, error } = await supabase
      .from('donors')
      .update(updates)
      .eq('id', donorId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json(donor);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/donors/[donorId]
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: donor, error } = await supabase
      .from('donors')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', donorId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }
    if (!donor) return json({ error: 'Donor not found' }, { status: 404 });

    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
