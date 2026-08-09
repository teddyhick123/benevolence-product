import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

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
  };
}
