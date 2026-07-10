import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { WORKSPACE_MANAGER_ROLES, isWorkspaceManager } from '@/lib/roles';

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

async function getActor(orgId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null, isAppAdmin: false };

  const [{ data: role }, { data: isAppAdmin }] = await Promise.all([
    supabase.rpc('user_org_role', { p_org_id: orgId }),
    supabase.rpc('is_app_admin'),
  ]);

  return {
    supabase,
    user,
    role: role as string | null,
    isAppAdmin: isAppAdmin === true,
  };
}

async function loadEligibleReviewers(adminClient: ReturnType<typeof createAdminClient>, orgId: string) {
  const [membersRes, capsRes] = await Promise.all([
    adminClient
      .from('organization_members')
      .select('id, user_id, role, created_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('role', WORKSPACE_MANAGER_ROLES)
      .order('created_at', { ascending: true }),
    adminClient
      .from('organization_member_capabilities')
      .select('user_id, capability, created_at')
      .eq('org_id', orgId)
      .eq('capability', 'implementation_reviewer'),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (capsRes.error) throw capsRes.error;

  const members = membersRes.data || [];
  const reviewerIds = new Set((capsRes.data || []).map((row: any) => row.user_id));
  const userIds = members.map((member: any) => member.user_id).filter(Boolean);

  const profilesRes = userIds.length > 0
    ? await adminClient
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .in('id', userIds)
    : { data: [], error: null };
  if (profilesRes.error) throw profilesRes.error;

  const profilesById = new Map((profilesRes.data || []).map((profile: any) => [profile.id, profile]));

  return members.map((member: any) => ({
    membership_id: member.id,
    user_id: member.user_id,
    role: member.role,
    created_at: member.created_at,
    email: profilesById.get(member.user_id)?.email || null,
    full_name: profilesById.get(member.user_id)?.full_name || null,
    avatar_url: profilesById.get(member.user_id)?.avatar_url || null,
    implementation_reviewer: reviewerIds.has(member.user_id),
  }));
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const actor = await getActor(orgId);
    if (!actor.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!actor.role && !actor.isAppAdmin) return json({ error: 'Forbidden' }, { status: 403 });
    if (!isWorkspaceManager(actor.role) && !actor.isAppAdmin) {
      return json({ error: 'Only organization admins can view implementation reviewer access' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const reviewers = await loadEligibleReviewers(adminClient, orgId);

    return json({
      reviewers,
      canManage: actor.role === 'owner' || actor.isAppAdmin,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const actor = await getActor(orgId);
    if (!actor.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (actor.role !== 'owner' && !actor.isAppAdmin) {
      return json({ error: 'Only organization owners can grant implementation reviewer access' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    if (!userId) return json({ error: 'user_id is required' }, { status: 400 });

    const adminClient = createAdminClient();
    const { data: membership, error: memberError } = await adminClient
      .from('organization_members')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (memberError) return json({ error: memberError.message }, { status: 500 });
    if (!membership) return json({ error: 'Member not found' }, { status: 404 });
    if (!isWorkspaceManager(membership.role)) {
      return json({ error: 'Implementation reviewer can only be granted to admins or owners' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('organization_member_capabilities')
      .upsert({
        org_id: orgId,
        user_id: userId,
        capability: 'implementation_reviewer',
        granted_by: actor.user.id,
      }, { onConflict: 'org_id,user_id,capability' });
    if (error) return json({ error: error.message }, { status: 500 });

    const reviewers = await loadEligibleReviewers(adminClient, orgId);
    return json({ reviewers, canManage: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const actor = await getActor(orgId);
    if (!actor.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (actor.role !== 'owner' && !actor.isAppAdmin) {
      return json({ error: 'Only organization owners can revoke implementation reviewer access' }, { status: 403 });
    }

    const userId = req.nextUrl.searchParams.get('user_id');
    if (!userId) return json({ error: 'user_id is required' }, { status: 400 });

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('organization_member_capabilities')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('capability', 'implementation_reviewer');
    if (error) return json({ error: error.message }, { status: 500 });

    const reviewers = await loadEligibleReviewers(adminClient, orgId);
    return json({ reviewers, canManage: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
