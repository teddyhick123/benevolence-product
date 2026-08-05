import { createElevatedClient } from '@/lib/api/admin-client';
import type { PortfolioAccessContext } from '@/lib/api/principals';
import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';

type AiToolScope = Pick<
  PortfolioAccessContext,
  'orgId' | 'portfolioId' | 'principal'
>;

export type GrantPaymentAuditInput = {
  grantId: string;
  paymentId: string;
  operation: 'insert' | 'update';
  amount: unknown;
  status: unknown;
  scheduledDate: unknown;
  paidDate: unknown;
};

export type AssistantToolCapabilities = {
  recordGrantPaymentAudit(_input: GrantPaymentAuditInput): Promise<void>;
};

/** Elevated AI tool capabilities fixed to one authorized portfolio principal. */
export function createAssistantToolCapabilities(
  scope: AiToolScope,
): AssistantToolCapabilities {
  const db = createElevatedClient();
  const actorId = scope.principal.userId;

  return {
    async recordGrantPaymentAudit(input) {
      const { data: grant, error } = await db
        .from('grants')
        .select('id')
        .eq('id', input.grantId)
        .eq('org_id', scope.orgId)
        .eq('portfolio_id', scope.portfolioId)
        .maybeSingle();
      if (error) throw error;
      if (!grant)
        throw new Error('Grant not found in the authorized portfolio');

      await writeOrgAuditEvent(db, {
        orgId: scope.orgId,
        actorId,
        action: ORG_AUDIT_ACTIONS.GRANT_PAYMENT_RECORDED,
        targetId: grant.id,
        metadata: {
          payment_id: input.paymentId,
          operation: input.operation,
          amount: input.amount,
          status: input.status,
          scheduled_date: input.scheduledDate,
          paid_date: input.paidDate,
        },
      });
    },
  };
}
