import type { SupabaseClient } from '@supabase/supabase-js';
import type { LifecycleStage } from '@/lib/grants/lifecycle-shared';

export const CUSTOM_FIELD_ENTITY_TYPES = ['grant', 'holding', 'donor', 'contribution'] as const;
export const CUSTOM_FIELD_TYPES = ['text', 'integer', 'decimal', 'boolean', 'date', 'enum'] as const;
export const CUSTOM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export type CustomFieldEntityType = typeof CUSTOM_FIELD_ENTITY_TYPES[number];
export type CustomFieldType = typeof CUSTOM_FIELD_TYPES[number];

export interface CustomFieldDefinition {
  id: string;
  org_id: string;
  entity_type: CustomFieldEntityType;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  enum_options: Array<{ value: string; label: string }> | null;
  required_at_stage: LifecycleStage | null;
  is_ai_readable: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CustomFieldValueRow {
  id?: string;
  org_id: string;
  entity_id: string;
  entity_type: CustomFieldEntityType;
  field_definition_id: string;
  value_text: string | null;
  value_numeric: number | string | null;
  value_boolean: boolean | null;
  value_date: string | null;
}

export interface CustomFieldWithValue extends CustomFieldDefinition {
  value: string | number | boolean | null;
  value_row_id: string | null;
}

export function normalizeFieldKey(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);
  return /^[a-z]/.test(key) ? key : `field_${key}`.slice(0, 64);
}

export function valueFromRow(row: Pick<CustomFieldValueRow, 'value_text' | 'value_numeric' | 'value_boolean' | 'value_date'> | null | undefined) {
  if (!row) return null;
  if (row.value_text !== null && row.value_text !== undefined) return row.value_text;
  if (row.value_numeric !== null && row.value_numeric !== undefined) return Number(row.value_numeric);
  if (row.value_boolean !== null && row.value_boolean !== undefined) return row.value_boolean;
  if (row.value_date !== null && row.value_date !== undefined) return row.value_date;
  return null;
}

export function customFieldValueIsSet(row: Pick<CustomFieldValueRow, 'value_text' | 'value_numeric' | 'value_boolean' | 'value_date'> | null | undefined): boolean {
  return valueFromRow(row) !== null;
}

export function isEmptyCustomFieldInput(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function typedValuePatch(definition: Pick<CustomFieldDefinition, 'field_type' | 'enum_options'>, value: unknown): Omit<CustomFieldValueRow, 'id' | 'org_id' | 'entity_id' | 'entity_type' | 'field_definition_id'> | null {
  if (isEmptyCustomFieldInput(value)) return null;

  const empty = {
    value_text: null,
    value_numeric: null,
    value_boolean: null,
    value_date: null,
  };

  switch (definition.field_type) {
    case 'text': {
      return { ...empty, value_text: String(value).trim() };
    }
    case 'enum': {
      const text = String(value).trim();
      const options = definition.enum_options ?? [];
      if (!options.some(opt => opt.value === text)) {
        throw new Error(`Invalid enum value: ${text}`);
      }
      return { ...empty, value_text: text };
    }
    case 'integer': {
      const numeric = Number(value);
      if (!Number.isInteger(numeric)) throw new Error('Value must be an integer');
      return { ...empty, value_numeric: numeric };
    }
    case 'decimal': {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error('Value must be a number');
      return { ...empty, value_numeric: numeric };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ...empty, value_boolean: value };
      if (value === 'true') return { ...empty, value_boolean: true };
      if (value === 'false') return { ...empty, value_boolean: false };
      throw new Error('Value must be true or false');
    }
    case 'date': {
      const date = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        throw new Error('Value must be a YYYY-MM-DD date');
      }
      return { ...empty, value_date: date };
    }
    default:
      throw new Error('Unsupported custom field type');
  }
}

export async function loadCustomFieldsForEntity(
  db: SupabaseClient,
  orgId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  options: { aiReadableOnly?: boolean } = {}
): Promise<CustomFieldWithValue[]> {
  let definitionQuery = db
    .from('org_custom_field_definitions')
    .select('id, org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('entity_type', entityType);

  if (options.aiReadableOnly) definitionQuery = definitionQuery.eq('is_ai_readable', true);

  const [{ data: definitions, error: defErr }, { data: values, error: valueErr }] = await Promise.all([
    definitionQuery.order('sort_order', { ascending: true }).order('field_label', { ascending: true }),
    db
      .from('org_custom_field_values')
      .select('id, field_definition_id, value_text, value_numeric, value_boolean, value_date')
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId),
  ]);

  if (defErr) throw new Error(`Failed to load custom field definitions: ${defErr.message}`);
  if (valueErr) throw new Error(`Failed to load custom field values: ${valueErr.message}`);

  const valuesByDefinition = new Map((values ?? []).map((row: any) => [row.field_definition_id, row]));
  return ((definitions ?? []) as CustomFieldDefinition[]).map(definition => {
    const row = valuesByDefinition.get(definition.id) as CustomFieldValueRow | undefined;
    return {
      ...definition,
      value: valueFromRow(row),
      value_row_id: row?.id ?? null,
    };
  });
}

export async function checkRequiredGrantCustomFields(
  db: SupabaseClient,
  orgId: string,
  grantId: string,
  fromStage: LifecycleStage
): Promise<string[]> {
  const { data: definitions, error: defErr } = await db
    .from('org_custom_field_definitions')
    .select('id, field_label, field_key')
    .eq('org_id', orgId)
    .eq('entity_type', 'grant')
    .eq('required_at_stage', fromStage);

  if (defErr) throw new Error(`Failed to load required custom fields: ${defErr.message}`);
  if (!definitions || definitions.length === 0) return [];

  const definitionIds = definitions.map((definition: any) => definition.id);
  const { data: values, error: valueErr } = await db
    .from('org_custom_field_values')
    .select('field_definition_id, value_text, value_numeric, value_boolean, value_date')
    .eq('org_id', orgId)
    .eq('entity_type', 'grant')
    .eq('entity_id', grantId)
    .in('field_definition_id', definitionIds);

  if (valueErr) throw new Error(`Failed to load required custom field values: ${valueErr.message}`);

  const valuesByDefinition = new Map((values ?? []).map((row: any) => [row.field_definition_id, row]));
  const reasons: string[] = [];
  for (const definition of definitions as Array<{ id: string; field_label: string; field_key: string }>) {
    if (!customFieldValueIsSet(valuesByDefinition.get(definition.id) as CustomFieldValueRow | undefined)) {
      reasons.push(`Custom field required: ${definition.field_label || definition.field_key}`);
    }
  }

  return reasons;
}
