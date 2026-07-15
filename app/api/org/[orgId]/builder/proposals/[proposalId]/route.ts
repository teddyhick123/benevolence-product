// app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts
//
// Detail endpoint for a single Builder proposal (Increment 2 durable data
// contract). Full evidence: the current revision's manifest, every review
// attempt across ALL revisions (newest first) with its nested findings and
// verification runs, delivery history, and signed artifact URLs for the
// current revision's diff/files/context artifacts.
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { readJsonArtifact, signArtifactUrl, ARTIFACT_KEYS, type FileManifest } from '@/lib/builder/artifacts';

export const dynamic = 'force-dynamic';

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

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    const admin = createAdminClient();

    const { data: proposal, error: proposalErr } = await admin
      .from('builder_proposals')
      .select('id, org_id, request_text, proposal_type, code_state, status, plan_content, rejected_reason, reviewer_notes, current_revision_id, created_at')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (proposalErr) return json({ error: proposalErr.message }, { status: 500 });
    if (!proposal) return json({ error: 'Proposal not found' }, { status: 404 });

    const planContent = proposal.plan_content as
      | { moduleName?: string; files?: Array<{ path: string }> }
      | null;
    const planSummary = planContent
      ? {
          moduleName: planContent.moduleName ?? null,
          plannedPaths: (planContent.files ?? []).map(f => f.path),
        }
      : null;

    // ── current revision + manifest ─────────────────────────────────────────────
    let revisionRow: Record<string, unknown> | null = null;
    if (proposal.current_revision_id) {
      const { data, error: revisionErr } = await admin
        .from('builder_proposal_revisions')
        .select('id, revision_number, kind, parent_revision_id, base_commit_sha, head_commit_sha, manifest_hash, diff_hash, context_hash, artifact_prefix, progress, created_at')
        .eq('id', proposal.current_revision_id)
        .maybeSingle();
      if (revisionErr) return json({ error: revisionErr.message }, { status: 500 });
      revisionRow = data ?? null;
    }

    let manifest: FileManifest | null = null;
    let artifacts = { diff_url: null as string | null, files_url: null as string | null, context_url: null as string | null };
    if (revisionRow) {
      const prefix = revisionRow.artifact_prefix as string;
      const [manifestArtifact, diffUrl, filesUrl, contextUrl] = await Promise.all([
        readJsonArtifact<FileManifest>(admin, `${prefix}/${ARTIFACT_KEYS.manifest}`),
        signArtifactUrl(admin, `${prefix}/${ARTIFACT_KEYS.diff}`, 3600),
        signArtifactUrl(admin, `${prefix}/${ARTIFACT_KEYS.files}`, 3600),
        signArtifactUrl(admin, `${prefix}/${ARTIFACT_KEYS.context}`, 3600),
      ]);
      manifest = manifestArtifact;
      artifacts = { diff_url: diffUrl, files_url: filesUrl, context_url: contextUrl };
    }

    // ── attempts across ALL revisions of this proposal, newest first ──────────
    const { data: attemptRows, error: attemptsErr } = await admin
      .from('builder_review_attempts')
      .select('id, revision_id, attempt_number, trigger, status, policy_version, required_check_keys, summary_score, started_at, completed_at, decision_reason')
      .eq('proposal_id', proposalId)
      .order('started_at', { ascending: false });
    if (attemptsErr) return json({ error: attemptsErr.message }, { status: 500 });

    const attemptList = attemptRows ?? [];
    const attemptIds = attemptList.map(a => a.id as string);

    const { data: findingRows, error: findingsErr } = attemptIds.length
      ? await admin
          .from('builder_review_findings')
          .select('*')
          .in('review_attempt_id', attemptIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (findingsErr) return json({ error: findingsErr.message }, { status: 500 });

    const { data: runRows, error: runsErr } = attemptIds.length
      ? await admin
          .from('builder_verification_runs')
          .select('review_attempt_id, check_key, status, exit_code, duration_ms, log_artifact_key')
          .in('review_attempt_id', attemptIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (runsErr) return json({ error: runsErr.message }, { status: 500 });

    const findingsByAttempt = new Map<string, Array<Record<string, unknown>>>();
    for (const finding of findingRows ?? []) {
      const attemptId = finding.review_attempt_id as string;
      const list = findingsByAttempt.get(attemptId) ?? [];
      list.push(finding);
      findingsByAttempt.set(attemptId, list);
    }

    const runsByAttempt = new Map<string, Array<Record<string, unknown>>>();
    for (const run of runRows ?? []) {
      const attemptId = run.review_attempt_id as string;
      const list = runsByAttempt.get(attemptId) ?? [];
      list.push(run);
      runsByAttempt.set(attemptId, list);
    }

    const attempts = await Promise.all(
      attemptList.map(async attempt => {
        const runs = runsByAttempt.get(attempt.id as string) ?? [];
        const verificationRuns = await Promise.all(
          runs.map(async run => ({
            check_key: run.check_key,
            status: run.status,
            exit_code: run.exit_code,
            duration_ms: run.duration_ms,
            log_url: run.log_artifact_key
              ? await signArtifactUrl(admin, run.log_artifact_key as string, 3600)
              : null,
          }))
        );

        return {
          id: attempt.id,
          attempt_number: attempt.attempt_number,
          trigger: attempt.trigger,
          status: attempt.status,
          policy_version: attempt.policy_version,
          required_check_keys: attempt.required_check_keys,
          summary_score: attempt.summary_score,
          started_at: attempt.started_at,
          completed_at: attempt.completed_at,
          decision_reason: attempt.decision_reason,
          findings: findingsByAttempt.get(attempt.id as string) ?? [],
          verification_runs: verificationRuns,
        };
      })
    );

    // ── delivery history (provider facts: pr_url/pr_number/status live here now,
    //    NOT on builder_proposals) ────────────────────────────────────────────────
    const { data: deliveryRows, error: deliveryErr } = await admin
      .from('builder_delivery_records')
      .select('id, proposal_id, revision_id, provider, pr_number, pr_url, branch_name, commit_sha, environment, status, created_at')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: false });
    if (deliveryErr) return json({ error: deliveryErr.message }, { status: 500 });

    return json({
      proposal: {
        id: proposal.id,
        request_text: proposal.request_text,
        proposal_type: proposal.proposal_type,
        code_state: proposal.code_state,
        status: proposal.status,
        plan_summary: planSummary,
        rejected_reason: proposal.rejected_reason,
        reviewer_notes: proposal.reviewer_notes,
        created_at: proposal.created_at,
      },
      revision: revisionRow
        ? {
            id: revisionRow.id,
            revision_number: revisionRow.revision_number,
            kind: revisionRow.kind,
            parent_revision_id: revisionRow.parent_revision_id,
            base_commit_sha: revisionRow.base_commit_sha,
            head_commit_sha: revisionRow.head_commit_sha,
            manifest,
            manifest_hash: revisionRow.manifest_hash,
            diff_hash: revisionRow.diff_hash,
            context_hash: revisionRow.context_hash,
            progress: revisionRow.progress,
            created_at: revisionRow.created_at,
          }
        : null,
      attempts,
      delivery: deliveryRows ?? [],
      artifacts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
