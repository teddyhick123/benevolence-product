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

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .select(`
        *,
        donors(id, first_name, last_name, organization_name, is_organization, email, address_line1, city, state, zip),
        contributions_received:contribution_id(id, amount, contribution_date, contribution_type)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !letter) {
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

    if (updates.status === 'sent' && !updates.sent_at) {
      updates.sent_at = new Date().toISOString();
    }

    // When marked sent, update the linked contribution's acknowledgment status
    if (updates.status === 'sent') {
      const { data: existing } = await supabase
        .from('acknowledgment_letters')
        .select('contribution_id')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (existing?.contribution_id) {
        await supabase
          .from('contributions_received')
          .update({
            acknowledgment_status: 'sent',
            acknowledgment_sent_at: new Date().toISOString(),
          })
          .eq('id', existing.contribution_id);
      }
    }

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
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

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from('acknowledgment_letters')
      .select('status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (existing?.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft letters can be deleted' }, { status: 400 });
    }

    const { error } = await supabase
      .from('acknowledgment_letters')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
