import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
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

// GET /api/org/[orgId]/acknowledgments/[id]
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .select(`
        *,
        donors(id, first_name, last_name, organization_name, is_organization, email, address_line1, city, state, zip)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error || !letter) {
      return json({ error: 'Not found' }, { status: 404 });
    }

    const contributionIds = Array.isArray(letter.contribution_ids) ? letter.contribution_ids : [];
    const { data: contributions } = contributionIds.length
      ? await supabase
        .from('contributions_received')
        .select('id, amount, contribution_date, gift_type')
        .eq('org_id', orgId)
        .in('id', contributionIds)
      : { data: [] };

    return json({ ...letter, contributions: contributions || [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/acknowledgments/[id]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = ['status', 'subject', 'body', 'notes', 'delivery_method', 'sent_at', 'storage_path', 'storage_bucket'];
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }
    if ('sent_via' in body) updates.delivery_method = body.sent_via;

    if (Object.keys(updates).length === 0) {
      return json({ error: 'No updates provided' }, { status: 400 });
    }

    if (updates.status === 'sent' && !updates.sent_at) {
      updates.sent_at = new Date().toISOString();
    }

    // When marked sent, update the linked contribution's acknowledgment status
    if (updates.status === 'sent') {
      const { data: existing } = await supabase
        .from('acknowledgment_letters')
        .select('contribution_ids')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();

      const contributionIds = Array.isArray(existing?.contribution_ids)
        ? existing.contribution_ids
        : [];
      if (contributionIds.length > 0) {
        const { error: contributionUpdateError } = await supabase
          .from('contributions_received')
          .update({
            acknowledgment_sent: true,
            acknowledged_at: updates.sent_at,
            receipt_status: 'sent',
            receipt_sent_at: updates.sent_at,
          })
          .eq('org_id', orgId)
          .in('id', contributionIds);
        if (contributionUpdateError) {
          return json({ error: contributionUpdateError.message }, { status: 500 });
        }
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
      return json({ error: error.message }, { status: 500 });
    }

    return json(letter);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/acknowledgments/[id]
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from('acknowledgment_letters')
      .select('status')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!existing) {
      return json({ error: 'Not found' }, { status: 404 });
    }
    if (existing?.status !== 'draft') {
      return json({ error: 'Only draft letters can be deleted' }, { status: 400 });
    }

    const { error } = await supabase
      .from('acknowledgment_letters')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
