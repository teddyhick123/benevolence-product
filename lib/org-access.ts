import type { User } from '@supabase/supabase-js';
import { hasOrgRole, isOrgRole, type OrgRole } from '@/lib/roles';

type OrgAccessClient = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null } }>;
  };
  rpc: (
    _fn: 'user_org_role',
    _args: { p_org_id: string }
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type OrgAccess = {
  user: User;
  role: OrgRole;
};

export type OrgAccessState = {
  user: User | null;
  role: OrgRole | null;
};

/** Resolves the authenticated user's canonical role for one organization. */
export async function getOrgAccess(
  supabase: OrgAccessClient,
  orgId: string
): Promise<OrgAccessState> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null };

  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!isOrgRole(role)) return { user, role: null };

  return { user, role };
}

export function hasOrgAccess(access: OrgAccessState, minimum: OrgRole): access is OrgAccess {
  return !!access.user && !!access.role && hasOrgRole(access.role, minimum);
}
