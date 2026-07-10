import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { isOrgRole, isWorkspaceManager } from '@/lib/roles';

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

// GET /api/org/[orgId]/members — list members with profile info
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('organization_members')
      .select('id, org_id, user_id, role, created_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) return json({ error: error.message }, { status: 500 });

    const userIds = Array.from(new Set((data || []).map((member: any) => member.user_id).filter(Boolean)));
    const { data: profiles, error: profilesError } = userIds.length > 0
      ? await adminClient
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds)
      : { data: [], error: null };

    if (profilesError) return json({ error: profilesError.message }, { status: 500 });

    const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    const members = (data || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      email: profilesById.get(m.user_id)?.email || null,
      full_name: profilesById.get(m.user_id)?.full_name || null,
      avatar_url: profilesById.get(m.user_id)?.avatar_url || null,
    }));

    return json({ members, currentRole: role });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/members — add member (admin only)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: actorRole } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!isWorkspaceManager(actorRole)) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { email, user_id, role } = body;

    if (!isOrgRole(role)) {
      return json({ error: 'Invalid role' }, { status: 400 });
    }
    if (role === 'owner' && actorRole !== 'owner') {
      return json({ error: 'Only owners can add another owner' }, { status: 403 });
    }

    let targetUserId = user_id;
    if (email && !user_id) {
      const adminClientForLookup = createAdminClient();
      const { data: users, error: lookupError } = await adminClientForLookup.auth.admin.listUsers();

      if (lookupError) {
        return json({ error: 'Failed to lookup user' }, { status: 500 });
      }

      const foundUser = users.users.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!foundUser) {
        return json({ error: 'No user found with that email address' }, { status: 404 });
      }

      targetUserId = foundUser.id;
    }

    if (!targetUserId) {
      return json({ error: 'Either email or user_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient
      .from('organization_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) return json({ error: 'User is already a member of this organization' }, { status: 409 });

    const { data: member, error } = await adminClient
      .from('organization_members')
      .insert({ org_id: orgId, user_id: targetUserId, role })
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    const { error: auditError } = await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: actor.id,
      action: 'member_added',
      target_id: targetUserId,
      metadata: { role },
    });
    if (auditError) {
      await adminClient
        .from('organization_members')
        .update({ deleted_at: new Date().toISOString(), deleted_by: actor.id })
        .eq('org_id', orgId)
        .eq('user_id', targetUserId);
      return json({ error: auditError.message }, { status: 500 });
    }

    return json(member, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/members — update member role (admin only)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: actorRole } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!isWorkspaceManager(actorRole)) {
      return json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { user_id, role } = body;

    if (!user_id) {
      return json({ error: 'user_id is required' }, { status: 400 });
    }

    if (!isOrgRole(role)) {
      return json({ error: 'Invalid role' }, { status: 400 });
    }
    if (role === 'owner' && actorRole !== 'owner') {
      return json({ error: 'Only owners can assign owner role' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: existing, error: existingError } = await adminClient
      .from('organization_members')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('user_id', user_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) return json({ error: existingError.message }, { status: 500 });
    if (!existing) return json({ error: 'Member not found' }, { status: 404 });
    if (actorRole !== 'owner' && (existing.role === 'owner' || role === 'owner')) {
      return json({ error: 'Only owners can change owner membership' }, { status: 403 });
    }
    if (existing.role === 'owner' && role !== 'owner' && (await countActiveOwners(adminClient, orgId)) <= 1) {
      return json({ error: 'Cannot change the last owner role' }, { status: 400 });
    }

    const { data: member, error } = await adminClient
      .from('organization_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    const { error: auditError } = await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: actor.id,
      action: 'role_changed',
      target_id: user_id,
      metadata: { before_role: existing.role, after_role: role },
    });
    if (auditError) {
      await adminClient
        .from('organization_members')
        .update({ role: existing.role })
        .eq('org_id', orgId)
        .eq('user_id', user_id);
      return json({ error: auditError.message }, { status: 500 });
    }

    return json(member);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
