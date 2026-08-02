import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  CustomFieldRepositoryError,
  createCustomFieldRepository,
} from '@/lib/api/repositories/custom-fields';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  type CustomFieldEntityType,
} from '@/lib/custom-fields';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const valuesSchema = z.object({
  entity_type: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  values: z.record(z.string(), z.unknown()),
}).strict();

function failure(error: unknown) {
  if (error instanceof CustomFieldRepositoryError) {
    return jsonError(error.message, error.status);
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  return jsonError(message, 500);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  const entityType = req.nextUrl.searchParams.get('entity_type') as CustomFieldEntityType | null;
  const entityId = req.nextUrl.searchParams.get('entity_id');
  if (!entityType || !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType)) {
    return jsonError('Valid entity_type is required', 400);
  }
  if (!entityId || !z.string().uuid().safeParse(entityId).success) {
    return jsonError('Valid entity_id is required', 400);
  }

  try {
    const result = await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).getEntityValues(entityType, entityId);
    return jsonOk(result);
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  const parsed = valuesSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('Validation failed', 400, { details: parsed.error.format() });
  }

  try {
    const result = await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).setEntityValues(parsed.data.entity_type, parsed.data.entity_id, parsed.data.values);
    return jsonOk(result);
  } catch (error) {
    return failure(error);
  }
}
