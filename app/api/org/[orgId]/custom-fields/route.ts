import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_KEY_PATTERN,
  CUSTOM_FIELD_TYPES,
  normalizeFieldKey,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '@/lib/custom-fields';
import { isWorkspaceManager } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

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

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

async function requireOrgRole(orgId: string, adminOnly = false) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role) return { error: json({ error: 'Not authorized' }, { status: 403 }) };
  if (adminOnly && !isWorkspaceManager(role)) {
    return { error: json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { supabase, user, role };
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
  try {
    const { orgId } = await params;
    const auth = await requireOrgRole(orgId);
    if ('error' in auth) return auth.error;

    const entityType = req.nextUrl.searchParams.get('entity_type');
    if (entityType && !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType as CustomFieldEntityType)) {
      return json({ error: 'Invalid entity_type' }, { status: 400 });
    }

    const db = createAdminClient();
    let query = db
      .from('org_custom_field_definitions')
      .select('id, org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order, created_at, updated_at')
      .eq('org_id', orgId);

    if (entityType) query = query.eq('entity_type', entityType);

    const { data, error } = await query
      .order('entity_type', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('field_label', { ascending: true });

    if (error) throw error;
    return json({ data: data ?? [] });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireOrgRole(orgId, true);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const parsed = definitionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    let payload: ReturnType<typeof normalizeDefinitionPayload>;
    try {
      payload = normalizeDefinitionPayload(parsed.data);
    } catch (err: any) {
      return json({ error: err?.message ?? 'Invalid custom field definition' }, { status: 400 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from('org_custom_field_definitions')
      .insert({ org_id: orgId, ...payload })
      .select('id, org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order, created_at, updated_at')
      .single();

    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
