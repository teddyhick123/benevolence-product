// lib/import/types.ts
// Shared types for the AI-Native Import System

export type EntityType = 'donors' | 'investees' | 'holdings' | 'contributions' | 'metrics';

export type ImportJobStatus =
  | 'pending'
  | 'processing'
  | 'needs_review'
  | 'approved'
  | 'committing'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'rolled_back';

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'warning' | 'skipped';

export type ActionTaken =
  | 'create'
  | 'update'
  | 'skip'
  | 'error'
  | 'manual_review'
  | 'rolled_back'
  | 'pending';

export interface ImportJob {
  id: string;
  org_id: string;
  portfolio_id: string | null;
  name: string;
  source_type: 'blackbaud_api' | 'csv_export' | 'direct_db';
  source_config: Record<string, unknown> | null;
  mapping_profile_id: string | null;
  status: ImportJobStatus;
  total_records_extracted: number;
  records_validated: number;
  records_loaded: number;
  records_failed: number;
  approved_rows: number;
  rejected_rows: number;
  error_rows: number;
  last_heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  reconciliation_data: Record<string, unknown> | null;
  created_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldMappingConfig {
  source: string;
  type: 'string' | 'numeric' | 'date' | 'boolean' | 'enum';
  required?: boolean;
  confidence?: number;
  default?: string | number | boolean | null;
  transform?: 'normalize_ein' | 'slugify';
  values_map?: Record<string, string>;
}

export interface MatchCriteria {
  fields: string[];
  weight: number;
}

export interface EntityMappingConfig {
  source_entity?: string;
  field_map: Record<string, FieldMappingConfig>;
  match_criteria?: MatchCriteria[];
}

export interface MappingProfile {
  id: string;
  org_id: string;
  name: string;
  source_type: 'blackbaud_re_nxt' | 'salesforce_npsp' | 'donorperfect' | 'custom_csv';
  description: string | null;
  entity_mappings: Record<string, EntityMappingConfig>;
  version: number;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGING_TABLE_MAP: Record<EntityType, string> = {
  donors: 'staging_import_donors',
  investees: 'staging_import_investees',
  holdings: 'staging_import_holdings',
  contributions: 'staging_import_contributions',
  metrics: 'staging_import_metrics',
};
