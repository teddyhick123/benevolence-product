import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { applyProposalToGitHub, isGitHubConfigured } from '@/lib/builder/github-apply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
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

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    if (!isGitHubConfigured()) {
      return json(
        { error: 'GitHub integration not configured' },
        { status: 503 }
      );
    }

    const adminSupabase = createAdminClient();

    const { data: proposal, error: fetchErr } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, plan_content, generated_code, review_report')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .single();

    if (fetchErr || !proposal) {
      return json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.phase !== 'ready_to_apply') {
      return json(
        { error: `Proposal must be in ready_to_apply phase, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    const planContent = proposal.plan_content as { moduleName?: string } | null;
    const generatedCode = proposal.generated_code as { files?: Array<{ path: string; content: string }> } | null;
    const reviewReport = proposal.review_report as { score?: number } | null;

    const files = generatedCode?.files ?? [];
    const reviewScore = reviewReport?.score ?? 0;
    const moduleName = planContent?.moduleName ?? 'Unknown Module';

    if (files.length === 0) {
      return json({ error: 'No generated files to apply' }, { status: 400 });
    }

    const { prUrl, branchName } = await applyProposalToGitHub(
      proposalId,
      moduleName,
      files,
      reviewScore,
    );

    const { error: updateErr } = await adminSupabase
      .from('builder_proposals')
      .update({
        phase: 'applied',
        status: 'applied',
        pr_url: prUrl,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .eq('org_id', orgId);
    if (updateErr) throw updateErr;

    const { error: eventErr } = await adminSupabase.from('builder_events').insert({
      org_id: orgId,
      user_id: user.id,
      event_type: 'proposal_applied',
      payload: { proposalId, prUrl, branchName, moduleName },
    });
    if (eventErr) {
      return json(
        {
          error: eventErr.message,
          prUrl,
        },
        { status: 500 }
      );
    }

    return json({ prUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
