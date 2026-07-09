// app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { sendInviteEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; inviteId: string }>;
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

// POST /api/org/[orgId]/invitations/[inviteId]/resend
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, inviteId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, email, role, status, token, expires_at')
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!invite) return json({ error: 'Invitation not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return json({ error: 'Only pending invitations can be resent' }, { status: 409 });
    }

    // Regenerate token + reset expiry
    const newToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
    const { data: updated, error } = await adminClient
      .from('org_invitations')
      .update({
        token: newToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error || !updated) return json({ error: error?.message || 'Update failed' }, { status: 500 });

    const [{ data: org }, { data: inviterProfile }] = await Promise.all([
      adminClient.from('organizations').select('name').eq('id', orgId).single(),
      adminClient.from('profiles').select('full_name, email').eq('id', user.id).single(),
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { error: auditError } = await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: user.id,
      action: 'invite_resent',
      target_id: inviteId,
      metadata: { email: invite.email, role: invite.role },
    });
    if (auditError) {
      await adminClient
        .from('org_invitations')
        .update({ token: invite.token, expires_at: invite.expires_at })
        .eq('id', inviteId)
        .eq('org_id', orgId);
      return json({ error: auditError.message }, { status: 500 });
    }

    try {
      await sendInviteEmail({
        to: invite.email,
        orgName: org?.name || 'your organization',
        inviterName: inviterProfile?.full_name || inviterProfile?.email || 'A team member',
        role: invite.role,
        acceptUrl: `${baseUrl}/join?token=${newToken}`,
      });
    } catch (emailError: any) {
      await adminClient
        .from('org_invitations')
        .update({ token: invite.token, expires_at: invite.expires_at })
        .eq('id', inviteId)
        .eq('org_id', orgId);
      return json({ error: emailError.message }, { status: 500 });
    }

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
