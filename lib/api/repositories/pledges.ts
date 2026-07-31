import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import {
  cancelGeneratedTasks,
  completeGeneratedTasks,
} from '@/lib/tasks/automation/task-writer';

type PledgeRepositoryScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

/** Elevated pledge operations constrained to one already-authorized org. */
export function createPledgeRepository(scope: PledgeRepositoryScope) {
  const db = createElevatedClient();

  return {
    async cancelPledge(input: {
      pledgeId: string;
      cancellationReason?: string | null;
      waivePending: boolean;
    }) {
      return db.rpc('cancel_pledge_with_obligations', {
        p_org_id: scope.orgId,
        p_pledge_id: input.pledgeId,
        p_actor_id: scope.actorId,
        p_cancellation_reason: input.cancellationReason ?? null,
        p_waive_pending: input.waivePending,
      });
    },

    async syncInstallmentTasks(
      installmentId: string,
      action: 'mark_paid' | 'waive' | 'write_off' | 'reopen'
    ) {
      const sourcePrefix = `pledge_installment:${installmentId}:`;
      if (action === 'mark_paid') {
        return completeGeneratedTasks(
          db,
          scope.orgId,
          sourcePrefix,
          'Installment paid'
        );
      }
      if (action === 'waive') {
        return cancelGeneratedTasks(
          db,
          scope.orgId,
          sourcePrefix,
          'Installment waived'
        );
      }
      if (action === 'write_off') {
        return cancelGeneratedTasks(
          db,
          scope.orgId,
          sourcePrefix,
          'Installment written off'
        );
      }
      return undefined;
    },
  };
}
