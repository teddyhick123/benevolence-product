// app/api/org/[orgId]/invitations/[inviteId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; inviteId: string }>;
}

// DELETE /api/org/[orgId]/invitations/[inviteId] — cancel
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, inviteId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, email, status')
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .single();

    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invitations can be cancelled' }, { status: 409 });
    }

    const { error } = await adminClient
      .from('org_invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: user.id,
      action: 'invite_cancelled',
      metadata: { email: invite.email },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
