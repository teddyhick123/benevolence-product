import type { SupabaseClient } from '@/lib/database-client';

export const ORG_CAPABILITIES = ['implementation_reviewer'] as const;
export type OrgCapability = typeof ORG_CAPABILITIES[number];

export function isOrgCapability(value: unknown): value is OrgCapability {
  return typeof value === 'string' && (ORG_CAPABILITIES as readonly string[]).includes(value);
}

export async function userHasOrgCapability(
  supabase: SupabaseClient,
  orgId: string,
  capability: OrgCapability
): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_has_org_capability', {
    p_org_id: orgId,
    p_capability: capability,
  });
  if (error) return false;
  return data === true;
}

export async function canReviewImplementation(
  supabase: SupabaseClient,
  orgId: string
): Promise<boolean> {
  const [{ data: isAppAdmin }, hasCapability] = await Promise.all([
    supabase.rpc('is_app_admin'),
    userHasOrgCapability(supabase, orgId, 'implementation_reviewer'),
  ]);

  return isAppAdmin === true || hasCapability;
}
