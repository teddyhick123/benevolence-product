import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

// PATCH /api/org/[orgId]/members/[userId] — update role
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { role } = await req.json();
    const validRoles = ['admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('organization_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Write audit log
    try {
      const { data: { user: actor } } = await supabase.auth.getUser();
      if (actor) {
        const adminAudit = createAdminClient();
        await adminAudit.from('org_audit_log').insert({
          org_id: orgId,
          actor_id: actor.id,
          action: 'role_changed',
          target_id: userId,
          metadata: { role },
        });
      }
    } catch { /* audit failure should not block response */ }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/members/[userId] — remove member
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Write audit log
    try {
      const { data: { user: actor } } = await supabase.auth.getUser();
      if (actor) {
        const adminAudit = createAdminClient();
        await adminAudit.from('org_audit_log').insert({
          org_id: orgId,
          actor_id: actor.id,
          action: 'member_removed',
          target_id: userId,
          metadata: {},
        });
      }
    } catch { /* audit failure should not block response */ }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
