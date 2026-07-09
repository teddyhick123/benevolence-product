import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  valueFromRow,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldValueRow,
} from '@/lib/custom-fields';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const MAX_ENTITY_IDS = 200;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

async function requireOrgMember(orgId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role) return { error: json({ error: 'Not authorized' }, { status: 403 }) };

  return { supabase, user, role };
}

async function loadScopedEntityIds(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  entityType: CustomFieldEntityType,
  entityIds: string[]
): Promise<Set<string>> {
  if (entityType === 'grant') {
    const { data, error } = await db
      .from('grants')
      .select('id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('id', entityIds);
    if (error) throw error;
    return new Set((data ?? []).map((row: any) => row.id));
  }

  if (entityType === 'holding') {
    const { data, error } = await db
      .from('holdings')
      .select('id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('id', entityIds);
    if (error) throw error;
    return new Set((data ?? []).map((row: any) => row.id));
  }

  if (entityType === 'donor') {
    const { data, error } = await db
      .from('donors')
      .select('id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('id', entityIds);
    if (error) throw error;
    return new Set((data ?? []).map((row: any) => row.id));
  }

  const [receivedResult, taxResult] = await Promise.all([
    db.from('contributions_received').select('id').eq('org_id', orgId).in('id', entityIds),
    db.from('tax_contributions').select('id').eq('org_id', orgId).in('id', entityIds),
  ]);
  if (receivedResult.error) throw receivedResult.error;
  if (taxResult.error) throw taxResult.error;
  return new Set([
    ...(receivedResult.data ?? []).map((row: any) => row.id),
    ...(taxResult.data ?? []).map((row: any) => row.id),
  ]);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireOrgMember(orgId);
    if ('error' in auth) return auth.error;

    const entityType = req.nextUrl.searchParams.get('entity_type') as CustomFieldEntityType | null;
    if (!entityType || !CUSTOM_FIELD_ENTITY_TYPES.includes(entityType)) {
      return json({ error: 'Valid entity_type is required' }, { status: 400 });
    }

    const entityIds = (req.nextUrl.searchParams.get('entity_ids') ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    if (entityIds.length === 0) return json({ error: 'entity_ids is required' }, { status: 400 });
    if (entityIds.length > MAX_ENTITY_IDS) {
      return json({ error: `At most ${MAX_ENTITY_IDS} entity_ids may be requested` }, { status: 400 });
    }
    const uuid = z.string().uuid();
    const invalidId = entityIds.find(id => !uuid.safeParse(id).success);
    if (invalidId) return json({ error: `Invalid entity_id: ${invalidId}` }, { status: 400 });

    const db = createAdminClient();
    const scopedIds = await loadScopedEntityIds(db, orgId, entityType, entityIds);
    if (scopedIds.size !== entityIds.length) {
      return json({ error: 'One or more entities were not found in this organization' }, { status: 404 });
    }

    const [{ data: definitions, error: defErr }, { data: values, error: valueErr }] = await Promise.all([
      db
        .from('org_custom_field_definitions')
        .select('id, org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order, created_at, updated_at')
        .eq('org_id', orgId)
        .eq('entity_type', entityType)
        .order('sort_order', { ascending: true })
        .order('field_label', { ascending: true }),
      db
        .from('org_custom_field_values')
        .select('entity_id, field_definition_id, value_text, value_numeric, value_boolean, value_date')
        .eq('org_id', orgId)
        .eq('entity_type', entityType)
        .in('entity_id', entityIds),
    ]);
    if (defErr) throw defErr;
    if (valueErr) throw valueErr;

    const definitionsById = new Map(((definitions ?? []) as CustomFieldDefinition[]).map(definition => [definition.id, definition]));
    const valuesByEntity: Record<string, Record<string, string | number | boolean | null>> = Object.fromEntries(
      entityIds.map(id => [id, {}])
    );

    for (const row of (values ?? []) as Array<CustomFieldValueRow & { entity_id: string }>) {
      const definition = definitionsById.get(row.field_definition_id);
      if (!definition) continue;
      valuesByEntity[row.entity_id] ??= {};
      valuesByEntity[row.entity_id][definition.field_key] = valueFromRow(row);
    }

    return json({
      fields: definitions ?? [],
      values_by_entity: valuesByEntity,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
