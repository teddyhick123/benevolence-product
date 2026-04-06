import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

// GET /api/org/[orgId]/acknowledgments/[id]
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .select(`
        *,
        donors(id, first_name, last_name, organization_name, donor_type, email, address_line1, city, state, postal_code)
      `)
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!letter) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(letter);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/acknowledgments/[id]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = ['letter_type', 'status', 'subject', 'body', 'custom_message', 'sent_via', 'sent_at', 'pdf_url', 'pdf_storage_path', 'tax_year'];
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    // When marking as sent, set sent_at if not provided
    if (updates.status === 'sent' && !updates.sent_at) {
      updates.sent_at = new Date().toISOString();
    }

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(letter);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/acknowledgments/[id]
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { error } = await supabase
      .from('acknowledgment_letters')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
