// lib/import/transformer.ts
// Applies field mapping from import_mapping_profiles to raw staging data

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntityMappingConfig, FieldMappingConfig, EntityType } from './types';
import { normalizeEIN } from './utils/normalize-ein';
import { parseFlexibleDate, deriveTaxYear } from './utils/date-parser';

export interface TransformResult {
  transformed: Record<string, unknown>;
  warnings: Array<{ field: string; message: string }>;
}

export interface EnrichmentResult {
  charityId?: string;
  charityName?: string;
  charityData?: Record<string, unknown>;
  geocoded?: { lat: number; lon: number; city?: string; state?: string };
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
      const parsed = parseFlexibleDate(trimmed);
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

    if (isEmpty) {
      transformed[targetField] = fieldConfig.default ?? null;
      continue;
    }

    const { value, warning } = coerceValue(rawValue, fieldConfig);
    let finalValue = value;

    // Apply transforms using utility functions
    if (fieldConfig.transform && typeof finalValue === 'string') {
      if (fieldConfig.transform === 'normalize_ein') {
        finalValue = normalizeEIN(finalValue);
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

// ---------------------------------------------------------------------------
// Enrichment step
// ---------------------------------------------------------------------------

export async function enrichTransformedRow(
  supabase: SupabaseClient,
  entityType: EntityType,
  transformed: Record<string, unknown>
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {};

  // EIN → Charity lookup
  const ein = (transformed['ein'] ?? transformed['recipient_ein']) as string | null;
  if (ein) {
    const normalizedEin = normalizeEIN(ein);
    if (normalizedEin) {
      const { data: charityByEin } = await supabase
        .from('charities')
        .select('id, name')
        .eq('ein', normalizedEin)
        .single();

      if (charityByEin) {
        result.charityId = charityByEin.id as string;
        result.charityName = charityByEin.name as string;
        result.charityData = {
          charity_id: charityByEin.id,
          charity_match_confidence: 1.0,
          charity_match_method: 'ein_exact',
        };
      }
    }
  }

  // Name → Charity fuzzy match (if no EIN match)
  if (!result.charityId) {
    const nameField = (
      transformed['recipient_name'] ??
      transformed['display_name'] ??
      transformed['name']
    ) as string | null;

    if (nameField) {
      const { data: charityByName } = await supabase
        .from('charities')
        .select('id, name')
        .textSearch('search_vector', nameField.replace(/['"]/g, ''))
        .limit(1)
        .single();

      if (charityByName) {
        result.charityId = charityByName.id as string;
        result.charityName = charityByName.name as string;
        result.charityData = {
          charity_id: charityByName.id,
          charity_match_confidence: 0.85,
          charity_match_method: 'name_fuzzy',
        };
      }
    }
  }

  // Contribution-specific enrichments
  if (entityType === 'contributions') {
    const contributionDate = transformed['contribution_date'] as string | null;

    // Tax year derivation
    if (contributionDate && !transformed['tax_year']) {
      transformed['tax_year'] = deriveTaxYear(contributionDate);
      transformed['_tax_year_derived'] = true;
    }

    // Deductible amount calculation
    if (transformed['deductible_amount'] == null) {
      const amountUsd = (transformed['amount_usd'] as number) ?? 0;
      const quidProQuo = (transformed['quid_pro_quo_value'] as number) ?? 0;
      transformed['deductible_amount'] = amountUsd - quidProQuo;
      transformed['_deductible_amount_derived'] = true;
    }
  }

  return result;
}

/**
 * Merges enrichment metadata into transformed_data under _enrichment key.
 */
export function applyEnrichment(
  transformed: Record<string, unknown>,
  enrichment: EnrichmentResult
): Record<string, unknown> {
  const enrichmentMeta: Record<string, unknown> = {
    charity_id: enrichment.charityId ?? null,
    charity_match_confidence: (enrichment.charityData?.charity_match_confidence as number) ?? null,
    charity_match_method: (enrichment.charityData?.charity_match_method as string) ?? 'none',
    tax_year_derived: transformed['_tax_year_derived'] ?? false,
    deductible_amount_derived: transformed['_deductible_amount_derived'] ?? false,
  };

  // Clean internal flags
  const { _tax_year_derived, _deductible_amount_derived, ...rest } = transformed;
  void _tax_year_derived;
  void _deductible_amount_derived;

  return { ...rest, _enrichment: enrichmentMeta };
}
