import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import {
  ARTIFACT_KEYS,
  readJsonArtifact,
  signArtifactUrl,
  type FileManifest,
} from '@/lib/builder/artifacts';
import type { CodeState } from '@/lib/builder/proposal-state';

type OrgBuilderReadScope = Pick<OrgAccessContext, 'orgId'>;

export class BuilderProposalNotFoundError extends Error {
  constructor() {
    super('Proposal not found');
    this.name = 'BuilderProposalNotFoundError';
  }
}

export class InvalidBuilderArtifactPathError extends Error {
  constructor() {
    super('Builder revision has an invalid artifact path');
    this.name = 'InvalidBuilderArtifactPathError';
  }
}

/** Elevated Builder reads constrained to one already-authorized organization. */
export function createOrgBuilderReadRepository(scope: OrgBuilderReadScope) {
  const db = createElevatedClient();

  function requireScopedArtifactKey(proposalId: string, key: unknown): string {
    const expectedPrefix = `${scope.orgId}/${proposalId}/`;
    if (typeof key !== 'string' || !key.startsWith(expectedPrefix)) {
      throw new InvalidBuilderArtifactPathError();
    }
    return key;
  }

  return {
    async listProposals() {
      const { data: proposalRows, error: proposalsError } = await db
        .from('builder_proposals')
        .select('id, org_id, request_text, requested_by, proposal_type, status, config_patch, reviewer_notes, code_state, rejected_reason, current_revision_id, created_at')
        .eq('org_id', scope.orgId)
        .order('created_at', { ascending: false });
      if (proposalsError) throw proposalsError;

      const proposals = proposalRows ?? [];
      const userIds = Array.from(new Set(proposals.map(p => p.requested_by).filter(Boolean)));
      const { data: profileRows, error: profilesError } = userIds.length
        ? await db.from('profiles').select('id, full_name, email').in('id', userIds)
        : {
            data: [] as Array<{ id: string; full_name: string | null; email: string | null }>,
            error: null,
          };
      if (profilesError) throw profilesError;
      const profilesById = new Map((profileRows ?? []).map(profile => [profile.id, profile]));

      const revisionIds = Array.from(
        new Set(proposals.map(p => p.current_revision_id).filter((id): id is string => !!id))
      );
      const { data: revisionRows, error: revisionsError } = revisionIds.length
        ? await db
            .from('builder_proposal_revisions')
            .select('id, revision_number, kind, base_commit_sha, file_count, total_bytes, created_at')
            .in('id', revisionIds)
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (revisionsError) throw revisionsError;
      const revisionsById = new Map(
        (revisionRows ?? []).map(revision => [revision.id as string, revision])
      );

      const { data: attemptRows, error: attemptsError } = revisionIds.length
        ? await db
            .from('builder_review_attempts')
            .select('id, revision_id, status, policy_version, required_check_keys, summary_score, started_at, completed_at')
            .in('revision_id', revisionIds)
            .order('started_at', { ascending: false })
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (attemptsError) throw attemptsError;

      const latestAttemptByRevision = new Map<string, Record<string, unknown>>();
      for (const attempt of attemptRows ?? []) {
        const revisionId = attempt.revision_id as string;
        if (!latestAttemptByRevision.has(revisionId)) {
          latestAttemptByRevision.set(revisionId, attempt);
        }
      }
      const latestAttemptIds = Array.from(latestAttemptByRevision.values())
        .map(attempt => attempt.id as string);

      const { data: findingRows, error: findingsError } = latestAttemptIds.length
        ? await db
            .from('builder_review_findings')
            .select('review_attempt_id, severity, state')
            .in('review_attempt_id', latestAttemptIds)
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (findingsError) throw findingsError;

      const { data: runRows, error: runsError } = latestAttemptIds.length
        ? await db
            .from('builder_verification_runs')
            .select('review_attempt_id, check_key, status')
            .in('review_attempt_id', latestAttemptIds)
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (runsError) throw runsError;

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

      const codeProposalIds = proposals
        .filter(proposal => proposal.proposal_type === 'code')
        .map(proposal => proposal.id);
      const { data: deliveryRows, error: deliveryError } = codeProposalIds.length
        ? await db
            .from('builder_delivery_records')
            .select('proposal_id, status, pr_url, pr_number, created_at')
            .in('proposal_id', codeProposalIds)
            .order('created_at', { ascending: false })
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (deliveryError) throw deliveryError;

      const latestDeliveryByProposal = new Map<string, Record<string, unknown>>();
      for (const delivery of deliveryRows ?? []) {
        const proposalId = delivery.proposal_id as string;
        if (!latestDeliveryByProposal.has(proposalId)) {
          latestDeliveryByProposal.set(proposalId, delivery);
        }
      }

      return proposals.map(proposal => {
        const profile = profilesById.get(proposal.requested_by as string);
        const base = {
          id: proposal.id,
          request_text: proposal.request_text,
          requested_by_name: profile?.full_name || profile?.email || null,
          proposal_type: proposal.proposal_type,
          created_at: proposal.created_at,
        };

        if (proposal.proposal_type === 'config') {
          return {
            ...base,
            config: {
              status: proposal.status,
              config_patch: proposal.config_patch,
              reviewer_notes: proposal.reviewer_notes,
            },
            code: null,
          };
        }

        const revision = proposal.current_revision_id
          ? revisionsById.get(proposal.current_revision_id as string) ?? null
          : null;
        const attempt = proposal.current_revision_id
          ? latestAttemptByRevision.get(proposal.current_revision_id as string) ?? null
          : null;

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

          const requiredKeys = (attempt.required_check_keys ?? []) as string[];
          const statusByKey = new Map(
            (runsByAttempt.get(attempt.id as string) ?? [])
              .map(run => [run.check_key, run.status])
          );
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

        const delivery = latestDeliveryByProposal.get(proposal.id as string);
        return {
          ...base,
          config: null,
          code: {
            code_state: proposal.code_state as CodeState,
            rejected_reason: proposal.rejected_reason,
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
              ? {
                  status: delivery.status,
                  pr_url: delivery.pr_url,
                  pr_number: delivery.pr_number,
                }
              : null,
          },
        };
      });
    },

    async getProposalDetails(proposalId: string) {
      const { data: proposal, error: proposalError } = await db
        .from('builder_proposals')
        .select('id, org_id, request_text, proposal_type, code_state, status, plan_content, rejected_reason, reviewer_notes, current_revision_id, created_at')
        .eq('id', proposalId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (proposalError) throw proposalError;
      if (!proposal) throw new BuilderProposalNotFoundError();

      const planContent = proposal.plan_content as
        | { moduleName?: string; files?: Array<{ path: string }> }
        | null;
      const planSummary = planContent
        ? {
            moduleName: planContent.moduleName ?? null,
            plannedPaths: (planContent.files ?? []).map(file => file.path),
          }
        : null;

      let revisionRow: Record<string, unknown> | null = null;
      if (proposal.current_revision_id) {
        const { data, error: revisionError } = await db
          .from('builder_proposal_revisions')
          .select('id, revision_number, kind, parent_revision_id, base_commit_sha, head_commit_sha, manifest_hash, diff_hash, authoritative_diff_hash, authoritative_diff_artifact_key, context_hash, artifact_prefix, progress, created_at')
          .eq('id', proposal.current_revision_id)
          .eq('proposal_id', proposalId)
          .maybeSingle();
        if (revisionError) throw revisionError;
        revisionRow = data ?? null;
      }

      let manifest: FileManifest | null = null;
      let artifacts = {
        diff_url: null as string | null,
        files_url: null as string | null,
        context_url: null as string | null,
      };
      if (revisionRow) {
        const prefix = requireScopedArtifactKey(proposalId, revisionRow.artifact_prefix);
        const [manifestArtifact, diffUrl, filesUrl, contextUrl] = await Promise.all([
          readJsonArtifact<FileManifest>(db, `${prefix}/${ARTIFACT_KEYS.manifest}`),
          signArtifactUrl(db, `${prefix}/${ARTIFACT_KEYS.authoritativeDiff}`, 3600),
          signArtifactUrl(db, `${prefix}/${ARTIFACT_KEYS.files}`, 3600),
          signArtifactUrl(db, `${prefix}/${ARTIFACT_KEYS.context}`, 3600),
        ]);
        manifest = manifestArtifact;
        artifacts = { diff_url: diffUrl, files_url: filesUrl, context_url: contextUrl };
      }

      const { data: attemptRows, error: attemptsError } = await db
        .from('builder_review_attempts')
        .select('id, revision_id, attempt_number, trigger, status, policy_version, required_check_keys, summary_score, started_at, completed_at, decision_reason')
        .eq('proposal_id', proposalId)
        .order('started_at', { ascending: false });
      if (attemptsError) throw attemptsError;

      const attemptList = attemptRows ?? [];
      const attemptIds = attemptList.map(attempt => attempt.id as string);
      const { data: findingRows, error: findingsError } = attemptIds.length
        ? await db.from('builder_review_findings').select('*').in('review_attempt_id', attemptIds)
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (findingsError) throw findingsError;

      const { data: runRows, error: runsError } = attemptIds.length
        ? await db
            .from('builder_verification_runs')
            .select('review_attempt_id, check_key, status, exit_code, duration_ms, log_artifact_key')
            .in('review_attempt_id', attemptIds)
        : { data: [] as Array<Record<string, unknown>>, error: null };
      if (runsError) throw runsError;

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

      const attempts = await Promise.all(attemptList.map(async attempt => {
        const verificationRuns = await Promise.all(
          (runsByAttempt.get(attempt.id as string) ?? []).map(async run => ({
            check_key: run.check_key,
            status: run.status,
            exit_code: run.exit_code,
            duration_ms: run.duration_ms,
            log_url: run.log_artifact_key
              ? await signArtifactUrl(
                  db,
                  requireScopedArtifactKey(proposalId, run.log_artifact_key),
                  3600
                )
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
      }));

      const { data: deliveryRows, error: deliveryError } = await db
        .from('builder_delivery_records')
        .select('id, proposal_id, revision_id, provider, pr_number, pr_url, branch_name, commit_sha, environment, status, created_at')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });
      if (deliveryError) throw deliveryError;

      return {
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
              authoritative_diff_hash: revisionRow.authoritative_diff_hash,
              context_hash: revisionRow.context_hash,
              progress: revisionRow.progress,
              created_at: revisionRow.created_at,
            }
          : null,
        attempts,
        delivery: deliveryRows ?? [],
        artifacts,
      };
    },
  };
}
