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

const MAX_ENTITY_IDS = 200;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

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
  if (!entityType || !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType)) {
    return jsonError('Valid entity_type is required', 400);
  }

  const entityIds = (req.nextUrl.searchParams.get('entity_ids') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  if (entityIds.length === 0) return jsonError('entity_ids is required', 400);
  if (entityIds.length > MAX_ENTITY_IDS) {
    return jsonError(`At most ${MAX_ENTITY_IDS} entity_ids may be requested`, 400);
  }
  const uuid = z.string().uuid();
  const invalidId = entityIds.find(id => !uuid.safeParse(id).success);
  if (invalidId) return jsonError(`Invalid entity_id: ${invalidId}`, 400);

  try {
    const result = await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).getBatchValues(entityType, entityIds);
    return jsonOk(result);
  } catch (error) {
    return failure(error);
  }
}
