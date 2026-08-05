import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  loadCustomFieldsForEntity,
} from '@/lib/custom-fields';

export const executeGetCustomFields: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    InputValidator.validateEnum(
      args.entity_type,
      'entity_type',
      CUSTOM_FIELD_ENTITY_TYPES,
    );
    InputValidator.validateUUID(args.entity_id, 'entity_id');

    const { data: portfolio, error: portfolioErr } = await supabase
      .from('portfolios')
      .select('org_id')
      .eq('id', portfolioId)
      .single();
    if (portfolioErr || !portfolio?.org_id) {
      throw new Error('Unable to resolve portfolio organization');
    }

    const { data: entityOrgId, error: scopeErr } = await supabase.rpc(
      'custom_field_entity_org',
      {
        p_entity_type: args.entity_type,
        p_entity_id: args.entity_id,
      },
    );
    if (scopeErr) throw new Error(scopeErr.message);
    if (entityOrgId !== portfolio.org_id) {
      throw new Error('Entity not found in this organization');
    }

    const fields = await loadCustomFieldsForEntity(
      supabase,
      portfolio.org_id,
      args.entity_type,
      args.entity_id,
      { aiReadableOnly: true },
    );

    return {
      action: null,
      output: {
        entity_type: args.entity_type,
        entity_id: args.entity_id,
        custom_fields: fields.map((field) => ({
          field_key: field.field_key,
          field_label: field.field_label,
          field_type: field.field_type,
          value: field.value,
          required_at_stage: field.required_at_stage,
        })),
      },
    };
  }
};
