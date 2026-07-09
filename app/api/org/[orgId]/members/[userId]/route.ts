import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
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

async function countActiveOwners(adminClient: ReturnType<typeof createAdminClient>, orgId: string) {
  const { count, error } = await adminClient
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

// PATCH /api/org/[orgId]/members/[userId] — update role
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { role } = await req.json();
    const validRoles = ['admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return json({ error: 'Invalid role' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: existing, error: existingError } = await adminClient
      .from('organization_members')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) return json({ error: existingError.message }, { status: 500 });
    if (!existing) return json({ error: 'Member not found' }, { status: 404 });
    if (existing.role === 'owner' && (await countActiveOwners(adminClient, orgId)) <= 1) {
      return json({ error: 'Cannot change the last owner role' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('organization_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    // Write audit log
    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });
    const { error: auditError } = await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: actor.id,
      action: 'role_changed',
      target_id: userId,
      metadata: { before_role: existing.role, after_role: role },
    });
    if (auditError) {
      await adminClient
        .from('organization_members')
        .update({ role: existing.role })
        .eq('org_id', orgId)
        .eq('user_id', userId);
      return json({ error: auditError.message }, { status: 500 });
    }

    return json(data);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/members/[userId] — remove member
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: existing, error: existingError } = await adminClient
      .from('organization_members')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) return json({ error: existingError.message }, { status: 500 });
    if (!existing) return json({ error: 'Member not found' }, { status: 404 });
    if (existing.role === 'owner' && (await countActiveOwners(adminClient, orgId)) <= 1) {
      return json({ error: 'Cannot remove the last owner' }, { status: 400 });
    }

    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });

    const removedAt = new Date().toISOString();
    const { error } = await adminClient
      .from('organization_members')
      .update({ deleted_at: removedAt, deleted_by: actor.id })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    // Write audit log
    const { error: auditError } = await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: actor.id,
      action: 'member_removed',
      target_id: userId,
      metadata: { removed_at: removedAt, previous_role: existing.role },
    });
    if (auditError) {
      await adminClient
        .from('organization_members')
        .update({ deleted_at: null, deleted_by: null })
        .eq('org_id', orgId)
        .eq('user_id', userId);
      return json({ error: auditError.message }, { status: 500 });
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
