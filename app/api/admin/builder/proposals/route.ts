// app/api/admin/builder/proposals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAdmin();
    if (!userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected', 'applied'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('builder_proposals')
      .select('id, org_id, request_text, proposal_type, status, code_state, config_patch, reviewer_notes, created_at, reviewed_at, current_revision:builder_proposal_revisions!builder_proposals_current_revision_fkey(file_count), organizations(name)')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const proposals = (data || []).map(({ organizations, current_revision, ...p }) => {
      const revision = Array.isArray(current_revision) ? current_revision[0] : current_revision;
      return {
        ...p,
        file_count: (revision as { file_count?: number } | null)?.file_count ?? null,
        org_name: (Array.isArray(organizations) ? organizations[0]?.name : (organizations as { name: string } | null)?.name) ?? null,
      };
    });
    return NextResponse.json({ proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
