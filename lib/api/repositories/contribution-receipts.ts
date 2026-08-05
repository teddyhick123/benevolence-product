import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';
import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

type ReceiptScope = Pick<OrgAccessContext, 'orgId' | 'principal'>;

type GenerateReceiptInput = {
  contributionId: string;
  subject: string;
  body: string;
  sendImmediately: boolean;
  recipientEmail: string | null;
  amount: number;
  contributionDate: string;
};

/** Service-only receipt transaction constrained to one authorized org and actor. */
export function createContributionReceiptRepository(scope: ReceiptScope) {
  const db = createElevatedClient();

  return {
    async generate(input: GenerateReceiptInput) {
      const { data: receipt, error } = await db.rpc(
        'create_contribution_receipt_acknowledgment',
        {
          p_org_id: scope.orgId,
          p_contribution_id: input.contributionId,
          p_actor_id: scope.principal.userId,
          p_subject: input.subject,
          p_body: input.body,
          p_send_immediately: input.sendImmediately,
          p_recipient_email: input.recipientEmail,
        }
      );
      if (error) throw error;

      await writeOrgAuditEvent(db, {
        orgId: scope.orgId,
        actorId: scope.principal.userId,
        action: ORG_AUDIT_ACTIONS.CONTRIBUTION_RECEIPT_GENERATED,
        targetId: input.contributionId,
        metadata: {
          letter_id: receipt?.letter?.id ?? null,
          receipt_number: receipt?.receipt_number ?? null,
          sent: receipt?.sent ?? false,
          donor_email: input.recipientEmail,
          amount: input.amount,
          contribution_date: input.contributionDate,
        },
      });

      return receipt;
    },
  };
}
