// app/api/org/[orgId]/invitations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { createInvitationSchema } from '@/lib/schemas/invitations';
import { sendInviteEmail } from '@/lib/email/resend';
import { isWorkspaceManager } from '@/lib/roles';

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

// GET /api/org/[orgId]/invitations — list pending invitations
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!isWorkspaceManager(role)) return json({ error: 'Not authorized' }, { status: 403 });

    const { data, error } = await supabase
      .from('org_invitations')
      .select('id, email, role, status, created_at, expires_at, invited_by')
      .eq('org_id', orgId)
      .in('status', ['pending'])
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ invitations: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/invitations — create + send invitation
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: actorRole } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!isWorkspaceManager(actorRole)) return json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const validation = createInvitationSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Validation failed', details: validation.error.format() }, { status: 400 });
    }

    const { email, role, message } = validation.data;
    if (role === 'owner' && actorRole !== 'owner') {
      return json({ error: 'Only owners can invite another owner' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Check by email via profiles join
    const { data: profileMatch } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileMatch) {
      const { data: memberMatch } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', profileMatch.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (memberMatch) {
        return json({ error: 'This person is already a member of your organization.' }, { status: 409 });
      }
    }

    // Check for existing pending invite to same email
    const { data: existingInvite } = await adminClient
      .from('org_invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('org_id', orgId)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      return json({ invitation: existingInvite, warning: 'A pending invitation already exists for this email.' });
    }

    // Create invitation
    const { data: invitation, error: insertError } = await adminClient
      .from('org_invitations')
      .insert({ org_id: orgId, email, role, invited_by: user.id })
      .select()
      .single();

    if (insertError || !invitation) {
      return json({ error: insertError?.message || 'Failed to create invitation' }, { status: 500 });
    }

    // Fetch org name + inviter name for email
    const [{ data: org }, { data: inviterProfile }] = await Promise.all([
      adminClient.from('organizations').select('name').eq('id', orgId).single(),
      adminClient.from('profiles').select('full_name, email').eq('id', user.id).single(),
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/join?token=${invitation.token}`;

    const { error: auditError } = await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: user.id,
      action: 'invite_sent',
      target_id: null,
      metadata: { email, role },
    });
    if (auditError) {
      await adminClient
        .from('org_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitation.id)
        .eq('org_id', orgId);
      return json({ error: auditError.message }, { status: 500 });
    }

    try {
      await sendInviteEmail({
      to: email,
      orgName: org?.name || 'your organization',
      inviterName: inviterProfile?.full_name || inviterProfile?.email || 'A team member',
      role,
      message,
      acceptUrl,
      });
    } catch (emailError: any) {
      await adminClient
        .from('org_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitation.id)
        .eq('org_id', orgId);
      return json({ error: emailError.message }, { status: 500 });
    }

    return json({ invitation }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
