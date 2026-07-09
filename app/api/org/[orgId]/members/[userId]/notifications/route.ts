// app/api/org/[orgId]/members/[userId]/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

const notificationPrefsSchema = z.object({
  digest: z.enum(['daily', 'weekly', 'never']).optional(),
  channels: z.object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
  }).optional(),
  alerts: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not a member of this organization' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const validation = notificationPrefsSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Validation failed', details: validation.error.format() }, { status: 400 });
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

    if (error) return json({ error: error.message }, { status: 500 });

    return json({ notification_prefs: merged });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
