export const ORG_ROLES = ['viewer', 'member', 'admin', 'owner'] as const;
export const WORKSPACE_MANAGER_ROLES = ['admin', 'owner'] as const;

export type OrgRole = typeof ORG_ROLES[number];
export type PortfolioRole = OrgRole;

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value);
}

export function hasOrgRole(role: OrgRole | null | undefined, minimum: OrgRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canOperateOrg(role: OrgRole | null | undefined): boolean {
  return hasOrgRole(role, 'member');
}

export function canManageWorkspace(role: OrgRole | null | undefined): boolean {
  return hasOrgRole(role, 'admin');
}

export function canManageOwnership(role: OrgRole | null | undefined): boolean {
  return hasOrgRole(role, 'owner');
}

export function isOrgOperator(role: unknown): role is OrgRole {
  return isOrgRole(role) && canOperateOrg(role);
}

export function isWorkspaceManager(role: unknown): role is OrgRole {
  return isOrgRole(role) && canManageWorkspace(role);
}

export function isOrgOwner(role: unknown): role is OrgRole {
  return isOrgRole(role) && canManageOwnership(role);
}

// Portfolio role responses retain their established `can_edit` behavior.
export const canEdit = (role?: PortfolioRole, explicit?: boolean) =>
  !!explicit || canOperateOrg(role);
