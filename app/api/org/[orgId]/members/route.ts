import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/members — list members with profile info
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('organization_members')
      .select('id, org_id, user_id, role, created_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const userIds = Array.from(new Set((data || []).map((member: any) => member.user_id).filter(Boolean)));
    const { data: profiles, error: profilesError } = userIds.length > 0
      ? await adminClient
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds)
      : { data: [], error: null };

    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

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

    return NextResponse.json({ members, currentRole: role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/members — add member (admin only)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const { email, user_id, role } = body;

    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    let targetUserId = user_id;
    if (email && !user_id) {
      const adminClientForLookup = createAdminClient();
      const { data: users, error: lookupError } = await adminClientForLookup.auth.admin.listUsers();

      if (lookupError) {
        return NextResponse.json({ error: 'Failed to lookup user' }, { status: 500 });
      }

      const foundUser = users.users.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!foundUser) {
        return NextResponse.json({ error: 'No user found with that email address' }, { status: 404 });
      }

      targetUserId = foundUser.id;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Either email or user_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: member, error } = await adminClient
      .from('organization_members')
      .insert({ org_id: orgId, user_id: targetUserId, role })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(member, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/members — update member role (admin only)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const { user_id, role } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { data: member, error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(member);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
