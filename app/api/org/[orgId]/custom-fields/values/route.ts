import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  loadCustomFieldsForEntity,
  typedValuePatch,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
} from '@/lib/custom-fields';
import { runAutomationRulesForEvent } from '@/lib/tasks/automation/dynamic-rules';
import { canOperateOrg } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const valuesSchema = z.object({
  entity_type: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  values: z.record(z.string(), z.unknown()),
}).strict();

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

async function requireOrgMember(orgId: string, write = false) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role) return { error: json({ error: 'Not authorized' }, { status: 403 }) };
  if (write && !canOperateOrg(role)) {
    return { error: json({ error: 'Member access required' }, { status: 403 }) };
  }

  return { supabase, user, role };
}

async function ensureEntityScope(db: ReturnType<typeof createAdminClient>, orgId: string, entityType: CustomFieldEntityType, entityId: string) {
  const { data, error } = await db.rpc('custom_field_entity_org', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
  if (!data) return json({ error: 'Entity not found' }, { status: 404 });
  if (data !== orgId) return json({ error: 'Entity not found' }, { status: 404 });
  return null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireOrgMember(orgId);
    if ('error' in auth) return auth.error;

    const entityType = req.nextUrl.searchParams.get('entity_type') as CustomFieldEntityType | null;
    const entityId = req.nextUrl.searchParams.get('entity_id');
    if (!entityType || !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType)) {
      return json({ error: 'Valid entity_type is required' }, { status: 400 });
    }
    if (!entityId || !z.string().uuid().safeParse(entityId).success) {
      return json({ error: 'Valid entity_id is required' }, { status: 400 });
    }

    const db = createAdminClient();
    const scopeError = await ensureEntityScope(db, orgId, entityType, entityId);
    if (scopeError) return scopeError;

    const fields = await loadCustomFieldsForEntity(db, orgId, entityType, entityId);
    const values = Object.fromEntries(fields.map(field => [field.field_key, field.value]));
    return json({ fields, values });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireOrgMember(orgId, true);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const parsed = valuesSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { entity_type: entityType, entity_id: entityId, values } = parsed.data;
    const db = createAdminClient();
    const scopeError = await ensureEntityScope(db, orgId, entityType, entityId);
    if (scopeError) return scopeError;

    const { data: definitions, error: defErr } = await db
      .from('org_custom_field_definitions')
      .select('id, field_key, field_type, enum_options')
      .eq('org_id', orgId)
      .eq('entity_type', entityType);
    if (defErr) throw defErr;

    const byKey = new Map((definitions ?? []).map((definition: any) => [definition.field_key, definition as CustomFieldDefinition]));
    const byId = new Map((definitions ?? []).map((definition: any) => [definition.id, definition as CustomFieldDefinition]));
    const unknownKeys = Object.keys(values).filter(key => !byKey.has(key) && !byId.has(key));
    if (unknownKeys.length > 0) {
      return json({ error: `Unknown custom field(s): ${unknownKeys.join(', ')}` }, { status: 400 });
    }

    for (const [key, rawValue] of Object.entries(values)) {
      const definition = byKey.get(key) ?? byId.get(key);
      if (!definition) continue;
      let patch;
      try {
        patch = typedValuePatch(definition, rawValue);
      } catch (err: any) {
        return json({ error: `${definition.field_key}: ${err?.message ?? 'Invalid value'}` }, { status: 400 });
      }

      if (patch === null) {
        const { error } = await db
          .from('org_custom_field_values')
          .delete()
          .eq('org_id', orgId)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .eq('field_definition_id', definition.id);
        if (error) throw error;
        continue;
      }

      const { error } = await db
        .from('org_custom_field_values')
        .upsert({
          org_id: orgId,
          entity_type: entityType,
          entity_id: entityId,
          field_definition_id: definition.id,
          ...patch,
        }, { onConflict: 'entity_id,field_definition_id' });
      if (error) throw error;

      try {
        await runAutomationRulesForEvent(db, {
          orgId,
          triggerType: 'custom_field_set',
          entityType,
          entityId,
          payload: {
            entity_type: entityType,
            field_key: definition.field_key,
            field_definition_id: definition.id,
            value: rawValue,
            actor_id: auth.user.id,
          },
        });
      } catch (automationErr) {
        console.error('Custom field automation failed:', automationErr);
      }
    }

    const fields = await loadCustomFieldsForEntity(db, orgId, entityType, entityId);
    const nextValues = Object.fromEntries(fields.map(field => [field.field_key, field.value]));
    return json({ fields, values: nextValues });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
