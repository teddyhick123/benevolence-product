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

export type ImportStagingRelation = (typeof IMPORT_STAGING_RELATIONS)[number];
export type ImportTargetRelation = (typeof IMPORT_TARGET_RELATIONS)[number];
export type ImportVariableRelation = ImportStagingRelation | ImportTargetRelation;

const IMPORT_STAGING_RELATION_SET = new Set<string>(IMPORT_STAGING_RELATIONS);
const IMPORT_TARGET_RELATION_SET = new Set<string>(IMPORT_TARGET_RELATIONS);

/**
 * The import pipeline is the platform's only schema-variable database surface.
 * Every variable relation name must pass this closed allowlist before selection.
 */
export function fromImportStagingRelation(client: DynamicImportClient, relation: string) {
  if (!IMPORT_STAGING_RELATION_SET.has(relation)) {
    throw new Error(`Import staging relation is not allowed: ${relation}`);
  }
  return client.from(relation);
}

/** Production targets are isolated from staging operations and allowed only
 * where the loader or rollback workflow explicitly requires them. */
export function fromImportTargetRelation(client: DynamicImportClient, relation: string) {
  if (!IMPORT_TARGET_RELATION_SET.has(relation)) {
    throw new Error(`Import target relation is not allowed: ${relation}`);
  }
  return client.from(relation);
}
