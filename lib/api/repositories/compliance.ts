import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext, PortfolioAccessContext } from '@/lib/api/principals';
import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';
import {
  cancelGeneratedTasks,
  completeGeneratedTasks,
} from '@/lib/tasks/automation/task-writer';

type OrgComplianceScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

type PortfolioComplianceScope = Pick<
  PortfolioAccessContext,
  'orgId' | 'portfolioId'
> & {
  actorId: string;
};

export type FilingAttachment = {
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
};

export type FilingAttachmentWithUrl = FilingAttachment & {
  signed_url: string | null;
};

export class ComplianceFilingNotFoundError extends Error {
  constructor() {
    super('Filing not found');
    this.name = 'ComplianceFilingNotFoundError';
  }
}

export class ComplianceAttachmentNotFoundError extends Error {
  constructor() {
    super('Attachment not found');
    this.name = 'ComplianceAttachmentNotFoundError';
  }
}

export class InvalidComplianceAttachmentPathError extends Error {
  constructor() {
    super('Compliance attachment has an invalid storage path');
    this.name = 'InvalidComplianceAttachmentPathError';
  }
}

const COMPLIANCE_DOCUMENT_BUCKET = 'compliance-documents';

function attachmentPrefix(orgId: string, filingId: string) {
  return `${orgId}/${filingId}/`;
}

function assertAttachmentPath(orgId: string, filingId: string, path: string) {
  if (
    typeof path !== 'string' ||
    !path.startsWith(attachmentPrefix(orgId, filingId)) ||
    path.includes('..') ||
    path.includes('\\')
  ) {
    throw new InvalidComplianceAttachmentPathError();
  }
}

function attachmentsFrom(value: unknown): FilingAttachment[] {
  return Array.isArray(value) ? value as FilingAttachment[] : [];
}

/** Elevated compliance operations constrained to one already-authorized org. */
export function createOrgComplianceRepository(scope: OrgComplianceScope) {
  const db = createElevatedClient();

  async function requireFiling(filingId: string) {
    const { data, error } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', scope.orgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ComplianceFilingNotFoundError();
    return data;
  }

  return {
    async syncFilingStatusTasks(
      filingId: string,
      status: 'filed' | 'waived' | 'not_applicable'
    ) {
      const sourcePrefix = `filing:${filingId}:`;
      if (status === 'filed') {
        return completeGeneratedTasks(
          db,
          scope.orgId,
          sourcePrefix,
          'Filing marked as filed'
        );
      }

      return cancelGeneratedTasks(
        db,
        scope.orgId,
        sourcePrefix,
        status === 'waived' ? 'Filing waived' : 'Filing marked not applicable'
      );
    },

    async listFilingAttachments(filingId: string): Promise<FilingAttachmentWithUrl[]> {
      const filing = await requireFiling(filingId);
      const attachments = attachmentsFrom(filing.attachments);

      return Promise.all(attachments.map(async attachment => {
        assertAttachmentPath(scope.orgId, filingId, attachment.path);
        const { data } = await db.storage
          .from(COMPLIANCE_DOCUMENT_BUCKET)
          .createSignedUrl(attachment.path, 3600);
        return { ...attachment, signed_url: data?.signedUrl ?? null };
      }));
    },

    async uploadFilingAttachment(input: {
      filingId: string;
      fileName: string;
      fileSize: number;
      contentType: string;
      body: ArrayBuffer;
    }): Promise<FilingAttachmentWithUrl> {
      const filing = await requireFiling(input.filingId);
      const safeFileName = input.fileName
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.\./g, '_');
      const path = attachmentPrefix(scope.orgId, input.filingId)
        + `${crypto.randomUUID()}_${safeFileName}`;
      assertAttachmentPath(scope.orgId, input.filingId, path);

      const { error: uploadError } = await db.storage
        .from(COMPLIANCE_DOCUMENT_BUCKET)
        .upload(path, input.body, { contentType: input.contentType, upsert: false });
      if (uploadError) throw uploadError;

      const attachment: FilingAttachment = {
        path,
        name: input.fileName,
        size: input.fileSize,
        uploaded_at: new Date().toISOString(),
      };
      const currentAttachments = attachmentsFrom(filing.attachments);
      const { error: updateError } = await db
        .from('filing_calendar')
        .update({ attachments: [...currentAttachments, attachment] })
        .eq('id', input.filingId)
        .eq('org_id', scope.orgId);

      if (updateError) {
        await db.storage.from(COMPLIANCE_DOCUMENT_BUCKET).remove([path]);
        throw updateError;
      }

      const { data: signed } = await db.storage
        .from(COMPLIANCE_DOCUMENT_BUCKET)
        .createSignedUrl(path, 3600);

      return { ...attachment, signed_url: signed?.signedUrl ?? null };
    },

    async deleteFilingAttachment(filingId: string, path: string) {
      assertAttachmentPath(scope.orgId, filingId, path);
      const filing = await requireFiling(filingId);
      const currentAttachments = attachmentsFrom(filing.attachments);
      const filtered = currentAttachments.filter(attachment => attachment.path !== path);

      if (filtered.length === currentAttachments.length) {
        throw new ComplianceAttachmentNotFoundError();
      }

      const { error: updateError } = await db
        .from('filing_calendar')
        .update({ attachments: filtered })
        .eq('id', filingId)
        .eq('org_id', scope.orgId);
      if (updateError) throw updateError;

      const { error: removeError } = await db.storage
        .from(COMPLIANCE_DOCUMENT_BUCKET)
        .remove([path]);

      return { storageCleanupPending: !!removeError };
    },
  };
}

/** Elevated compliance audit operations constrained to one authorized portfolio. */
export function createPortfolioComplianceRepository(scope: PortfolioComplianceScope) {
  const db = createElevatedClient();

  return {
    async record990PfExport(metadata: Record<string, unknown>) {
      return writeOrgAuditEvent(db, {
        orgId: scope.orgId,
        actorId: scope.actorId,
        action: ORG_AUDIT_ACTIONS.COMPLIANCE_990PF_EXPORTED,
        targetId: scope.portfolioId,
        metadata,
      });
    },
  };
}
