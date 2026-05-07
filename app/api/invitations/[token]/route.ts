// app/api/invitations/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// GET /api/invitations/[token] — validate token (public, no auth required)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, org_id, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (!invite) {
      return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 });
    }

    if (invite.status === 'accepted') {
      return NextResponse.json({ valid: false, reason: 'already_accepted' });
    }

    if (invite.status === 'cancelled') {
      return NextResponse.json({ valid: false, reason: 'cancelled' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await adminClient
        .from('org_invitations')
        .update({ status: 'expired' })
        .eq('id', invite.id);
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    if (invite.status === 'expired') {
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    const { data: org } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', invite.org_id)
      .single();

    return NextResponse.json({
      valid: true,
      invitation: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        orgName: org?.name || 'Unknown Organization',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
