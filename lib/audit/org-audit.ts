import type { createAdminClient } from '@/lib/supabase';

type AdminClient = ReturnType<typeof createAdminClient>;

export const ORG_AUDIT_ACTIONS = {
  GRANT_DECISION_RECORDED: 'grant.decision_recorded',
  GRANT_PAYMENT_RECORDED: 'grant.payment_recorded',
  CONTRIBUTION_RECEIPT_GENERATED: 'contribution.receipt_generated',
  COMPLIANCE_990PF_EXPORTED: 'compliance.990pf_exported',
} as const;

export type OrgAuditAction = typeof ORG_AUDIT_ACTIONS[keyof typeof ORG_AUDIT_ACTIONS];

export async function writeOrgAuditEvent(
  db: AdminClient,
  input: {
    orgId: string;
    actorId: string;
    action: OrgAuditAction;
    targetId?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const { error } = await db.from('org_audit_log').insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    actor_subject_id: input.actorId,
    action: input.action,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });

  if (error) throw error;
}
