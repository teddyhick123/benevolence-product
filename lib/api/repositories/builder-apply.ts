import { createElevatedClient } from '@/lib/api/admin-client';
import type { UserAccessContext } from '@/lib/api/principals';
import {
  ARTIFACT_KEYS,
  buildFileManifest,
  buildUnifiedDiff,
  canonicalJson,
  manifestHash,
  readJsonArtifact,
  sha256Hex,
} from '@/lib/builder/artifacts';
import { applyProposalToGitHub, getDefaultBranchSha } from '@/lib/builder/github-apply';
import { evaluatePathPolicy, formatPathPolicyViolations } from '@/lib/builder/path-policy';
import {
  REVIEW_POLICY_VERSION,
  transitionProposal,
  type FindingRow,
  type ReviewAttemptRow,
  type RevisionRow,
  type VerificationRunRow,
} from '@/lib/builder/proposal-state';
import { evaluateAttemptGate } from '@/lib/builder/review-gate';

type OrgBuilderApplyScope = {
  orgId: string;
  actorId: UserAccessContext['user']['id'];
};

interface StoredFile {
  path: string;
  content: string;
  diff?: string;
}

export class BuilderApplyError extends Error {
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'BuilderApplyError';
    this.status = status;
    this.details = details;
  }
}

/** Elevated PR-delivery orchestration constrained to one authorized organization. */
export function createOrgBuilderApplyRepository(scope: OrgBuilderApplyScope) {
  const db = createElevatedClient();

  function requireArtifactPrefix(proposalId: string, revision: RevisionRow): string {
    const expected = `${scope.orgId}/${proposalId}/${revision.id}`;
    if (revision.artifact_prefix !== expected) {
      throw new BuilderApplyError('Revision artifacts do not match recorded hashes', 409);
    }
    return expected;
  }

  return {
    async applyProposal(proposalId: string) {
      const { data: proposal, error: proposalError } = await db
        .from('builder_proposals')
        .select('id, org_id, proposal_type, code_state, current_revision_id, plan_content')
        .eq('id', proposalId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (proposalError) throw proposalError;
      if (!proposal) throw new BuilderApplyError('Proposal not found', 404);

      if (proposal.proposal_type !== 'code') {
        throw new BuilderApplyError('Only code proposals can be applied to GitHub', 409);
      }
      if (proposal.code_state !== 'ready_to_apply') {
        throw new BuilderApplyError(
          `Proposal must be in ready_to_apply state, currently: ${proposal.code_state}`,
          409
        );
      }
      if (!proposal.current_revision_id) {
        throw new BuilderApplyError('Proposal has no current revision to apply', 409);
      }

      const { data: revisionRow, error: revisionError } = await db
        .from('builder_proposal_revisions')
        .select('*')
        .eq('id', proposal.current_revision_id)
        .eq('proposal_id', proposalId)
        .maybeSingle();
      if (revisionError) throw revisionError;
      const revision = revisionRow as RevisionRow | null;

      const { data: attemptRow, error: attemptError } = await db
        .from('builder_review_attempts')
        .select('*')
        .eq('revision_id', proposal.current_revision_id)
        .eq('proposal_id', proposalId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attemptError) throw attemptError;
      const attempt = attemptRow as ReviewAttemptRow | null;

      let findings: FindingRow[] = [];
      let verificationRuns: VerificationRunRow[] = [];
      if (attempt) {
        const { data: findingRows, error: findingsError } = await db
          .from('builder_review_findings')
          .select('*')
          .eq('review_attempt_id', attempt.id);
        if (findingsError) throw findingsError;
        findings = (findingRows ?? []) as FindingRow[];

        const { data: runRows, error: runsError } = await db
          .from('builder_verification_runs')
          .select('*')
          .eq('review_attempt_id', attempt.id);
        if (runsError) throw runsError;
        verificationRuns = (runRows ?? []) as VerificationRunRow[];
      }

      const gate = evaluateAttemptGate({
        proposal: {
          code_state: proposal.code_state,
          current_revision_id: proposal.current_revision_id,
        },
        revision,
        attempt,
        findings,
        verificationRuns,
        currentPolicyVersion: REVIEW_POLICY_VERSION,
      });
      if (!gate.pass) {
        throw new BuilderApplyError(
          gate.reason ?? 'Automated review has not passed for this proposal.',
          409,
          { blockers: gate.blockers }
        );
      }
      const frozenRevision = revision as RevisionRow;
      const artifactPrefix = requireArtifactPrefix(proposalId, frozenRevision);

      const stored = await readJsonArtifact<{ files: StoredFile[] }>(
        db,
        `${artifactPrefix}/${ARTIFACT_KEYS.files}`
      );
      const files = stored?.files ?? [];
      if (files.length === 0) {
        throw new BuilderApplyError('Revision artifacts do not match recorded hashes', 409);
      }

      const manifestInput = files.map(file => ({ path: file.path, content: file.content }));
      const recomputedManifestHash = manifestHash(buildFileManifest(manifestInput));
      const recomputedDiffHash = sha256Hex(buildUnifiedDiff(manifestInput));
      if (
        recomputedManifestHash !== frozenRevision.manifest_hash
        || recomputedDiffHash !== frozenRevision.diff_hash
      ) {
        throw new BuilderApplyError('Revision artifacts do not match recorded hashes', 409);
      }

      const policy = evaluatePathPolicy(files.map(file => file.path));
      if (!policy.allowed) {
        throw new BuilderApplyError(
          `Proposal touches protected paths. ${formatPathPolicyViolations(policy.violations)}`,
          422,
          { violations: policy.violations }
        );
      }

      if (frozenRevision.base_commit_sha) {
        const currentDefaultSha = await getDefaultBranchSha();
        if (currentDefaultSha !== frozenRevision.base_commit_sha) {
          throw new BuilderApplyError('Base branch has moved since review; re-run the review', 409);
        }
      } else {
        const capturedBaseSha = await getDefaultBranchSha();
        const { error: baseStampError } = await db
          .from('builder_proposal_revisions')
          .update({ base_commit_sha: capturedBaseSha })
          .eq('id', frozenRevision.id)
          .eq('proposal_id', proposalId);
        if (baseStampError) throw baseStampError;
      }

      const planContent = proposal.plan_content as { moduleName?: string } | null;
      const moduleName = planContent?.moduleName ?? 'Unknown Module';
      const { prUrl, prNumber, branchName, headSha } = await applyProposalToGitHub(
        proposalId,
        moduleName,
        files.map(file => ({ path: file.path, content: file.content })),
        {
          attemptNumber: attempt!.attempt_number,
          policyVersion: attempt!.policy_version,
        }
      );

      const { error: deliveryError } = await db.from('builder_delivery_records').upsert(
        {
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
        },
        { onConflict: 'provider,provider_event_id' }
      );
      if (deliveryError) throw deliveryError;

      const { error: headStampError } = await db
        .from('builder_proposal_revisions')
        .update({ head_commit_sha: headSha })
        .eq('id', frozenRevision.id)
        .eq('proposal_id', proposalId);
      if (headStampError) throw headStampError;

      const transition = await transitionProposal(db, {
        proposalId,
        orgId: scope.orgId,
        from: 'ready_to_apply',
        to: 'pr_opened',
        set: { reviewed_by: scope.actorId, reviewed_at: new Date().toISOString() },
      });
      if (!transition.ok) {
        throw new BuilderApplyError(
          'Proposal state changed before the PR could be recorded; the PR was opened.',
          409,
          { prUrl, prNumber, currentState: transition.currentState }
        );
      }

      const { error: eventError } = await db.from('builder_events').insert({
        org_id: scope.orgId,
        user_id: scope.actorId,
        event_type: 'proposal_applied',
        payload: { proposalId, prUrl, prNumber, branchName, moduleName },
      });
      if (eventError) {
        throw new BuilderApplyError(eventError.message, 500, { prUrl, prNumber });
      }

      return { prUrl, prNumber, branchName };
    },
  };
}
