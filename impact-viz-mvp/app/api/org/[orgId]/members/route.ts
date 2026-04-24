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
      .select(`
        id, org_id, user_id, role, created_at,
        profiles!user_id ( email, full_name, avatar_url )
      `)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const members = (data || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      email: m.profiles?.email || null,
      full_name: m.profiles?.full_name || null,
      avatar_url: m.profiles?.avatar_url || null,
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
    const { user_id, role } = body;

    if (!user_id || !role) {
      return NextResponse.json({ error: 'user_id and role are required' }, { status: 400 });
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: member, error } = await adminClient
      .from('organization_members')
      .insert({ org_id: orgId, user_id, role })
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
