// app/api/admin/builder/proposals/[proposalId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { transitionProposal, type CodeState } from '@/lib/builder/proposal-state';

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

    const adminSupabase = createAdminClient();

    // Load the proposal so we can branch on config vs code. Config proposals
    // keep the legacy status column; code proposals are driven by code_state
    // and may only be REJECTED here (approve/apply happen via the org-scoped
    // apply route, gated on canonical records — never a manual status write).
    const { data: proposal, error: loadErr } = await adminSupabase
      .from('builder_proposals')
      .select('id, org_id, proposal_type, code_state')
      .eq('id', proposalId)
      .maybeSingle();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

    if (proposal.proposal_type === 'code') {
      if (status !== 'rejected') {
        return NextResponse.json(
          { error: 'Code proposals may only be rejected here; approval and apply happen via the org-scoped apply route.' },
          { status: 400 }
        );
      }

      const currentState = proposal.code_state as CodeState | null;
      if (!currentState) {
        return NextResponse.json({ error: 'Proposal has no code state to transition' }, { status: 409 });
      }

      const result = await transitionProposal(adminSupabase, {
        proposalId,
        orgId: proposal.org_id,
        from: currentState,
        to: 'rejected',
        set: {
          rejected_reason: reviewer_notes || null,
          reviewer_notes: reviewer_notes || null,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        },
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: `Cannot reject a proposal in state: ${result.currentState}`, currentState: result.currentState },
          { status: 409 }
        );
      }

      return NextResponse.json({ proposal: { id: proposalId, code_state: 'rejected', org_id: proposal.org_id } });
    }

    // ── Config proposal: legacy status workflow ────────────────────────────────
    const validStatuses = ['approved', 'rejected', 'applied'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

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
