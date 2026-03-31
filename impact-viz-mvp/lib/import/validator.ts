// lib/import/validator.ts
// Validates transformed staging data against field rules

import type { EntityMappingConfig } from './types';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  rule: string;
}

const VALID_CONTRIBUTION_TYPES = new Set([
  'cash',
  'check',
  'wire',
  'stock',
  'crypto',
  'real_estate',
  'other_property',
]);

const EIN_FORMAT_FULL = /^\d{2}-\d{7}$/;
const EIN_FORMAT_DIGITS = /^\d{9}$/;

export function validateTransformedRow(
  transformed: Record<string, unknown>,
  entityConfig: EntityMappingConfig,
  context?: { portfolioId?: string }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const today = new Date();
  const tomorrowMs = today.getTime() + 24 * 60 * 60 * 1000;

  for (const [field, fieldConfig] of Object.entries(entityConfig.field_map)) {
    const value = transformed[field];
    const isEmpty = value === null || value === undefined || value === '';

    // required rule
    if (fieldConfig.required && isEmpty) {
      errors.push({
        field,
        message: `${field} is required`,
        severity: 'error',
        rule: 'required',
      });
      continue;
    }

    if (isEmpty) continue;

    // positive rule for numeric fields
    if (fieldConfig.type === 'numeric' && typeof value === 'number' && value <= 0) {
      errors.push({
        field,
        message: `${field} must be a positive number (got ${value})`,
        severity: 'error',
        rule: 'positive',
      });
    }

    // date_valid rule
    if (fieldConfig.type === 'date' && typeof value === 'string') {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        errors.push({
          field,
          message: `${field} is not a valid date: "${value}"`,
          severity: 'error',
          rule: 'date_valid',
        });
      }
    }

    // ein_format — warning (auto-fixable)
    if (field === 'ein' && typeof value === 'string') {
      if (!EIN_FORMAT_FULL.test(value) && !EIN_FORMAT_DIGITS.test(value)) {
        errors.push({
          field,
          message: `EIN format is unusual: "${value}" (expected XX-XXXXXXX or 9 digits)`,
          severity: 'warning',
          rule: 'ein_format',
        });
      }
    }

    // contribution_type_valid
    if (field === 'contribution_type' && typeof value === 'string') {
      if (!VALID_CONTRIBUTION_TYPES.has(value)) {
        errors.push({
          field,
          message: `contribution_type "${value}" must be one of: ${[...VALID_CONTRIBUTION_TYPES].join(', ')}`,
          severity: 'error',
          rule: 'contribution_type_valid',
        });
      }
    }

    // amount_reasonable — warning for large amounts
    if (field === 'amount_usd' && typeof value === 'number' && value > 10_000_000) {
      errors.push({
        field,
        message: `amount_usd ${value.toLocaleString()} is unusually large (>$10M)`,
        severity: 'warning',
        rule: 'amount_reasonable',
      });
    }

    // date_not_future — warning for future dates on contribution_date
    if (field === 'contribution_date' && typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime()) && d.getTime() > tomorrowMs) {
        errors.push({
          field,
          message: `contribution_date "${value}" is in the future`,
          severity: 'warning',
          rule: 'date_not_future',
        });
      }
    }
  }

  return errors;
}
