// app/api/org/[orgId]/builder/proposals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('builder_proposals')
      .select('id, request_text, requested_by, proposal_type, status, phase, generated_code, config_patch, plan_content, review_report, reviewer_notes, pr_url, created_at, reviewed_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, { status: 500 });

    const userIds = Array.from(new Set((data || []).map((proposal: any) => proposal.requested_by).filter(Boolean)));
    const { data: profiles, error: profileError } = userIds.length
      ? await adminSupabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [], error: null };
    if (profileError) return json({ error: profileError.message }, { status: 500 });

    const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    const proposals = (data || []).map((proposal: any) => ({
      ...proposal,
      requested_by_name: profilesById.get(proposal.requested_by)?.full_name || profilesById.get(proposal.requested_by)?.email || null,
    }));
    return json({ proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
