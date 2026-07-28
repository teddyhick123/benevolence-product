import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import {
  ComplianceAttachmentNotFoundError,
  ComplianceFilingNotFoundError,
  InvalidComplianceAttachmentPathError,
  createOrgComplianceRepository,
} from '@/lib/api/repositories/compliance';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_BYTES = 20 * 1024 * 1024;
const deleteAttachmentSchema = z.object({
  path: z.string().min(1).max(2_000),
}).strict();

interface RouteParams {
  params: Promise<{ orgId: string; filingId: string }>;
}

function repositoryFor(orgId: string, actorId: string) {
  return createOrgComplianceRepository({ orgId, actorId });
}

// GET /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments
// Returns all attachments for a filing with fresh signed URLs (3600s expiry).
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;

    const data = await repositoryFor(orgId, access.context.user.id)
      .listFilingAttachments(filingId);
    return jsonOk({ data });
  } catch (err: unknown) {
    if (err instanceof ComplianceFilingNotFoundError) {
      return jsonError(err.message, 404);
    }
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// POST /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments
// Uploads multipart field "file" and appends its metadata to the filing.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonError('file is required', 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError('File exceeds 20 MB limit', 413);
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError('File type not allowed. Accepted: PDF, images, Word, Excel.', 415);
    }

    const data = await repositoryFor(orgId, access.context.user.id)
      .uploadFilingAttachment({
        filingId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        body: await file.arrayBuffer(),
      });
    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ComplianceFilingNotFoundError) {
      return jsonError(err.message, 404);
    }
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// DELETE /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;
    const parsed = deleteAttachmentSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('path is required', 400);
    }

    const result = await repositoryFor(orgId, access.context.user.id)
      .deleteFilingAttachment(filingId, parsed.data.path);
    if (result.storageCleanupPending) {
      console.warn('[compliance-attachments] Attachment metadata removed; storage cleanup pending');
    }
    return jsonOk({ ok: true });
  } catch (err: unknown) {
    if (
      err instanceof ComplianceFilingNotFoundError ||
      err instanceof ComplianceAttachmentNotFoundError ||
      err instanceof InvalidComplianceAttachmentPathError
    ) {
      return jsonError('Attachment not found', 404);
    }
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
