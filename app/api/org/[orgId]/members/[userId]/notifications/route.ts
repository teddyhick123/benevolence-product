// app/api/org/[orgId]/members/[userId]/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

const notificationPrefsSchema = z.object({
  digest: z.enum(['daily', 'weekly', 'never']).optional(),
  alerts: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const validation = notificationPrefsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.format() }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: current } = await adminClient
      .from('organization_members')
      .select('notification_prefs')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();

    const merged = { ...(current?.notification_prefs || {}), ...validation.data };

    const { error } = await adminClient
      .from('organization_members')
      .update({ notification_prefs: merged })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ notification_prefs: merged });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
