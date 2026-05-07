import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export type PortfolioRole = 'viewer' | 'member' | 'admin' | 'owner';

const ROLE_RANK: Record<PortfolioRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export interface PortfolioAccess {
  user: { id: string };
  role: PortfolioRole;
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
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  const role = membership.role as PortfolioRole;

  if (options.minRole && ROLE_RANK[role] < ROLE_RANK[options.minRole]) {
    return {
      error: NextResponse.json(
        { error: `Requires ${options.minRole} role or higher` },
        { status: 403 }
      ),
    };
  }

  return { user, role };
}

export function isAccessDenied(
  result: PortfolioAccess | PortfolioAccessDenied
): result is PortfolioAccessDenied {
  return 'error' in result;
}
