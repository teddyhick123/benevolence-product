import { SupabaseClient } from '@supabase/supabase-js';
import { OrgRole } from './roles';

export interface Organization {
  id: string;
  name: string;
  ein: string | null;
  charity_id: string | null;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  user_id: string;
  org_id: string;
  role: OrgRole;
  created_at: string;
  profiles?: { display_name?: string | null } | null;
}

export interface OrganizationHolding {
  organization_id: string;
  holding_id: string;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  holdings?: {
    id: string;
    name: string | null;
    portfolio_id: string | null;
  } | null;
}

/**
 * Get organizations the current user is a member of
 */
export async function getUserOrganizations(supabase: SupabaseClient): Promise<{
  organizations: (Organization & { role: OrgRole })[];
  error: string | null;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { organizations: [], error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      role,
      organizations (*)
    `)
    .eq('user_id', user.id);

  if (error) {
    return { organizations: [], error: error.message };
  }

  const organizations = (data || []).map((row: any) => ({
    ...row.organizations,
    role: row.role as OrgRole,
  }));

  return { organizations, error: null };
}

/**
 * Get organization by ID with member role
 */
export async function getOrganization(
  supabase: SupabaseClient,
  orgId: string
): Promise<{
  organization: Organization | null;
  role: OrgRole | null;
  error: string | null;
}> {
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (orgError) {
    return { organization: null, role: null, error: orgError.message };
  }

  // Get user's role
  const { data: roleData } = await supabase.rpc('user_org_role', { p_org_id: orgId });

  return {
    organization: org,
    role: roleData as OrgRole | null,
    error: null,
  };
}

/**
 * Get organization members
 */
export async function getOrganizationMembers(
  supabase: SupabaseClient,
  orgId: string
): Promise<{
  members: OrganizationMember[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      user_id,
      org_id,
      role,
      created_at,
      profiles:user_id (display_name)
    `)
    .eq('org_id', orgId)
    .order('role', { ascending: true });

  if (error) {
    return { members: [], error: error.message };
  }

  return { members: data as OrganizationMember[], error: null };
}

/**
 * Get holdings linked to organization
 */
export async function getOrganizationHoldings(
  supabase: SupabaseClient,
  orgId: string
): Promise<{
  holdings: OrganizationHolding[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('organization_holdings')
    .select(`
      organization_id,
      holding_id,
      verified_at,
      verified_by,
      created_at,
      holdings (
        id,
        name,
        portfolio_id
      )
    `)
    .eq('organization_id', orgId);

  if (error) {
    return { holdings: [], error: error.message };
  }

  return { holdings: (data || []) as unknown as OrganizationHolding[], error: null };
}

/**
 * Get pending staging facts submitted by organization
 */
export async function getOrgPendingFacts(
  supabase: SupabaseClient,
  orgId: string
): Promise<{
  facts: any[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('staging_metric_facts')
    .select(`
      *,
      holdings (name),
      metrics (name, unit)
    `)
    .eq('submitted_by_org_id', orgId)
    .eq('approved', false)
    .order('created_at', { ascending: false });

  if (error) {
    return { facts: [], error: error.message };
  }

  return { facts: data || [], error: null };
}

/**
 * Get approved facts submitted by organization
 */
export async function getOrgApprovedFacts(
  supabase: SupabaseClient,
  orgId: string
): Promise<{
  facts: any[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('metric_facts')
    .select(`
      *,
      holdings (name),
      metrics (name, unit)
    `)
    .eq('submitted_by_org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    return { facts: [], error: error.message };
  }

  return { facts: data || [], error: null };
}
