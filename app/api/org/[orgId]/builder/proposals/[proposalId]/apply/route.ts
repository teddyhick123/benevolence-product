import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { applyProposalToGitHub, isGitHubConfigured, getDefaultBranchSha } from '@/lib/builder/github-apply';
import { canReviewImplementation } from '@/lib/org-capabilities';
import { evaluatePathPolicy, formatPathPolicyViolations } from '@/lib/builder/path-policy';
import { evaluateAttemptGate } from '@/lib/builder/review-gate';
import {
  transitionProposal,
  REVIEW_POLICY_VERSION,
  type RevisionRow,
  type ReviewAttemptRow,
  type FindingRow,
  type VerificationRunRow,
} from '@/lib/builder/proposal-state';
import {
  buildFileManifest,
  manifestHash,
  buildUnifiedDiff,
  sha256Hex,
  canonicalJson,
  readJsonArtifact,
  ARTIFACT_KEYS,
} from '@/lib/builder/artifacts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

interface StoredFile {
  path: string;
  content: string;
  diff?: string;
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

    // ── Step 1: auth → reviewer capability → GitHub configured ────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const canReview = await canReviewImplementation(supabase as any, orgId);
    if (!canReview) {
      return json({ error: 'Implementation reviewer access required' }, { status: 403 });
    }

    if (!isGitHubConfigured()) {
      return json({ error: 'GitHub integration not configured' }, { status: 503 });
    }

    const admin = createAdminClient();

    // ── Step 2: proposal must be a code proposal in ready_to_apply with a
    //            current revision ──────────────────────────────────────────────
    const { data: proposal, error: proposalErr } = await admin
      .from('builder_proposals')
      .select('id, org_id, proposal_type, code_state, current_revision_id, plan_content')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (proposalErr) throw proposalErr;
    if (!proposal) return json({ error: 'Proposal not found' }, { status: 404 });

    if (proposal.proposal_type !== 'code') {
      return json({ error: 'Only code proposals can be applied to GitHub' }, { status: 409 });
    }
    if (proposal.code_state !== 'ready_to_apply') {
      return json(
        { error: `Proposal must be in ready_to_apply state, currently: ${proposal.code_state}` },
        { status: 409 }
      );
    }
    if (!proposal.current_revision_id) {
      return json({ error: 'Proposal has no current revision to apply' }, { status: 409 });
    }

    // ── Step 3: load revision + latest attempt + findings + runs → gate ───────
    const { data: revisionRow, error: revisionErr } = await admin
      .from('builder_proposal_revisions')
      .select('*')
      .eq('id', proposal.current_revision_id)
      .maybeSingle();
    if (revisionErr) throw revisionErr;
    const revision = revisionRow as RevisionRow | null;

