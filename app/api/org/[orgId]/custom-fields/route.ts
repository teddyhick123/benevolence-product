import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  CustomFieldRepositoryError,
  createCustomFieldRepository,
} from '@/lib/api/repositories/custom-fields';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_KEY_PATTERN,
  CUSTOM_FIELD_TYPES,
  normalizeFieldKey,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '@/lib/custom-fields';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const definitionSchema = z.object({
  entity_type: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  field_key: z.string().regex(CUSTOM_FIELD_KEY_PATTERN).optional(),
  field_label: z.string().trim().min(1).max(120),
  field_type: z.enum(CUSTOM_FIELD_TYPES),
  enum_options: z.array(z.object({
    value: z.string().regex(CUSTOM_FIELD_KEY_PATTERN).max(64),
    label: z.string().trim().min(1).max(120),
  })).max(50).optional(),
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

function normalizeDefinitionPayload(input: z.infer<typeof definitionSchema>) {
  const fieldKey = input.field_key ?? normalizeFieldKey(input.field_label);
  if (!CUSTOM_FIELD_KEY_PATTERN.test(fieldKey)) {
    throw new Error('field_key must start with a letter and contain only lowercase letters, digits, and underscores');
  }
  if (input.required_at_stage && input.entity_type !== 'grant') {
    throw new Error('required_at_stage is only supported for grant custom fields');
  }
  if (input.field_type === 'enum') {
    if (!input.enum_options || input.enum_options.length === 0) {
      throw new Error('enum_options is required for enum custom fields');
    }
  } else if (input.enum_options && input.enum_options.length > 0) {
    throw new Error('enum_options is only supported for enum custom fields');
  }

  return {
    entity_type: input.entity_type as CustomFieldEntityType,
    field_key: fieldKey,
    field_label: input.field_label,
    field_type: input.field_type as CustomFieldType,
    enum_options: input.field_type === 'enum' ? input.enum_options! : null,
    required_at_stage: input.required_at_stage ?? null,
    is_ai_readable: input.is_ai_readable ?? true,
    sort_order: input.sort_order ?? 0,
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  const entityType = req.nextUrl.searchParams.get('entity_type');
  if (entityType && !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType as CustomFieldEntityType)) {
    return jsonError('Invalid entity_type', 400);
  }

  try {
    const data = await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).listDefinitions(entityType as CustomFieldEntityType | undefined);
    return jsonOk({ data });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const parsed = definitionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('Validation failed', 400, { details: parsed.error.format() });
  }

  let payload: ReturnType<typeof normalizeDefinitionPayload>;
  try {
    payload = normalizeDefinitionPayload(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid custom field definition';
    return jsonError(message, 400);
  }

  try {
    const data = await createCustomFieldRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).createDefinition(payload);
    return jsonOk({ data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
