// app/api/org/[orgId]/builder/proposals/route.ts
//
// List endpoint for Builder proposals (Increment 2 durable data contract).
// Summary only: no source code, no finding evidence bodies, no raw model
// review output anywhere in the payload. Config proposals keep their legacy
// status shape; code proposals surface state machine + aggregate counts
// derived from 4 batched service-role queries (no per-proposal N+1s):
// proposals -> revisions (current_revision_id) -> attempts+findings (per
// revision) -> latest delivery (per proposal).
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { CodeState } from '@/lib/builder/proposal-state';

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    const admin = createAdminClient();

    // ── Query 1: proposals for this org ────────────────────────────────────────
    const { data: proposalRows, error: proposalsErr } = await admin
      .from('builder_proposals')
      .select('id, org_id, request_text, requested_by, proposal_type, status, config_patch, reviewer_notes, code_state, rejected_reason, current_revision_id, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (proposalsErr) return json({ error: proposalsErr.message }, { status: 500 });

    const proposals = proposalRows ?? [];

    // ── requester display names ────────────────────────────────────────────────
    const userIds = Array.from(new Set(proposals.map(p => p.requested_by).filter(Boolean)));
    const { data: profileRows, error: profilesErr } = userIds.length
      ? await admin.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }>, error: null };
    if (profilesErr) return json({ error: profilesErr.message }, { status: 500 });
    const profilesById = new Map((profileRows ?? []).map(p => [p.id, p]));

    // ── Query 2: current revisions for code proposals ─────────────────────────
    const revisionIds = Array.from(
      new Set(proposals.map(p => p.current_revision_id).filter((id): id is string => !!id))
    );
    const { data: revisionRows, error: revisionsErr } = revisionIds.length
      ? await admin
          .from('builder_proposal_revisions')
          .select('id, revision_number, kind, base_commit_sha, file_count, total_bytes, created_at')
          .in('id', revisionIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (revisionsErr) return json({ error: revisionsErr.message }, { status: 500 });
    const revisionsById = new Map((revisionRows ?? []).map((r: any) => [r.id, r]));

    // ── Query 3: latest attempt per revision + finding severity counts ────────
    const { data: attemptRows, error: attemptsErr } = revisionIds.length
      ? await admin
          .from('builder_review_attempts')
          .select('id, revision_id, status, policy_version, required_check_keys, summary_score, started_at, completed_at')
          .in('revision_id', revisionIds)
          .order('started_at', { ascending: false })
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (attemptsErr) return json({ error: attemptsErr.message }, { status: 500 });

    // Latest attempt per revision (rows already ordered newest-first).
    const latestAttemptByRevision = new Map<string, any>();
    for (const attempt of attemptRows ?? []) {
      if (!latestAttemptByRevision.has(attempt.revision_id as string)) {
        latestAttemptByRevision.set(attempt.revision_id as string, attempt);
      }
    }
    const latestAttemptIds = Array.from(latestAttemptByRevision.values()).map(a => a.id as string);

    const { data: findingRows, error: findingsErr } = latestAttemptIds.length
      ? await admin
          .from('builder_review_findings')
          .select('review_attempt_id, severity, state')
          .in('review_attempt_id', latestAttemptIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (findingsErr) return json({ error: findingsErr.message }, { status: 500 });

    const { data: runRows, error: runsErr } = latestAttemptIds.length
      ? await admin
          .from('builder_verification_runs')
          .select('review_attempt_id, check_key, status')
          .in('review_attempt_id', latestAttemptIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (runsErr) return json({ error: runsErr.message }, { status: 500 });

    const blockerCounts = new Map<string, number>();
    const warningCounts = new Map<string, number>();
    for (const finding of findingRows ?? []) {
      if (finding.state !== 'open') continue;
      const attemptId = finding.review_attempt_id as string;
      if (finding.severity === 'blocker' || finding.severity === 'error') {
        blockerCounts.set(attemptId, (blockerCounts.get(attemptId) ?? 0) + 1);
      } else if (finding.severity === 'warning') {
        warningCounts.set(attemptId, (warningCounts.get(attemptId) ?? 0) + 1);
      }
    }

    const runsByAttempt = new Map<string, Array<{ check_key: string; status: string }>>();
    for (const run of runRows ?? []) {
      const attemptId = run.review_attempt_id as string;
      const list = runsByAttempt.get(attemptId) ?? [];
      list.push({ check_key: run.check_key as string, status: run.status as string });
      runsByAttempt.set(attemptId, list);
    }

    // ── Query 4: latest delivery record per proposal ───────────────────────────
    const codeProposalIds = proposals.filter(p => p.proposal_type === 'code').map(p => p.id);
    const { data: deliveryRows, error: deliveryErr } = codeProposalIds.length
      ? await admin
          .from('builder_delivery_records')
          .select('proposal_id, status, pr_url, pr_number, created_at')
          .in('proposal_id', codeProposalIds)
          .order('created_at', { ascending: false })
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (deliveryErr) return json({ error: deliveryErr.message }, { status: 500 });

    const latestDeliveryByProposal = new Map<string, any>();
    for (const delivery of deliveryRows ?? []) {
      if (!latestDeliveryByProposal.has(delivery.proposal_id as string)) {
        latestDeliveryByProposal.set(delivery.proposal_id as string, delivery);
      }
    }

    // ── Assemble ────────────────────────────────────────────────────────────────
    const result = proposals.map(p => {
      const requestedByName = profilesById.get(p.requested_by as string)?.full_name
        || profilesById.get(p.requested_by as string)?.email
        || null;

      const base = {
        id: p.id,
        request_text: p.request_text,
        requested_by_name: requestedByName,
        proposal_type: p.proposal_type,
        created_at: p.created_at,
      };

      if (p.proposal_type === 'config') {
        return {
          ...base,
          config: {
            status: p.status,
            config_patch: p.config_patch,
            reviewer_notes: p.reviewer_notes,
          },
          code: null,
        };
      }

      const revision = p.current_revision_id ? revisionsById.get(p.current_revision_id as string) ?? null : null;
      const attempt = p.current_revision_id ? latestAttemptByRevision.get(p.current_revision_id as string) ?? null : null;

      let latestAttempt: Record<string, unknown> | null = null;
      let checks = { required: 0, passed: 0, failed: 0, pending: 0 };
      if (attempt) {
        latestAttempt = {
          status: attempt.status,
          policy_version: attempt.policy_version,
          blocker_count: blockerCounts.get(attempt.id as string) ?? 0,
          warning_count: warningCounts.get(attempt.id as string) ?? 0,
          summary_score: attempt.summary_score,
          completed_at: attempt.completed_at,
        };

        const requiredKeys: string[] = attempt.required_check_keys ?? [];
        const runsForAttempt = runsByAttempt.get(attempt.id as string) ?? [];
        const statusByKey = new Map(runsForAttempt.map(r => [r.check_key, r.status]));
        let passed = 0;
        let failed = 0;
        let pending = 0;
        for (const key of requiredKeys) {
          const status = statusByKey.get(key);
          if (status === 'passed') passed++;
          else if (status === 'failed' || status === 'error') failed++;
          else pending++;
        }
        checks = { required: requiredKeys.length, passed, failed, pending };
      }

      const delivery = latestDeliveryByProposal.get(p.id as string);

      return {
        ...base,
        config: null,
        code: {
          code_state: p.code_state as CodeState,
          rejected_reason: p.rejected_reason,
          revision: revision
            ? {
                id: revision.id,
                revision_number: revision.revision_number,
                kind: revision.kind,
                base_commit_sha: revision.base_commit_sha,
                file_count: revision.file_count,
                total_bytes: revision.total_bytes,
                created_at: revision.created_at,
              }
            : null,
          latest_attempt: latestAttempt,
          checks,
          delivery: delivery
            ? { status: delivery.status, pr_url: delivery.pr_url, pr_number: delivery.pr_number }
            : null,
        },
      };
    });

    return json({ proposals: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
