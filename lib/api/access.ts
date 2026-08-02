import type { NextResponse } from 'next/server';
import { hasOrgRole, isOrgRole, type OrgRole } from '@/lib/roles';
import { createServerClient } from '@/lib/api/server-client';
import { jsonError } from '@/lib/api/responses';
import type {
  AppAdminAccessContext,
  CpaShareAccessContext,
  InvitationAccessContext,
  JobAccessContext,
  OrgAccessContext,
  PortfolioAccessContext,
  UserAccessContext,
} from '@/lib/api/principals';
import {
  resolveCpaToken,
  type CpaShareRepository,
} from '@/lib/api/repositories/cpa-share';
import {
  resolveInvitationToken,
  type PublicInvitationRepository,
} from '@/lib/api/repositories/public-invitations';

export type AccessDenialReason =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'gone'
  | 'infrastructure';

export type AccessDenied = {
  ok: false;
  reason: AccessDenialReason;
  response: NextResponse<{ error: string }>;
};

export type AccessGranted<T> = { ok: true; context: T };
export type AccessResult<T> = AccessGranted<T> | AccessDenied;

export type CpaTokenAccessContext = CpaShareAccessContext & {
  repository: CpaShareRepository;
};

export type InvitationTokenAccessContext = InvitationAccessContext & {
  repository: PublicInvitationRepository;
};

export function isAccessDenied<T>(result: AccessResult<T>): result is AccessDenied {
  return !result.ok;
}

function denied(reason: AccessDenialReason, message: string, status: number): AccessDenied {
  return { ok: false, reason, response: jsonError(message, status) };
}

async function authenticatedSession() {
  const db = await createServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return denied('unauthenticated', 'Unauthorized', 401);
  return {
    ok: true as const,
    context: {
      db,
      user,
      principal: { kind: 'user' as const, userId: user.id },
    },
  };
}

export async function requireUserAccess(): Promise<AccessResult<UserAccessContext>> {
  return authenticatedSession();
}

export function requireJobAccess(
  request: Pick<Request, 'headers'>,
  job: string
): AccessResult<JobAccessContext> {
  const authorization = request.headers.get('authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;
  const suppliedSecret = request.headers.get('x-job-secret') ?? bearerToken;
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret || !suppliedSecret || suppliedSecret !== configuredSecret) {
    return denied('unauthenticated', 'Unauthorized', 401);
  }

  return {
    ok: true,
    context: { principal: { kind: 'job', job } },
  };
}

export async function requireAppAdmin(): Promise<AccessResult<AppAdminAccessContext>> {
  const session = await authenticatedSession();
  if (!session.ok) return session;

  const { data: isAppAdmin, error } = await session.context.db.rpc('is_app_admin');
  if (error) return denied('infrastructure', error.message, 500);
  if (!isAppAdmin) return denied('forbidden', 'Forbidden', 403);

  return {
    ok: true,
    context: { ...session.context, isAppAdmin: true },
  };
}

export async function requireOrgAccess(
  orgId: string,
  minRole: OrgRole = 'viewer'
): Promise<AccessResult<OrgAccessContext>> {
  const session = await authenticatedSession();
  if (!session.ok) return session;

  const { data: rawRole, error } = await session.context.db.rpc('user_org_role', {
    p_org_id: orgId,
  });
  if (error) return denied('infrastructure', error.message, 500);
  if (!isOrgRole(rawRole) || !hasOrgRole(rawRole, minRole)) {
    return denied('forbidden', 'Forbidden', 403);
  }

  return {
    ok: true,
    context: { ...session.context, orgId, role: rawRole },
  };
}

export async function requirePortfolioAccess(
  portfolioId: string,
  minRole: OrgRole = 'viewer'
): Promise<AccessResult<PortfolioAccessContext>> {
  const session = await authenticatedSession();
  if (!session.ok) return session;

  const { data: membership, error: membershipError } = await session.context.db
    .from('portfolio_members')
    .select('role, portfolios!inner(org_id)')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', session.context.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (membershipError) return denied('infrastructure', membershipError.message, 500);
  if (!membership || !isOrgRole(membership.role) || !hasOrgRole(membership.role, minRole)) {
    return denied('forbidden', 'Access denied', 403);
  }

  const portfolio = Array.isArray(membership.portfolios)
    ? membership.portfolios[0]
    : membership.portfolios;
  const orgId = portfolio?.org_id;
  if (!orgId) return denied('forbidden', 'Access denied', 403);

  const { data: orgMembership, error: orgMembershipError } = await session.context.db
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', session.context.user.id)
    .is('deleted_at', null)
    .not('accepted_at', 'is', null)
    .maybeSingle();

  if (orgMembershipError) return denied('infrastructure', orgMembershipError.message, 500);
  if (!orgMembership) return denied('forbidden', 'Access denied', 403);

  return {
    ok: true,
    context: {
      ...session.context,
      orgId,
      portfolioId,
      role: membership.role,
    },
  };
}

export async function requireCpaToken(
  token: string
): Promise<AccessResult<CpaTokenAccessContext>> {
  const resolved = await resolveCpaToken(token);
  if (!resolved.ok) {
    const reason: AccessDenialReason = resolved.status === 404
      ? 'not_found'
      : resolved.status === 410
        ? 'gone'
        : 'infrastructure';
    return denied(reason, resolved.error, resolved.status);
  }

  return {
    ok: true,
    context: {
      ...resolved.context,
      repository: resolved.repository,
    },
  };
}

export async function requireInvitationToken(
  token: string
): Promise<AccessResult<InvitationTokenAccessContext>> {
  const resolved = await resolveInvitationToken(token);
  if (!resolved.ok) {
    return denied(
      resolved.status === 404 ? 'not_found' : 'infrastructure',
      resolved.error,
      resolved.status
    );
  }

  return {
    ok: true,
    context: {
      ...resolved.context,
      repository: resolved.repository,
    },
  };
}
