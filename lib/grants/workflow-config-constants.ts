// lib/grants/workflow-config-constants.ts
export const REQUIRED_FIELD_ALLOWLIST = [
  'purpose',
  'internal_owner_id',
  'requested_amount',
  'approved_amount',
  'grant_period_start',
  'grant_period_end',
  'risk_level',
  'deliverables',
  'reporting_frequency',
] as const;

export type RequiredFieldName = typeof REQUIRED_FIELD_ALLOWLIST[number];

export function getGrantFieldValue(
  grant: Record<string, unknown>,
  fieldName: RequiredFieldName
): unknown {
  return grant[fieldName];
}
