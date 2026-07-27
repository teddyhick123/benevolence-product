import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePortfolioAccess } from '@/lib/api/access';
import {
  createGrantDocumentRepository,
  GrantDocumentGrantNotFoundError,
  GrantDocumentNotFoundError,
  InvalidGrantDocumentPathError,
} from '@/lib/api/repositories/grants';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

const MIME_TYPE_EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
} as const;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const documentTypeSchema = z.enum([
  'proposal',
  'agreement',
  'amendment',
  'report',
  'correspondence',
]);

type Params = { id: string; grantId: string };

function repositoryError(error: unknown) {
  if (error instanceof GrantDocumentGrantNotFoundError) {
    return jsonError(error.message, 404);
  }
  if (error instanceof GrantDocumentNotFoundError) {
    return jsonError(error.message, 404);
  }
  if (error instanceof InvalidGrantDocumentPathError) {
    return jsonError(error.message, 500);
  }
  return jsonError(error instanceof Error ? error.message : 'Internal error', 500);
}

/** GET /api/portfolio/[id]/grants/[grantId]/documents */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'viewer');
    if (!access.ok) return access.response;

    const repository = createGrantDocumentRepository({
      orgId: access.context.orgId,
      portfolioId,
      actorId: access.context.user.id,
    });
    const documents = await repository.listDocuments(grantId);
    return jsonOk({ data: documents });
  } catch (error: unknown) {
    console.error('Error fetching grant documents:', error);
    return repositoryError(error);
  }
}

/** POST /api/portfolio/[id]/grants/[grantId]/documents */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;

    const formData = await req.formData();
    const fileValue = formData.get('file');
    const documentTypeResult = documentTypeSchema.safeParse(
      formData.get('document_type') ?? 'proposal'
    );
    if (!(fileValue instanceof File)) return jsonError('No file provided', 400);
    if (!documentTypeResult.success) return jsonError('Invalid document type', 400);

    const extension = MIME_TYPE_EXTENSIONS[fileValue.type as keyof typeof MIME_TYPE_EXTENSIONS];
    if (!extension) {
      return jsonError('File type not allowed. Accepted: PDF, DOCX, XLSX, JPEG, PNG, WebP.', 400);
    }
    if (fileValue.size > MAX_SIZE_BYTES) {
      return jsonError('File size must be less than 10MB.', 400);
    }

    const repository = createGrantDocumentRepository({
      orgId: access.context.orgId,
      portfolioId,
      actorId: access.context.user.id,
    });
    const document = await repository.uploadDocument({
      grantId,
      documentType: documentTypeResult.data,
      fileName: fileValue.name,
      fileSize: fileValue.size,
      mimeType: fileValue.type,
      extension,
      body: await fileValue.arrayBuffer(),
    });

    return jsonOk({ data: document }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error uploading grant document:', error);
    return repositoryError(error);
  }
}

/** DELETE /api/portfolio/[id]/grants/[grantId]/documents?documentId= */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const documentId = new URL(req.url).searchParams.get('documentId');
    if (!documentId) return jsonError('documentId is required', 400);

    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;

    const repository = createGrantDocumentRepository({
      orgId: access.context.orgId,
      portfolioId,
      actorId: access.context.user.id,
    });
    const result = await repository.deleteDocument(grantId, documentId);
    if (result.storageCleanupPending) {
      console.error('Grant document storage cleanup failed');
      return jsonOk({
        success: true,
        storage_cleanup_pending: true,
        warning: 'Document record deleted, but storage cleanup failed.',
      }, { status: 202 });
    }

    return jsonOk({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting grant document:', error);
    return repositoryError(error);
  }
}
