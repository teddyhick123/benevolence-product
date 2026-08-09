import type { createAdminClient } from '@/lib/supabase';

type AdminClient = ReturnType<typeof createAdminClient>;

export const ORG_AUDIT_ACTIONS = {
  GRANT_DECISION_RECORDED: 'grant.decision_recorded',
  GRANT_PAYMENT_RECORDED: 'grant.payment_recorded',
  CONTRIBUTION_RECEIPT_GENERATED: 'contribution.receipt_generated',
  COMPLIANCE_990PF_EXPORTED: 'compliance.990pf_exported',
  AI_CONNECTION_CREATED: 'ai.connection_created',
  AI_CONNECTION_UPDATED: 'ai.connection_updated',
  AI_CONNECTION_DELETED: 'ai.connection_deleted',
  AI_CREDENTIAL_ROTATED: 'ai.credential_rotated',
  AI_DEPLOYMENT_CREATED: 'ai.deployment_created',
  AI_DEPLOYMENT_DELETED: 'ai.deployment_deleted',
  AI_ROUTE_REPLACED: 'ai.route_replaced',
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
