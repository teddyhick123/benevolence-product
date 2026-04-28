// app/api/invitations/[token]/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// POST /api/invitations/[token]/accept — accept invitation (auth required)
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, org_id, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: `Invitation is ${invite.status}` }, { status: 409 });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await adminClient.from('org_invitations').update({ status: 'expired' }).eq('id', invite.id);
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
    }

    // Check if already a member
    const { data: existingMember } = await adminClient
      .from('organization_members')
      .select('id')
      .eq('org_id', invite.org_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingMember) {
      await adminClient
        .from('org_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id);
      return NextResponse.json({ success: true, orgId: invite.org_id });
    }

    // Add to org
    const { error: memberError } = await adminClient
      .from('organization_members')
      .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role, invited_by: user.id });

    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

    await adminClient
      .from('org_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    await adminClient.from('org_audit_log').insert({
      org_id: invite.org_id,
      actor_id: user.id,
      action: 'invite_accepted',
      metadata: { role: invite.role, email: invite.email },
    });

    return NextResponse.json({ success: true, orgId: invite.org_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
