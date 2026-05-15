// app/api/integrations/quickbooks/sync-log/route.ts
// GET /api/integrations/quickbooks/sync-log?org_id=<uuid>&limit=10
// Returns the most recent sync log entries for the org (admin only).

import { createServerClient } from '@/lib/supabase';

export async function GET(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100) : 10;

  if (!orgId) {
    return Response.json({ error: 'org_id is required' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role as string)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { data: log, error } = await supabase
    .from('qb_sync_log')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[QB] sync-log fetch error:', error);
    return Response.json({ error: 'Failed to fetch sync log' }, { status: 500 });
  }

  return Response.json({ log: log ?? [] });
}
