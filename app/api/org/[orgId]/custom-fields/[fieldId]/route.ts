import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  CustomFieldRepositoryError,
  createCustomFieldRepository,
} from '@/lib/api/repositories/custom-fields';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { CUSTOM_FIELD_KEY_PATTERN, CUSTOM_FIELD_TYPES } from '@/lib/custom-fields';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; fieldId: string }>;
}

const patchSchema = z.object({
  field_label: z.string().trim().min(1).max(120).optional(),
  field_type: z.enum(CUSTOM_FIELD_TYPES).optional(),
  enum_options: z.array(z.object({
    value: z.string().regex(CUSTOM_FIELD_KEY_PATTERN).max(64),
    label: z.string().trim().min(1).max(120),
  })).max(50).nullable().optional(),
  required_at_stage: z.enum(LIFECYCLE_STAGES).nullable().optional(),
  is_ai_readable: z.boolean().optional(),
  sort_order: z.number().int().min(-1000).max(1000).optional(),
}).strict();

function failure(error: unknown) {
  if (error instanceof CustomFieldRepositoryError) {
    return jsonError(error.message, error.status);
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  return jsonError(message, 500);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgId, fieldId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('Validation failed', 400, { details: parsed.error.format() });
  }

  try {
    const data = await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).updateDefinition(fieldId, parsed.data);
    return jsonOk({ data });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { orgId, fieldId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  if (req.nextUrl.searchParams.get('confirm') !== 'true') {
    return jsonError(
      'Deleting a custom field cascades to all values. Pass confirm=true to continue.',
      400
    );
  }

  try {
    await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).deleteDefinition(fieldId);
    return jsonOk({ success: true });
  } catch (error) {
    return failure(error);
  }
}
