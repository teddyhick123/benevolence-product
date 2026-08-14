import { createElevatedClient } from '@/lib/api/admin-client';
import {
  loadCustomFieldsForEntity,
  typedValuePatch,
  valueFromRow,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldType,
  type CustomFieldValueRow,
} from '@/lib/custom-fields';
import type { LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { drainCustomFieldAutomationOutbox } from '@/lib/tasks/automation/custom-field-outbox';

const DEFINITION_SELECT = 'id, org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order, created_at, updated_at';

type CustomFieldScope = {
  orgId: string;
  actorId: string;
};

export type CreateCustomFieldDefinitionInput = {
  entity_type: CustomFieldEntityType;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  enum_options: Array<{ value: string; label: string }> | null;
  required_at_stage: LifecycleStage | null;
  is_ai_readable: boolean;
  sort_order: number;
};

export type UpdateCustomFieldDefinitionInput = {
  field_label?: string;
  field_type?: CustomFieldType;
  enum_options?: Array<{ value: string; label: string }> | null;
  required_at_stage?: LifecycleStage | null;
  is_ai_readable?: boolean;
  sort_order?: number;
};

export class CustomFieldRepositoryError extends Error {
  readonly status: 400 | 403 | 404;

  constructor(message: string, status: 400 | 403 | 404) {
    super(message);
    this.name = 'CustomFieldRepositoryError';
    this.status = status;
  }
}

/** Elevated custom-field operations constrained to one authorized organization. */
export function createCustomFieldRepository(scope: CustomFieldScope) {
  const db = createElevatedClient();

  async function assertEntityScope(
    entityType: CustomFieldEntityType,
    entityId: string
  ) {
    const { data, error } = await db.rpc('custom_field_entity_org', {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    if (error) throw error;
    if (!data || data !== scope.orgId) {
      throw new CustomFieldRepositoryError('Entity not found', 404);
    }
  }

  async function loadScopedEntityIds(
    entityType: CustomFieldEntityType,
    entityIds: string[]
  ): Promise<Set<string>> {
    if (entityType === 'grant' || entityType === 'holding' || entityType === 'donor') {
      const query = entityType === 'grant'
        ? db.from('grants')
        : entityType === 'holding'
          ? db.from('holdings')
          : db.from('donors');
      const { data, error } = await query
        .select('id')
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .in('id', entityIds);
      if (error) throw error;
      return new Set((data ?? []).map((row: any) => row.id));
    }

    const [receivedResult, taxResult] = await Promise.all([
      db
        .from('contributions_received')
        .select('id')
        .eq('org_id', scope.orgId)
        .in('id', entityIds),
      db
        .from('tax_contributions')
        .select('id')
        .eq('org_id', scope.orgId)
        .in('id', entityIds),
    ]);
    if (receivedResult.error) throw receivedResult.error;
    if (taxResult.error) throw taxResult.error;
    return new Set([
      ...(receivedResult.data ?? []).map((row: any) => row.id),
      ...(taxResult.data ?? []).map((row: any) => row.id),
    ]);
  }

  async function entityValues(entityType: CustomFieldEntityType, entityId: string) {
    const fields = await loadCustomFieldsForEntity(
      db,
      scope.orgId,
      entityType,
      entityId
    );
    return {
      fields,
      values: Object.fromEntries(fields.map(field => [field.field_key, field.value])),
    };
  }

  function throwValueMutationError(error: { code?: string; message?: string }): never {
    if (error.code === '42501') {
      throw new CustomFieldRepositoryError('Organization membership is required', 403);
    }
    if (error.code === 'P0002') {
      throw new CustomFieldRepositoryError('Entity or custom field not found', 404);
    }
    if (error.code === '22023' || error.code === '23514') {
      throw new CustomFieldRepositoryError(error.message || 'Invalid custom field value', 400);
    }
    throw error;
  }

  return {
    async listDefinitions(entityType?: CustomFieldEntityType) {
      let query = db
        .from('org_custom_field_definitions')
        .select(DEFINITION_SELECT)
        .eq('org_id', scope.orgId);
      if (entityType) query = query.eq('entity_type', entityType);

      const { data, error } = await query
        .order('entity_type', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('field_label', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },

    async createDefinition(input: CreateCustomFieldDefinitionInput) {
      const { data, error } = await db
        .from('org_custom_field_definitions')
        .insert({ org_id: scope.orgId, ...input })
        .select(DEFINITION_SELECT)
        .single();
      if (error) throw error;
      return data;
    },

    async updateDefinition(fieldId: string, input: UpdateCustomFieldDefinitionInput) {
      const { data: existing, error: fetchError } = await db
        .from('org_custom_field_definitions')
        .select('id, entity_type, field_type')
        .eq('id', fieldId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) throw new CustomFieldRepositoryError('Custom field not found', 404);

      const nextType = input.field_type ?? existing.field_type;
      if (input.required_at_stage && existing.entity_type !== 'grant') {
        throw new CustomFieldRepositoryError(
          'required_at_stage is only supported for grant custom fields',
          400
        );
      }
      if (
        nextType === 'enum'
        && input.field_type === 'enum'
        && (!input.enum_options || input.enum_options.length === 0)
      ) {
        throw new CustomFieldRepositoryError(
          'enum_options is required when changing a field to enum',
          400
        );
      }
      if (nextType !== 'enum' && input.enum_options && input.enum_options.length > 0) {
        throw new CustomFieldRepositoryError(
          'enum_options is only supported for enum custom fields',
          400
        );
      }

      const patch: Record<string, unknown> = {};
      for (const key of [
        'field_label',
        'field_type',
        'required_at_stage',
        'is_ai_readable',
        'sort_order',
      ] as const) {
        if (key in input) patch[key] = input[key] ?? null;
      }
      if ('enum_options' in input) {
        patch.enum_options = nextType === 'enum' ? input.enum_options : null;
      }
      if (Object.keys(patch).length === 0) {
        throw new CustomFieldRepositoryError('No fields to update provided', 400);
      }

      const { data, error } = await db
        .from('org_custom_field_definitions')
        .update(patch)
        .eq('id', fieldId)
        .eq('org_id', scope.orgId)
        .select(DEFINITION_SELECT)
        .single();
      if (error) throw error;
      return data;
    },

    async deleteDefinition(fieldId: string) {
      const { data, error } = await db
        .from('org_custom_field_definitions')
        .delete()
        .eq('id', fieldId)
        .eq('org_id', scope.orgId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new CustomFieldRepositoryError('Custom field not found', 404);
      }
    },

    async getEntityValues(entityType: CustomFieldEntityType, entityId: string) {
      await assertEntityScope(entityType, entityId);
      return entityValues(entityType, entityId);
    },

    async setEntityValues(
      entityType: CustomFieldEntityType,
      entityId: string,
      values: Record<string, unknown>
    ) {
      const { data: definitions, error: definitionError } = await db
        .from('org_custom_field_definitions')
        .select('id, field_key, field_type, enum_options')
        .eq('org_id', scope.orgId)
        .eq('entity_type', entityType);
      if (definitionError) throw definitionError;

      const byKey = new Map(
        (definitions ?? []).map((definition: any) => [
          definition.field_key,
          definition as CustomFieldDefinition,
        ])
      );
      const byId = new Map(
        (definitions ?? []).map((definition: any) => [
          definition.id,
          definition as CustomFieldDefinition,
        ])
      );
      const unknownKeys = Object.keys(values).filter(key => !byKey.has(key) && !byId.has(key));
      if (unknownKeys.length > 0) {
        throw new CustomFieldRepositoryError(
          `Unknown custom field(s): ${unknownKeys.join(', ')}`,
          400
        );
      }

      const changes: Array<Record<string, unknown>> = [];
      for (const [key, rawValue] of Object.entries(values)) {
        const definition = byKey.get(key) ?? byId.get(key);
        if (!definition) continue;

        let patch;
        try {
          patch = typedValuePatch(definition, rawValue);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid value';
          throw new CustomFieldRepositoryError(`${definition.field_key}: ${message}`, 400);
        }

        changes.push({
          field_definition_id: definition.id,
          value_text: patch?.value_text ?? null,
          value_numeric: patch?.value_numeric ?? null,
          value_boolean: patch?.value_boolean ?? null,
          value_date: patch?.value_date ?? null,
        });
      }

      // An empty payload is a valid no-op. The RPC rejects an empty change set
      // with 22023, so return the current values rather than a spurious 400.
      if (changes.length === 0) {
        await assertEntityScope(entityType, entityId);
        return entityValues(entityType, entityId);
      }

      const { data: mutation, error: mutationError } = await db.rpc('mutate_custom_field_values', {
        p_org_id: scope.orgId,
        p_actor_id: scope.actorId,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_changes: changes,
      });
      if (mutationError) throwValueMutationError(mutationError);

      for (const eventId of ((mutation as { outbox_event_ids?: string[] } | null)?.outbox_event_ids ?? [])) {
        try {
          await drainCustomFieldAutomationOutbox(db, {
            orgId: scope.orgId,
            eventId,
            limit: 1,
          });
        } catch (automationError) {
          console.error('Custom field automation deferred for retry:', automationError);
        }
      }

      return entityValues(entityType, entityId);
    },

    async getBatchValues(entityType: CustomFieldEntityType, entityIds: string[]) {
      const scopedIds = await loadScopedEntityIds(entityType, entityIds);
      if (scopedIds.size !== entityIds.length) {
        throw new CustomFieldRepositoryError(
          'One or more entities were not found in this organization',
          404
        );
      }

      const [definitionsResult, valuesResult] = await Promise.all([
        db
          .from('org_custom_field_definitions')
          .select(DEFINITION_SELECT)
          .eq('org_id', scope.orgId)
          .eq('entity_type', entityType)
          .order('sort_order', { ascending: true })
          .order('field_label', { ascending: true }),
        db
          .from('org_custom_field_values')
          .select('entity_id, field_definition_id, value_text, value_numeric, value_boolean, value_date')
          .eq('org_id', scope.orgId)
          .eq('entity_type', entityType)
          .in('entity_id', entityIds),
      ]);
      if (definitionsResult.error) throw definitionsResult.error;
      if (valuesResult.error) throw valuesResult.error;

      const definitions = definitionsResult.data ?? [];
      const definitionsById = new Map(
        (definitions as CustomFieldDefinition[]).map(definition => [definition.id, definition])
      );
      const valuesByEntity: Record<string, Record<string, string | number | boolean | null>> =
        Object.fromEntries(entityIds.map(id => [id, {}]));

      for (const row of (valuesResult.data ?? []) as Array<
        CustomFieldValueRow & { entity_id: string }
      >) {
        const definition = definitionsById.get(row.field_definition_id);
        if (!definition) continue;
        valuesByEntity[row.entity_id] ??= {};
        valuesByEntity[row.entity_id][definition.field_key] = valueFromRow(row);
      }

      return { fields: definitions, values_by_entity: valuesByEntity };
    },
  };
}
