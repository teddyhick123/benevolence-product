import type { PortfolioManagerAccessContext } from '@/lib/api/principals';
import type { OrgRole } from '@/lib/roles';

/** Atomic membership mutations constrained to the already-authorized portfolio. */
export function createPortfolioMembershipRepository(scope: PortfolioManagerAccessContext) {
  return {
    async remove(userId: string) {
      const { error } = await scope.db.rpc('mutate_portfolio_member', {
        p_portfolio_id: scope.portfolioId,
        p_user_id: userId,
        p_action: 'delete',
      });
      if (error) throw error;
    },

    async updateRole(userId: string, role: OrgRole) {
      const { error } = await scope.db.rpc('mutate_portfolio_member', {
        p_portfolio_id: scope.portfolioId,
        p_user_id: userId,
        p_action: 'update_role',
        p_role: role,
      });
      if (error) throw error;
    },
  };
}
