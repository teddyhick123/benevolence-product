import type { DynamicImportClient } from '@/lib/database-client';

export const IMPORT_STAGING_RELATIONS = [
  'staging_import_donors',
  'staging_import_investees',
  'staging_import_holdings',
  'staging_import_contributions',
  'staging_import_metrics',
] as const;

export const IMPORT_TARGET_RELATIONS = [
  'donors',
  'investees',
  'holdings',
  'contributions_received',
  'metric_facts',
] as const;

export type ImportVariableRelation =
  | (typeof IMPORT_STAGING_RELATIONS)[number]
  | (typeof IMPORT_TARGET_RELATIONS)[number];

const IMPORT_VARIABLE_RELATIONS = new Set<string>([
  ...IMPORT_STAGING_RELATIONS,
  ...IMPORT_TARGET_RELATIONS,
]);

/**
 * The import pipeline is the platform's only schema-variable database surface.
 * Every variable relation name must pass this closed allowlist before selection.
 */
export function fromImportRelation(client: DynamicImportClient, relation: string) {
  if (!IMPORT_VARIABLE_RELATIONS.has(relation)) {
    throw new Error(`Import relation is not allowed: ${relation}`);
  }
  return client.from(relation);
}
