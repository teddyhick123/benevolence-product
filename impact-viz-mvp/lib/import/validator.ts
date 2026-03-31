// lib/import/validator.ts
// Comprehensive, JSON-configurable validation rules engine for the import system

import type { EntityType } from './types';

// ---------------------------------------------------------------------------
// Rule types
// ---------------------------------------------------------------------------

export type RuleName =
  | 'required'
  | 'positive'
  | 'date_valid'
  | 'date_not_future'
  | 'ein_format'
  | 'contribution_type_valid'
  | 'amount_reasonable'
  | 'max_length'
  | 'min_value'
  | 'max_value'
  | 'regex'
  | 'one_of';

export interface ValidationRule {
  rule: RuleName;
  severity: 'error' | 'warning';
  message?: string; // override default message
  // Rule-specific options:
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  pattern?: string; // for regex rule
  values?: string[]; // for one_of rule
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  rule: RuleName;
  value?: unknown; // the actual value that failed
  auto_fixable?: boolean; // hint to AI layer
}

export interface FieldConfig {
  source: string;
  type: 'string' | 'numeric' | 'date' | 'boolean' | 'enum';
  required?: boolean;
  default?: unknown;
  transform?: string;
  confidence?: number;
  values_map?: Record<string, string>;
  rules?: ValidationRule[];
}

export interface EntityMappingConfig {
  source_entity: string;
  field_map: Record<string, FieldConfig>;
  match_criteria?: Array<{ fields: string[]; weight: number }>;
  lookup_rules?: Array<{ by: string; to: string; from: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CONTRIBUTION_TYPES = new Set([
  'cash',
  'check',
  'wire',
  'stock',
  'crypto',
  'real_estate',
  'other_property',
]);

const EIN_FORMAT = /^\d{2}-\d{7}$/;

// ---------------------------------------------------------------------------
// Individual rule evaluators
// ---------------------------------------------------------------------------

function evalRequired(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  const isEmpty = value === null || value === undefined || value === '';
  if (!isEmpty) return null;
  return {
    field,
    message: rule.message ?? 'Field is required',
    severity: rule.severity,
    rule: 'required',
    value,
  };
}

function evalPositive(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (typeof value !== 'number') return null;
  if (value <= 0) {
    return {
      field,
      message: rule.message ?? 'Must be a positive number',
      severity: rule.severity,
      rule: 'positive',
      value,
    };
  }
  return null;
}

function evalDateValid(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) {
    return {
      field,
      message: rule.message ?? 'Invalid date',
      severity: rule.severity,
      rule: 'date_valid',
      value,
    };
  }
  return null;
}

function evalDateNotFuture(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getTime() > tomorrow.getTime()) {
    return {
      field,
      message: rule.message ?? 'Date is in the future',
      severity: rule.severity,
      rule: 'date_not_future',
      value,
    };
  }
  return null;
}

function evalEinFormat(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  if (!EIN_FORMAT.test(str)) {
    return {
      field,
      message: rule.message ?? 'EIN format invalid (expected XX-XXXXXXX)',
      severity: rule.severity,
      rule: 'ein_format',
      value,
      auto_fixable: true,
    };
  }
  return null;
}

function evalContributionTypeValid(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  if (!VALID_CONTRIBUTION_TYPES.has(String(value))) {
    return {
      field,
      message:
        rule.message ??
        `contribution_type must be one of: ${[...VALID_CONTRIBUTION_TYPES].join(', ')}`,
      severity: rule.severity,
      rule: 'contribution_type_valid',
      value,
    };
  }
  return null;
}

function evalAmountReasonable(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (typeof value !== 'number') return null;
  if (value > 10_000_000) {
    return {
      field,
      message: rule.message ?? 'Unusually large amount, please verify',
      severity: rule.severity,
      rule: 'amount_reasonable',
      value,
    };
  }
  return null;
}

function evalMaxLength(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  if (rule.maxLength === undefined) return null;
  const str = String(value);
  if (str.length > rule.maxLength) {
    return {
      field,
      message: rule.message ?? `Exceeds maximum length of ${rule.maxLength}`,
      severity: rule.severity,
      rule: 'max_length',
      value,
    };
  }
  return null;
}

function evalMinValue(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (typeof value !== 'number') return null;
  if (rule.minValue === undefined) return null;
  if (value < rule.minValue) {
    return {
      field,
      message: rule.message ?? `Must be at least ${rule.minValue}`,
      severity: rule.severity,
      rule: 'min_value',
      value,
    };
  }
  return null;
}

function evalMaxValue(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (typeof value !== 'number') return null;
  if (rule.maxValue === undefined) return null;
  if (value > rule.maxValue) {
    return {
      field,
      message: rule.message ?? `Must be at most ${rule.maxValue}`,
      severity: rule.severity,
      rule: 'max_value',
      value,
    };
  }
  return null;
}

function evalRegex(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  if (!rule.pattern) return null;
  const re = new RegExp(rule.pattern);
  if (!re.test(String(value))) {
    return {
      field,
      message: rule.message ?? `Does not match required pattern`,
      severity: rule.severity,
      rule: 'regex',
      value,
    };
  }
  return null;
}

