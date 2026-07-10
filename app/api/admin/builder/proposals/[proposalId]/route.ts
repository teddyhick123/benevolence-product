// app/api/admin/builder/proposals/[proposalId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ proposalId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { proposalId } = await params;
    const userId = await requireAdmin();
    if (!userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { status, reviewer_notes } = body as { status?: string; reviewer_notes?: string };

    const validStatuses = ['approved', 'rejected', 'applied'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('builder_proposals')
      .update({
        status,
        reviewer_notes: reviewer_notes || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .select('id, status, org_id')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

    return NextResponse.json({ proposal: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