    const { data: attemptRow, error: attemptErr } = await admin
      .from('builder_review_attempts')
      .select('*')
      .eq('revision_id', proposal.current_revision_id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    const attempt = attemptRow as ReviewAttemptRow | null;

    let findings: FindingRow[] = [];
    let verificationRuns: VerificationRunRow[] = [];
    if (attempt) {
      const { data: findingRows, error: findingsErr } = await admin
        .from('builder_review_findings')
        .select('*')
        .eq('review_attempt_id', attempt.id);
      if (findingsErr) throw findingsErr;
      findings = (findingRows ?? []) as FindingRow[];

      const { data: runRows, error: runsErr } = await admin
        .from('builder_verification_runs')
        .select('*')
        .eq('review_attempt_id', attempt.id);
      if (runsErr) throw runsErr;
      verificationRuns = (runRows ?? []) as VerificationRunRow[];
    }

    const gate = evaluateAttemptGate({
      proposal: { code_state: proposal.code_state, current_revision_id: proposal.current_revision_id },
      revision,
      attempt,
      findings,
      verificationRuns,
      currentPolicyVersion: REVIEW_POLICY_VERSION,
    });
    if (!gate.pass) {
      return json(
        {
          error: gate.reason ?? 'Automated review has not passed for this proposal.',
          blockers: gate.blockers,
        },
        { status: 409 }
      );
    }
    // Gate pass guarantees a non-null revision with hashes.
    const frozenRevision = revision as RevisionRow;

    // ── Step 4: tamper guard — recompute manifest/diff hashes from files.json ──
    const stored = await readJsonArtifact<{ files: StoredFile[] }>(
      admin,
      `${frozenRevision.artifact_prefix}/${ARTIFACT_KEYS.files}`
    );
    const files: StoredFile[] = stored?.files ?? [];
    if (files.length === 0) {
      return json({ error: 'Revision artifacts do not match recorded hashes' }, { status: 409 });
    }

    const manifestInput = files.map(f => ({ path: f.path, content: f.content }));
    const recomputedManifestHash = manifestHash(buildFileManifest(manifestInput));
    const recomputedDiffHash = sha256Hex(buildUnifiedDiff(manifestInput));
    if (
      recomputedManifestHash !== frozenRevision.manifest_hash ||
      recomputedDiffHash !== frozenRevision.diff_hash
    ) {
      return json({ error: 'Revision artifacts do not match recorded hashes' }, { status: 409 });
    }

    // ── Step 5: path policy re-check ──────────────────────────────────────────
    const policy = evaluatePathPolicy(files.map(f => f.path));
    if (!policy.allowed) {
      return json(
        {
          error: `Proposal touches protected paths. ${formatPathPolicyViolations(policy.violations)}`,
          violations: policy.violations,
        },
        { status: 422 }
      );
    }

    // ── Step 6: base-branch staleness ─────────────────────────────────────────
    if (frozenRevision.base_commit_sha) {
      const currentDefaultSha = await getDefaultBranchSha();
      if (currentDefaultSha !== frozenRevision.base_commit_sha) {
        // State stays ready_to_apply — the reviewer re-queues a rebase/review.
        return json(
          { error: 'Base branch has moved since review; re-run the review' },
          { status: 409 }
        );
      }
    } else {
      // Capture the base now and stamp it before proceeding (decision 5).
      const capturedBaseSha = await getDefaultBranchSha();
      const { error: baseStampErr } = await admin
        .from('builder_proposal_revisions')
        .update({ base_commit_sha: capturedBaseSha })
        .eq('id', frozenRevision.id);
      if (baseStampErr) throw baseStampErr;
    }

    // ── Step 7: open the PR + record delivery facts ───────────────────────────
    const planContent = proposal.plan_content as { moduleName?: string } | null;
    const moduleName = planContent?.moduleName ?? 'Unknown Module';

    const { prUrl, prNumber, branchName, headSha } = await applyProposalToGitHub(
      proposalId,
      moduleName,
      files.map(f => ({ path: f.path, content: f.content })),
      { attemptNumber: attempt!.attempt_number, policyVersion: attempt!.policy_version },
    );

    const { error: deliveryErr } = await admin.from('builder_delivery_records').insert({
      proposal_id: proposalId,
      revision_id: frozenRevision.id,
      provider: 'github',
      status: 'pr_open',
      pr_number: prNumber,
      pr_url: prUrl,
      branch_name: branchName,
      commit_sha: headSha,
      provider_event_id: `pr:${prNumber}`,
      payload_hash: sha256Hex(canonicalJson({ prNumber, headSha })),
    });
    if (deliveryErr) throw deliveryErr;

    // Stamp head_commit_sha on the revision (NULL -> value, allowed exactly once).
    const { error: headStampErr } = await admin
      .from('builder_proposal_revisions')
      .update({ head_commit_sha: headSha })
      .eq('id', frozenRevision.id);
    if (headStampErr) throw headStampErr;

    // Transition ready_to_apply -> pr_opened. NO status/pr_url column writes.
    const transition = await transitionProposal(admin, {
      proposalId,
      orgId,
      from: 'ready_to_apply',
      to: 'pr_opened',
      set: { reviewed_by: user.id, reviewed_at: new Date().toISOString() },
    });
    if (!transition.ok) {
      return json(
        {
          error: 'Proposal state changed before the PR could be recorded; the PR was opened.',
          prUrl,
          prNumber,
          currentState: transition.currentState,
        },
        { status: 409 }
      );
    }

    // ── Step 8: audit event ───────────────────────────────────────────────────
    const { error: eventErr } = await admin.from('builder_events').insert({
      org_id: orgId,
      user_id: user.id,
      event_type: 'proposal_applied',
      payload: { proposalId, prUrl, prNumber, branchName, moduleName },
    });
    if (eventErr) {
      return json({ error: eventErr.message, prUrl, prNumber }, { status: 500 });
    }

    return json({ prUrl, prNumber, branchName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
