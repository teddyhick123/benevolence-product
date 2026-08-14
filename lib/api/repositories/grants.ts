import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext, PortfolioAccessContext } from '@/lib/api/principals';
import type { DecisionPayload, LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';
import { checkWorkflowGate } from '@/lib/grants/workflow-config';
import { runAutomationRulesForEvent } from '@/lib/tasks/automation/dynamic-rules';

type GrantRepositoryScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

type GrantDocumentRepositoryScope = Pick<PortfolioAccessContext, 'orgId' | 'portfolioId'> & {
  actorId: string;
};

const GRANT_DOCUMENT_BUCKET = 'grant-documents';

export class GrantDocumentGrantNotFoundError extends Error {
  constructor() {
    super('Grant not found');
    this.name = 'GrantDocumentGrantNotFoundError';
  }
}

export class GrantDocumentNotFoundError extends Error {
  constructor() {
    super('Document not found');
    this.name = 'GrantDocumentNotFoundError';
  }
}

export class InvalidGrantDocumentPathError extends Error {
  constructor() {
    super('Grant document has an invalid storage path');
    this.name = 'InvalidGrantDocumentPathError';
  }
}

export class GrantMilestoneNotFoundError extends Error {
  constructor() {
    super('Milestone not found');
    this.name = 'GrantMilestoneNotFoundError';
  }
}

export type CreateGrantInput = {
  portfolioId: string;
  purpose: string;
  requestedAmount: number;
  investeeId?: string | null;
  newGrantee?: Record<string, unknown> | null;
  currency: string;
  grantType?: string | null;
  grantPeriodStart?: string | null;
  grantPeriodEnd?: string | null;
  lifecycleStage: string;
  internalOwnerId?: string | null;
  riskLevel?: string | null;
  reportingFrequency?: string | null;
  renewalEligible: boolean;
  workflowTemplateId?: string | null;
};

export type GrantWorkflowRow = {
  id: string;
  lifecycle_stage: string;
  org_id: string;
  purpose: string | null;
  internal_owner_id: string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  grant_period_start: string | null;
  grant_period_end: string | null;
  risk_level: string | null;
  deliverables: string | null;
  reporting_frequency: string | null;
};

export type GrantLifecycleTransitionInput = {
  grantId: string;
  expectedFromStage: LifecycleStage;
  targetStage: LifecycleStage;
  reason?: string;
  decisionPayload?: DecisionPayload;
};

export type RecordGrantDecisionInput = {
  grantId: string;
  decisionType: 'approval' | 'decline' | 'defer' | 'renewal' | 'closeout' | 'payment_release';
  decision: 'approved' | 'declined' | 'deferred' | 'conditional' | 'not_applicable';
  decisionDate: string;
  decidedBy: string;
  amount?: number | null;
  conditions?: string | null;
  rationale?: string | null;
  boardMeetingDate?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreateGrantCommunicationInput = {
  portfolioId: string;
  grantId: string;
  direction: 'inbound' | 'outbound' | 'internal';
  commType: string;
  subject?: string | null;
  summary: string;
  contactName?: string | null;
  contactEmail?: string | null;
  followUpRequired: boolean;
  followUpDate?: string | null;
  followUpNotes?: string | null;
};

export type CreateGrantPaymentInput = {
  portfolioId: string;
  grantId: string;
  amount: number;
  scheduledDate?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
};

export type GrantPaymentStatus =
  | 'scheduled'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'returned';

export type UploadGrantDocumentInput = {
  grantId: string;
  documentType: 'proposal' | 'agreement' | 'amendment' | 'report' | 'correspondence';
  fileName: string;
  fileSize: number;
  mimeType: string;
  extension: string;
  body: ArrayBuffer;
};

const GRANT_WORKFLOW_SELECT =
  'id, lifecycle_stage, org_id, purpose, internal_owner_id, requested_amount, ' +
  'approved_amount, grant_period_start, grant_period_end, risk_level, ' +
  'deliverables, reporting_frequency';

/** Elevated grant operations constrained to one already-authorized org. */
export function createGrantRepository(scope: GrantRepositoryScope) {
  const db = createElevatedClient();

  return {
    async findPortfolio(portfolioId: string) {
      return db
        .from('portfolios')
        .select('id, org_id')
        .eq('id', portfolioId)
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .maybeSingle();
    },

    async findOrganizationMember(userId: string) {
      return db
        .from('organization_members')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .maybeSingle();
    },

    async createWithFoundationRecords(input: CreateGrantInput) {
      return db.rpc('create_grant_with_foundation_records', {
        p_org_id: scope.orgId,
        p_portfolio_id: input.portfolioId,
        p_actor_id: scope.actorId,
        p_purpose: input.purpose,
        p_requested_amount: input.requestedAmount,
        p_investee_id: input.investeeId ?? null,
        p_new_grantee: input.newGrantee ?? null,
        p_currency: input.currency,
        p_grant_type: input.grantType ?? null,
        p_grant_period_start: input.grantPeriodStart ?? null,
        p_grant_period_end: input.grantPeriodEnd ?? null,
        p_lifecycle_stage: input.lifecycleStage,
        p_internal_owner_id: input.internalOwnerId ?? null,
        p_risk_level: input.riskLevel ?? null,
        p_reporting_frequency: input.reportingFrequency ?? null,
        p_renewal_eligible: input.renewalEligible,
        p_workflow_template_id: input.workflowTemplateId ?? null,
      });
    },

    async recordDecision(input: RecordGrantDecisionInput) {
      const { data: grant, error: grantError } = await db
        .from('grants')
        .select('id')
        .eq('id', input.grantId)
        .eq('org_id', scope.orgId)
        .maybeSingle();

      if (grantError) return { data: null, error: grantError, notFound: false };
      if (!grant) return { data: null, error: null, notFound: true };

      const { data, error } = await db
        .from('grant_decisions')
        .insert({
          grant_id: input.grantId,
          org_id: scope.orgId,
          decision_type: input.decisionType,
          decision: input.decision,
          decision_date: input.decisionDate,
          decided_by: input.decidedBy,
          amount: input.amount ?? null,
          conditions: input.conditions ?? null,
          rationale: input.rationale ?? null,
          board_meeting_date: input.boardMeetingDate ?? null,
          metadata: input.metadata ?? null,
        })
        .select()
        .single();

      if (error) return { data: null, error, notFound: false };

      await writeOrgAuditEvent(db, {
        orgId: scope.orgId,
        actorId: scope.actorId,
        action: ORG_AUDIT_ACTIONS.GRANT_DECISION_RECORDED,
        targetId: input.grantId,
        metadata: {
          decision_id: data.id,
          decision_type: input.decisionType,
          decision: input.decision,
          decision_date: input.decisionDate,
          decided_by: input.decidedBy,
          amount: input.amount ?? null,
          board_meeting_date: input.boardMeetingDate ?? null,
        },
      });

      return { data, error: null, notFound: false };
    },

    async findWorkflowGrant(grantId: string) {
      return db
        .from('grants')
        .select(GRANT_WORKFLOW_SELECT)
        .eq('id', grantId)
        .eq('org_id', scope.orgId)
        .maybeSingle() as unknown as Promise<{
          data: GrantWorkflowRow | null;
          error: { message: string } | null;
        }>;
    },

    async findWorkflowGrants(grantIds: string[]) {
      return db
        .from('grants')
        .select(GRANT_WORKFLOW_SELECT)
        .eq('org_id', scope.orgId)
        .in('id', grantIds) as unknown as Promise<{
          data: GrantWorkflowRow[] | null;
          error: { message: string } | null;
        }>;
    },

    async listGrantHoldings(portfolioId: string) {
      return db
        .from('grants')
        .select('id, holding_id, holdings!inner(id, name)')
        .eq('org_id', scope.orgId)
        .eq('portfolio_id', portfolioId)
        .is('deleted_at', null)
        .order('holding_id');
    },

    async listCommunications(portfolioId: string) {
      return db
        .from('grant_communications')
        .select(`
          id, grant_id, direction, comm_type, subject, summary, full_content,
          contact_name, contact_email, occurred_at, follow_up_required,
          follow_up_date, follow_up_notes, tags,
          grants!inner(id, holding_id, org_id, portfolio_id, holdings!inner(name))
        `)
        .eq('grants.org_id', scope.orgId)
        .eq('grants.portfolio_id', portfolioId)
        .is('grants.deleted_at', null)
        .order('occurred_at', { ascending: false });
    },

    async createCommunication(input: CreateGrantCommunicationInput) {
      const { data: grant, error: grantError } = await db
        .from('grants')
        .select('id')
        .eq('id', input.grantId)
        .eq('org_id', scope.orgId)
        .eq('portfolio_id', input.portfolioId)
        .is('deleted_at', null)
        .maybeSingle();

      if (grantError) return { data: null, error: grantError, notFound: false };
      if (!grant) return { data: null, error: null, notFound: true };

      const { data, error } = await db
        .from('grant_communications')
        .insert({
          grant_id: input.grantId,
          direction: input.direction,
          comm_type: input.commType,
          subject: input.subject ?? null,
          summary: input.summary,
          contact_name: input.contactName ?? null,
          contact_email: input.contactEmail ?? null,
          follow_up_required: input.followUpRequired,
          follow_up_date: input.followUpDate ?? null,
          follow_up_notes: input.followUpNotes ?? null,
        })
        .select()
        .single();

      return { data, error, notFound: false };
    },

    async listPayments(portfolioId: string) {
      return db
        .from('grant_payments')
        .select(`
          id, grant_id, payment_number, amount, scheduled_date, actual_date,
          status, payment_method, reference_number, conditions_met,
          condition_notes, notes,
          grants!inner(id, holding_id, org_id, portfolio_id, holdings!inner(name))
        `)
        .eq('grants.org_id', scope.orgId)
        .eq('grants.portfolio_id', portfolioId)
        .is('grants.deleted_at', null)
        .order('scheduled_date', { ascending: true });
    },

    async createPayment(input: CreateGrantPaymentInput) {
      // Scope check, payment-number allocation and insert happen inside one
      // transaction so concurrent callers cannot mint the same payment number.
      const { data, error } = await db.rpc('create_grant_payment', {
        p_org_id: scope.orgId,
        p_portfolio_id: input.portfolioId,
        p_grant_id: input.grantId,
        p_amount: input.amount,
        p_scheduled_date: input.scheduledDate ?? null,
        p_payment_method: input.paymentMethod ?? null,
        p_notes: input.notes ?? null,
      });

      if (error) {
        if (error.code === 'P0002') return { data: null, error: null, notFound: true };
        return { data: null, error, notFound: false };
      }
      return { data, error: null, notFound: false };
    },

    async updatePaymentStatus(paymentId: string, status: GrantPaymentStatus) {
      const { data: payment, error: paymentError } = await db
        .from('grant_payments')
        .select('id, grants!inner(org_id)')
        .eq('id', paymentId)
        .eq('grants.org_id', scope.orgId)
        .maybeSingle();

      if (paymentError) return { data: null, error: paymentError, notFound: false };
      if (!payment) return { data: null, error: null, notFound: true };

      const paymentPatch = status === 'completed'
        ? { status, actual_date: new Date().toISOString().slice(0, 10) }
        : { status };
      const { data, error } = await db
        .from('grant_payments')
        .update(paymentPatch)
        .eq('id', paymentId)
        .select()
        .single();

      return { data, error, notFound: false };
    },

    async checkWorkflowGate(
      grantId: string,
      fromStage: LifecycleStage,
      grant: GrantWorkflowRow
    ) {
      return checkWorkflowGate(
        db,
        scope.orgId,
        grantId,
        fromStage,
        grant as unknown as Record<string, unknown>
      );
    },

    async transitionLifecycle(input: GrantLifecycleTransitionInput) {
      return db.rpc('transition_grant_lifecycle', {
        p_grant_id: input.grantId,
        p_expected_org_id: scope.orgId,
        p_expected_from_stage: input.expectedFromStage,
        p_to_stage: input.targetStage,
        p_actor_id: scope.actorId,
        p_reason: input.reason ?? null,
        p_decision_payload: input.decisionPayload ?? null,
      });
    },

    async transitionLifecycleBatch(inputs: GrantLifecycleTransitionInput[]) {
      return db.rpc('transition_grant_lifecycle_batch', {
        p_expected_org_id: scope.orgId,
        p_actor_id: scope.actorId,
        p_transitions: inputs.map(input => ({
          grant_id: input.grantId,
          expected_from_stage: input.expectedFromStage,
          target_stage: input.targetStage,
          reason: input.reason ?? null,
          decision_payload: input.decisionPayload ?? null,
        })),
      });
    },

    async runLifecycleAutomation(input: {
      grantId: string;
      fromStage: LifecycleStage;
      toStage: LifecycleStage;
    }) {
      return runAutomationRulesForEvent(db, {
        orgId: scope.orgId,
        triggerType: 'grant_stage_change',
        entityType: 'grant',
        entityId: input.grantId,
        payload: {
          from_stage: input.fromStage,
          to_stage: input.toStage,
          actor_id: scope.actorId,
        },
      });
    },

    async updateMilestoneWithTaskSync(input: {
      portfolioId: string;
      holdingId: string;
      milestoneId: string;
      patch: {
        milestone_name?: string;
        description?: string | null;
        due_date?: string | null;
        completed_date?: string | null;
        status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
        notes?: string | null;
      };
    }) {
      const { data: milestone, error } = await db.rpc(
        'update_grant_milestone_with_task_sync',
        {
          p_expected_org_id: scope.orgId,
          p_expected_portfolio_id: input.portfolioId,
          p_expected_holding_id: input.holdingId,
          p_milestone_id: input.milestoneId,
          p_actor_id: scope.actorId,
          p_patch: input.patch,
        }
      );
      if (error) throw error;
      if (!milestone) throw new GrantMilestoneNotFoundError();
      return milestone;
    },
  };
}

/** Elevated grant-document storage constrained to one authorized portfolio. */
export function createGrantDocumentRepository(scope: GrantDocumentRepositoryScope) {
  const db = createElevatedClient();

  async function requireScopedGrant(grantId: string) {
    const { data, error } = await db
      .from('grants')
      .select('id')
      .eq('id', grantId)
      .eq('org_id', scope.orgId)
      .eq('portfolio_id', scope.portfolioId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new GrantDocumentGrantNotFoundError();
  }

  function assertScopedPath(grantId: string, storagePath: string) {
    if (!storagePath.startsWith(`${scope.portfolioId}/${grantId}/`)) {
      throw new InvalidGrantDocumentPathError();
    }
  }

  return {
    async listDocuments(grantId: string) {
      await requireScopedGrant(grantId);
      const { data, error } = await db
        .from('grant_documents')
        .select('*')
        .eq('grant_id', grantId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      return Promise.all((data ?? []).map(async document => {
        assertScopedPath(grantId, document.storage_path);
        const { data: signed, error: signedError } = await db.storage
          .from(GRANT_DOCUMENT_BUCKET)
          .createSignedUrl(document.storage_path, 3600);
        if (signedError) throw signedError;
        return { ...document, signed_url: signed?.signedUrl ?? null };
      }));
    },

    async uploadDocument(input: UploadGrantDocumentInput) {
      await requireScopedGrant(input.grantId);
      const storagePath = `${scope.portfolioId}/${input.grantId}/${input.documentType}-${crypto.randomUUID()}.${input.extension}`;
      assertScopedPath(input.grantId, storagePath);

      const { error: uploadError } = await db.storage
        .from(GRANT_DOCUMENT_BUCKET)
        .upload(storagePath, input.body, {
          contentType: input.mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data, error } = await db
        .from('grant_documents')
        .insert({
          grant_id: input.grantId,
          document_type: input.documentType,
          file_name: input.fileName,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          storage_path: storagePath,
          uploaded_by: scope.actorId,
        })
        .select()
        .single();

      if (error) {
        const { error: removeError } = await db.storage
          .from(GRANT_DOCUMENT_BUCKET)
          .remove([storagePath]);
        if (removeError) throw removeError;
        throw error;
      }

      return data;
    },

    async deleteDocument(grantId: string, documentId: string) {
      await requireScopedGrant(grantId);
      const { data: document, error: findError } = await db
        .from('grant_documents')
        .select('id, storage_path')
        .eq('id', documentId)
        .eq('grant_id', grantId)
        .maybeSingle();
      if (findError) throw findError;
      if (!document) throw new GrantDocumentNotFoundError();
      assertScopedPath(grantId, document.storage_path);

      const { data: deleted, error: deleteError } = await db
        .from('grant_documents')
        .delete()
        .eq('id', documentId)
        .eq('grant_id', grantId)
        .select('id')
        .maybeSingle();
      if (deleteError) throw deleteError;
      if (!deleted) throw new GrantDocumentNotFoundError();

      const { error: storageDeleteError } = await db.storage
        .from(GRANT_DOCUMENT_BUCKET)
        .remove([document.storage_path]);

      return { storageCleanupPending: Boolean(storageDeleteError) };
    },
  };
}
