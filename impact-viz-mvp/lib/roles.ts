export type PortfolioRole = 'viewer'|'editor'|'owner'|'admin';
export const canEdit = (role?: PortfolioRole, explicit?: boolean) =>
  !!explicit || role === 'editor' || role === 'owner' || role === 'admin';