function evalOneOf(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (value === null || value === undefined || value === '') return null;
  if (!rule.values || rule.values.length === 0) return null;
  if (!rule.values.includes(String(value))) {
    return {
      field,
      message: rule.message ?? `Must be one of: ${rule.values.join(', ')}`,
      severity: rule.severity,
      rule: 'one_of',
      value,
    };
  }
  return null;
}

function applyRule(
  field: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  switch (rule.rule) {
    case 'required':
      return evalRequired(field, value, rule);
    case 'positive':
      return evalPositive(field, value, rule);
    case 'date_valid':
      return evalDateValid(field, value, rule);
    case 'date_not_future':
      return evalDateNotFuture(field, value, rule);
    case 'ein_format':
      return evalEinFormat(field, value, rule);
    case 'contribution_type_valid':
      return evalContributionTypeValid(field, value, rule);
    case 'amount_reasonable':
      return evalAmountReasonable(field, value, rule);
    case 'max_length':
      return evalMaxLength(field, value, rule);
    case 'min_value':
      return evalMinValue(field, value, rule);
    case 'max_value':
      return evalMaxValue(field, value, rule);
    case 'regex':
      return evalRegex(field, value, rule);
    case 'one_of':
      return evalOneOf(field, value, rule);
  }
}

// ---------------------------------------------------------------------------
// Default rules per entity type
// ---------------------------------------------------------------------------

interface DefaultRule {
  field: string;
  rule: ValidationRule;
}

const ENTITY_DEFAULT_RULES: Record<EntityType, DefaultRule[]> = {
  contributions: [
    { field: 'recipient_name', rule: { rule: 'required', severity: 'error' } },
    { field: 'contribution_date', rule: { rule: 'required', severity: 'error' } },
    { field: 'amount_usd', rule: { rule: 'required', severity: 'error' } },
    { field: 'contribution_type', rule: { rule: 'contribution_type_valid', severity: 'error' } },
    { field: 'amount_usd', rule: { rule: 'positive', severity: 'error' } },
    { field: 'contribution_date', rule: { rule: 'date_valid', severity: 'error' } },
    { field: 'contribution_date', rule: { rule: 'date_not_future', severity: 'warning' } },
    { field: 'recipient_ein', rule: { rule: 'ein_format', severity: 'warning' } },
    { field: 'amount_usd', rule: { rule: 'amount_reasonable', severity: 'warning' } },
  ],
  holdings: [
    { field: 'name', rule: { rule: 'required', severity: 'error' } },
  ],
  investees: [
    { field: 'display_name', rule: { rule: 'required', severity: 'error' } },
  ],
  metrics: [
    { field: 'metric_code', rule: { rule: 'required', severity: 'error' } },
    { field: 'value', rule: { rule: 'required', severity: 'error' } },
    { field: 'value', rule: { rule: 'positive', severity: 'error' } },
  ],
  users: [
    // email or matched_existing_user_id required — checked below as special case
  ],
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function validateTransformedRow(
  transformed: Record<string, unknown>,
  entityType: EntityType,
  entityConfig?: EntityMappingConfig,
  context?: { portfolioId?: string }
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Apply entity-level default rules
  const defaults = ENTITY_DEFAULT_RULES[entityType] ?? [];
  for (const { field, rule } of defaults) {
    const value = transformed[field];
    // Skip non-required rules when field is absent
    if (rule.rule !== 'required' && (value === null || value === undefined || value === '')) {
      continue;
    }
    const err = applyRule(field, value, rule);
    if (err) errors.push(err);
  }

  // Special case for users: require email OR matched_existing_user_id
  if (entityType === 'users') {
    const hasEmail = transformed['raw_data.email'] || transformed['email'];
    const hasUserId = transformed['matched_existing_user_id'];
    if (!hasEmail && !hasUserId) {
      errors.push({
        field: 'email',
        message: 'Either email or matched_existing_user_id is required',
        severity: 'error',
        rule: 'required',
      });
    }
  }

  // 2. Apply field-level rules from entityConfig if provided
  if (entityConfig) {
    for (const [field, fieldConfig] of Object.entries(entityConfig.field_map)) {
      const value = transformed[field];
      const isEmpty = value === null || value === undefined || value === '';

      // Config-level required
      if (fieldConfig.required && isEmpty) {
        // Only add if not already caught by defaults
        const alreadyCaught = errors.some((e) => e.field === field && e.rule === 'required');
        if (!alreadyCaught) {
          errors.push({
            field,
            message: 'Field is required',
            severity: 'error',
            rule: 'required',
            value,
          });
        }
        continue;
      }

      if (isEmpty) continue;

      // Config-level rules
      if (fieldConfig.rules) {
        for (const rule of fieldConfig.rules) {
          const err = applyRule(field, value, rule);
          if (err) errors.push(err);
        }
      }
    }
  }

  void context; // reserved for future portfolio-level validation

  return errors;
}
