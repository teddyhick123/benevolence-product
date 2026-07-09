import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export type PortfolioRole = 'viewer' | 'member' | 'admin' | 'owner';

const ROLE_RANK: Record<PortfolioRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

export interface PortfolioAccess {
  user: { id: string };
  role: PortfolioRole;
  orgId: string;
}

export interface PortfolioAccessDenied {
  error: NextResponse;
}

/**
 * Verifies the current session user is a member of the given portfolio.
 * Returns { user, role } on success, or { error: NextResponse } on failure.
 *
 * Usage:
 *   const access = await requirePortfolioAccess(portfolioId);
 *   if (isAccessDenied(access)) return access.error;
 *   const { user, role } = access;
 */
export async function requirePortfolioAccess(
  portfolioId: string,
  options: { minRole?: PortfolioRole } = {}
): Promise<PortfolioAccess | PortfolioAccessDenied> {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role, portfolios!inner(org_id)')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!membership) {
    return { error: json({ error: 'Access denied' }, { status: 403 }) };
  }

  const portfolio = Array.isArray(membership.portfolios)
    ? membership.portfolios[0]
    : membership.portfolios;
  const orgId = portfolio?.org_id;
  if (!orgId) {
    return { error: json({ error: 'Access denied' }, { status: 403 }) };
  }

  const { data: orgMembership, error: orgMembershipError } = await supabase
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .not('accepted_at', 'is', null)
    .maybeSingle();

  if (orgMembershipError) {
    return { error: json({ error: orgMembershipError.message }, { status: 500 }) };
  }
  if (!orgMembership) {
    return { error: json({ error: 'Access denied' }, { status: 403 }) };
  }

  const role = membership.role as PortfolioRole;

  if (options.minRole && ROLE_RANK[role] < ROLE_RANK[options.minRole]) {
    return {
      error: json(
        { error: `Requires ${options.minRole} role or higher` },
        { status: 403 }
      ),
    };
  }

  return { user, role, orgId };
}

export function isAccessDenied(
  result: PortfolioAccess | PortfolioAccessDenied
): result is PortfolioAccessDenied {
  return 'error' in result;
}
