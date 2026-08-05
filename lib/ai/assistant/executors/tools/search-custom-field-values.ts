import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';
import { CUSTOM_FIELD_ENTITY_TYPES, valueFromRow } from '@/lib/custom-fields';

export const executeSearchCustomFieldValues: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    InputValidator.validateEnum(
      args.entity_type,
      'entity_type',
      CUSTOM_FIELD_ENTITY_TYPES,
    );
    InputValidator.validateString(args.field_key, 'field_key', {
      maxLength: 64,
      pattern: /^[a-z][a-z0-9_]{0,63}$/,
    });
    InputValidator.validateEnum(args.operator, 'operator', [
      'eq',
      'contains',
      'lt',
      'lte',
      'gt',
      'gte',
    ] as const);
    InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

    const limit = Math.min(Number(args.limit ?? 25), 100);
    const { data: portfolio, error: portfolioErr } = await supabase
      .from('portfolios')
      .select('org_id')
      .eq('id', portfolioId)
      .single();
    if (portfolioErr || !portfolio?.org_id) {
      throw new Error('Unable to resolve portfolio organization');
    }

    const { data: definition, error: definitionErr } = await supabase
      .from('org_custom_field_definitions')
      .select('id, field_key, field_label, field_type, enum_options')
      .eq('org_id', portfolio.org_id)
      .eq('entity_type', args.entity_type)
      .eq('field_key', args.field_key)
      .eq('is_ai_readable', true)
      .maybeSingle();
    if (definitionErr) throw new Error(definitionErr.message);
    if (!definition)
      throw new Error(
        `Custom field not found or not AI-readable: ${args.field_key}`,
      );

    const operator = args.operator;
    const value = args.value;
    let column = 'value_text';
    if (
      definition.field_type === 'integer' ||
      definition.field_type === 'decimal'
    )
      column = 'value_numeric';
    if (definition.field_type === 'boolean') column = 'value_boolean';
    if (definition.field_type === 'date') column = 'value_date';

    let valuesQuery = supabase
      .from('org_custom_field_values')
      .select('entity_id, value_text, value_numeric, value_boolean, value_date')
      .eq('org_id', portfolio.org_id)
      .eq('entity_type', args.entity_type)
      .eq('field_definition_id', definition.id)
      .limit(limit);

    if (operator === 'contains') {
      if (!['text', 'enum'].includes(definition.field_type)) {
        throw new Error(
          'contains is only supported for text and enum custom fields',
        );
      }
      valuesQuery = valuesQuery.ilike(
        column,
        `%${String(value).slice(0, 120)}%`,
      );
    } else if (operator === 'eq') {
      valuesQuery = valuesQuery.eq(column, value);
    } else {
      if (!['integer', 'decimal', 'date'].includes(definition.field_type)) {
        throw new Error(
          `${operator} is only supported for numeric and date custom fields`,
        );
      }
      if (operator === 'lt') valuesQuery = valuesQuery.lt(column, value);
      if (operator === 'lte') valuesQuery = valuesQuery.lte(column, value);
      if (operator === 'gt') valuesQuery = valuesQuery.gt(column, value);
      if (operator === 'gte') valuesQuery = valuesQuery.gte(column, value);
    }

    const { data: matchedValues, error: valuesErr } = await valuesQuery;
    if (valuesErr) throw new Error(valuesErr.message);
    const entityIds = [
      ...new Set((matchedValues ?? []).map((row: any) => row.entity_id)),
    ];

    let entities: any[] = [];
    if (entityIds.length > 0 && args.entity_type === 'grant') {
      let grantQuery = supabase
        .from('grants')
        .select(
          'id, lifecycle_stage, requested_amount, approved_amount, purpose, holding_id, holdings(name)',
        )
        .eq('org_id', portfolio.org_id)
        .eq('portfolio_id', portfolioId)
        .in('id', entityIds);
      if (args.lifecycle_stage)
        grantQuery = grantQuery.eq('lifecycle_stage', args.lifecycle_stage);
      const { data, error } = await grantQuery.limit(limit);
      if (error) throw new Error(error.message);
      entities = data ?? [];
    } else if (entityIds.length > 0 && args.entity_type === 'holding') {
      const { data, error } = await supabase
        .from('holdings')
        .select('id, name, asset_type, status, funds_allocated')
        .eq('org_id', portfolio.org_id)
        .eq('portfolio_id', portfolioId)
        .in('id', entityIds)
        .limit(limit);
      if (error) throw new Error(error.message);
      entities = data ?? [];
    } else if (entityIds.length > 0 && args.entity_type === 'donor') {
      const { data, error } = await supabase
        .from('donors')
        .select(
          'id, first_name, last_name, organization_name, email, lifetime_giving, tier',
        )
        .eq('org_id', portfolio.org_id)
        .in('id', entityIds)
        .limit(limit);
      if (error) throw new Error(error.message);
      entities = data ?? [];
    } else if (entityIds.length > 0) {
      entities = entityIds.map((id) => ({ id }));
    }

    const valueByEntity = new Map(
      (matchedValues ?? []).map((row: any) => [
        row.entity_id,
        valueFromRow(row),
      ]),
    );
    return {
      action: null,
      output: {
        field: {
          field_key: definition.field_key,
          field_label: definition.field_label,
          field_type: definition.field_type,
        },
        operator,
        value,
        count: entities.length,
        matches: entities.map((entity) => ({
          ...entity,
          custom_field_value: valueByEntity.get(entity.id) ?? null,
        })),
      },
    };
  }
};
