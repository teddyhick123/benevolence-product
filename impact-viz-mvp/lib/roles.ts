export type PortfolioRole = 'viewer'|'editor'|'owner'|'admin';
export const canEdit = (role?: PortfolioRole, explicit?: boolean) =>
  !!explicit || role === 'editor' || role === 'owner' || role === 'admin';

export type OrgRole = 'viewer'|'editor'|'admin';
export const canEditOrg = (role?: OrgRole) =>
  role === 'editor' || role === 'admin';
export const isOrgAdmin = (role?: OrgRole) => role === 'admin';