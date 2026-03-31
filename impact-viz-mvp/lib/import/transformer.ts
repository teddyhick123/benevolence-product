// lib/import/transformer.ts
// Applies field mapping from import_mapping_profiles to raw staging data

import type { EntityMappingConfig, FieldMappingConfig } from './types';

export interface TransformResult {
  transformed: Record<string, unknown>;
  warnings: Array<{ field: string; message: string }>;
}

function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : v;
  }

  // Try MM/DD/YYYY or M/D/YYYY
  const mdyMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
    if (!isNaN(date.getTime())) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // Try YYYYMMDD
  if (/^\d{8}$/.test(v)) {
    const y = v.slice(0, 4);
    const m = v.slice(4, 6);
    const d = v.slice(6, 8);
    const date = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!isNaN(date.getTime())) {
      return `${y}-${m}-${d}`;
    }
  }

  // Try native Date parsing as fallback
  const date = new Date(v);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

function normalizeEin(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.padStart(9, '0');
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function coerceValue(
  raw: string,
  config: FieldMappingConfig
): { value: unknown; warning?: string } {
  const trimmed = raw?.trim() ?? '';

  switch (config.type) {
    case 'string':
      return { value: trimmed || null };

    case 'numeric': {
      if (!trimmed) return { value: null };
      const cleaned = trimmed.replace(/[$,]/g, '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) {
        return { value: null, warning: `Could not parse "${trimmed}" as numeric` };
      }
      return { value: num };
    }

    case 'date': {
      if (!trimmed) return { value: null };
      const parsed = parseDate(trimmed);
      if (!parsed) {
        return { value: null, warning: `Could not parse "${trimmed}" as date` };
      }
      return { value: parsed };
    }

    case 'boolean': {
      const lower = trimmed.toLowerCase();
      return { value: ['yes', 'true', '1'].includes(lower) };
    }

    case 'enum': {
      if (!trimmed) return { value: null };
      if (config.values_map) {
        const mapped = config.values_map[trimmed];
        if (mapped !== undefined) return { value: mapped };
        // Try case-insensitive lookup
        const key = Object.keys(config.values_map).find(
          (k) => k.toLowerCase() === trimmed.toLowerCase()
        );
        if (key) return { value: config.values_map[key] };
      }
      return { value: trimmed.toLowerCase().trim() };
    }

    default:
      return { value: trimmed || null };
  }
}

export function applyFieldMapping(
  rawData: Record<string, string>,
  entityConfig: EntityMappingConfig
): TransformResult {
  const transformed: Record<string, unknown> = {};
  const warnings: Array<{ field: string; message: string }> = [];

  for (const [targetField, fieldConfig] of Object.entries(entityConfig.field_map)) {
    const rawValue = rawData[fieldConfig.source] ?? '';
    const isEmpty = rawValue === null || rawValue === undefined || rawValue.trim() === '';

    // Apply default if value is empty
    if (isEmpty) {
      transformed[targetField] = fieldConfig.default ?? null;
      continue;
    }

    const { value, warning } = coerceValue(rawValue, fieldConfig);
    let finalValue = value;

    // Apply transforms
    if (fieldConfig.transform && typeof finalValue === 'string') {
      if (fieldConfig.transform === 'normalize_ein') {
        finalValue = normalizeEin(finalValue);
      } else if (fieldConfig.transform === 'slugify') {
        finalValue = slugify(finalValue);
      }
    }

    transformed[targetField] = finalValue;

    if (warning) {
      warnings.push({ field: targetField, message: warning });
    }
  }

  return { transformed, warnings };
}
