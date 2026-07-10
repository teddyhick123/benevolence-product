import { NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { canReviewImplementation } from '@/lib/org-capabilities';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...init?.headers, 'Cache-Control': 'no-store' } });
}

export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await canReviewImplementation(supabase as any, orgId))) {
      return json({ error: 'Implementation reviewer access required' }, { status: 403 });
    }

    const db = createAdminClient();
    const { data: proposal, error: fetchError } = await db
      .from('builder_proposals')
      .select('id, phase, pr_url')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!proposal) return json({ error: 'Proposal not found' }, { status: 404 });
    if (proposal.phase !== 'pr_opened' || !proposal.pr_url) {
      return json({ error: 'A proposal can be marked shipped only after its PR is opened' }, { status: 409 });
    }

    const { error: updateError } = await db
      .from('builder_proposals')
      .update({ phase: 'shipped', status: 'applied', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', proposalId)
      .eq('org_id', orgId);
    if (updateError) throw updateError;

    await db.from('builder_events').insert({
      org_id: orgId,
      user_id: user.id,
      event_type: 'proposal_applied',
      payload: { proposalId, status: 'shipped' },
    });
    return json({ success: true, phase: 'shipped' });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
