import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext, UserAccessContext } from '@/lib/api/principals';
import { getDefaultBranchSha, isGitHubConfigured } from '@/lib/builder/github-apply';
import {
  claimCodeRun,
  failInFlightRun,
  IN_FLIGHT_STATES,
  transitionProposal,
  type CodeState,
} from '@/lib/builder/proposal-state';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';

type AppAdminBuilderScope = Pick<AppAdminAccessContext, 'isAppAdmin'> & {
  actorId: string;
};

type OrgBuilderScope = {
  orgId: string;
  actorId: UserAccessContext['user']['id'];
};

export type BuilderProposalReviewResult =
  | {
      ok: true;
      proposal: { id: string; org_id: string; status?: string; code_state?: CodeState };
    }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'code_action_not_allowed' }
  | { ok: false; reason: 'invalid_config_status' }
  | { ok: false; reason: 'missing_code_state' }
  | { ok: false; reason: 'transition_conflict'; currentState: CodeState | null };

export type BuilderBuildResult =
  | { ok: true; jobId: string; proposalId: string; revisionId: string }
  | { ok: true; proposalId: string; alreadyRunning: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'no_revision' }
  | { ok: false; reason: 'conflict'; currentState: CodeState | null };

/** Global Builder review operations available only after the app-admin guard succeeds. */
export function createAppAdminBuilderRepository(scope: AppAdminBuilderScope) {
  if (!scope.isAppAdmin) throw new Error('App admin access required');
  const db = createElevatedClient();

  return {
    async listProposals(status: string) {
      const { data, error } = await db
        .from('builder_proposals')
        .select('id, org_id, request_text, proposal_type, status, code_state, config_patch, reviewer_notes, created_at, reviewed_at, current_revision:builder_proposal_revisions!builder_proposals_current_revision_fkey(file_count), organizations(name)')
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async reviewProposal(input: {
      proposalId: string;
      status: string | undefined;
      reviewerNotes: string | undefined;
    }): Promise<BuilderProposalReviewResult> {
      const { data: proposal, error: loadError } = await db
        .from('builder_proposals')
        .select('id, org_id, proposal_type, code_state')
        .eq('id', input.proposalId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!proposal) return { ok: false, reason: 'not_found' };

      if (proposal.proposal_type === 'code') {
        if (input.status !== 'rejected') {
          return { ok: false, reason: 'code_action_not_allowed' };
        }

        const currentState = proposal.code_state as CodeState | null;
        if (!currentState) return { ok: false, reason: 'missing_code_state' };

        const result = await transitionProposal(db, {
          proposalId: input.proposalId,
          orgId: proposal.org_id,
          from: currentState,
          to: 'rejected',
          set: {
            rejected_reason: input.reviewerNotes || null,
            reviewer_notes: input.reviewerNotes || null,
            reviewed_by: scope.actorId,
            reviewed_at: new Date().toISOString(),
          },
        });

        if (!result.ok) {
          return {
            ok: false,
            reason: 'transition_conflict',
            currentState: result.currentState,
          };
        }

        return {
          ok: true,
          proposal: {
            id: input.proposalId,
            code_state: 'rejected',
            org_id: proposal.org_id,
          },
        };
      }

      if (!input.status || !['approved', 'rejected', 'applied'].includes(input.status)) {
        return { ok: false, reason: 'invalid_config_status' };
      }

      const { data, error } = await db
        .from('builder_proposals')
        .update({
          status: input.status,
          reviewer_notes: input.reviewerNotes || null,
          reviewed_by: scope.actorId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.proposalId)
        .select('id, status, org_id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, reason: 'not_found' };
      return { ok: true, proposal: data };
    },
  };
}

/** Elevated Builder operations constrained to one authorized organization. */
export function createOrgBuilderRepository(scope: OrgBuilderScope) {
  const db = createElevatedClient();

  return {
    async startBuild(proposalId: string): Promise<BuilderBuildResult> {
      const { data: proposal, error: fetchError } = await db
        .from('builder_proposals')
        .select('code_state')
        .eq('id', proposalId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!proposal) return { ok: false, reason: 'not_found' };

      if (IN_FLIGHT_STATES.includes((proposal.code_state ?? '') as CodeState)) {
        return { ok: true, proposalId, alreadyRunning: true };
      }

      const claim = await claimCodeRun(db, {
        proposalId,
        orgId: scope.orgId,
        actorId: scope.actorId,
      });
      if (!claim.ok) {
        if (claim.code === 'not_found') return { ok: false, reason: 'not_found' };
        if (claim.code === 'no_revision') return { ok: false, reason: 'no_revision' };
        return {
          ok: false,
          reason: 'conflict',
          currentState: (claim.currentState as CodeState | undefined) ?? null,
        };
      }

      const { revisionId } = claim;
      if (isGitHubConfigured()) {
        try {
          const baseSha = await getDefaultBranchSha();
          const { error: shaError } = await db
            .from('builder_proposal_revisions')
            .update({ base_commit_sha: baseSha })
            .eq('id', revisionId)
            .eq('proposal_id', proposalId);
          if (shaError) throw shaError;
        } catch (shaCaptureError) {
          console.error(
            `[builder/build] Could not capture base SHA for revision ${revisionId}:`,
            shaCaptureError
          );
        }
      }

      try {
        const jobId = await enqueueScaffoldBuildJob({
          proposalId,
          orgId: scope.orgId,
          revisionId,
        });
        return { ok: true, jobId, proposalId, revisionId };
      } catch (queueError) {
        await failInFlightRun(db, proposalId);
        throw queueError;
      }
    },
  };
}
