import type { User } from '@supabase/supabase-js';
import type { OrgRole } from '@/lib/roles';
import type { SessionClient } from '@/lib/api/server-client';

export type AccessPrincipal =
  | { kind: 'user'; userId: string }
  | { kind: 'cpa_share'; shareLinkId: string }
  | { kind: 'job'; job: string }
  | { kind: 'invitation'; invitationId: string }
  | { kind: 'oauth'; provider: string; subject?: string }
  | { kind: 'public' };

export type UserAccessContext = {
  principal: Extract<AccessPrincipal, { kind: 'user' }>;
  user: User;
  db: SessionClient;
};

export type AppAdminAccessContext = UserAccessContext & {
  isAppAdmin: true;
};

export type OrgAccessContext = UserAccessContext & {
  orgId: string;
  role: OrgRole;
};

export type PortfolioAccessContext = OrgAccessContext & {
  portfolioId: string;
};

export type PortfolioManagerAccessContext =
  | (AppAdminAccessContext & { portfolioId: string })
  | (PortfolioAccessContext & { isAppAdmin: false });

export type CpaShareAccessContext = {
  principal: Extract<AccessPrincipal, { kind: 'cpa_share' }>;
  orgId: string;
  portfolioId: string;
  taxYears: number[];
  permissions: Record<string, boolean>;
};

export type InvitationAccessContext = {
  principal: Extract<AccessPrincipal, { kind: 'invitation' }>;
  orgId: string;
  email: string;
  role: OrgRole;
  status: string;
  expiresAt: string;
};

export type JobAccessContext = {
  principal: Extract<AccessPrincipal, { kind: 'job' }>;
};
