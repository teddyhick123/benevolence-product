import { cookies } from 'next/headers';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { jsonOk } from '@/lib/api/responses';

export async function GET() {
  const c = await cookies();
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return jsonOk({ user: null, portfolios: [] });
  const { db, user } = access.context;

  // Resolve the active organization from a valid membership. Multi-org users
  // select an org through x-org-id; otherwise use their first membership.
  const { data: orgMemberships, error: orgMembershipError } = await db
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (orgMembershipError) {
    return jsonOk({
      user: { id: user.id, email: user.email },
      portfolios: [],
      error: orgMembershipError.message,
    });
  }

  const orgIds = (orgMemberships ?? []).map(membership => membership.org_id);
  const requestedOrgId = c.get('x-org-id')?.value;
  const activeOrgId = requestedOrgId && orgIds.includes(requestedOrgId)
    ? requestedOrgId
    : orgIds[0] ?? null;

  // Fetch memberships -> portfolios
  const { data: memberships, error } = await db
    .from('portfolio_members')
    .select(`
      role,
      portfolios:portfolios (
        id,
        name,
        org_id,
        settings
      )
    `)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (error) {
    return jsonOk({
      user: { id: user.id, email: user.email },
      portfolios: [],
      error: error.message,
    });
  }

  const portfolios = (memberships ?? [])
    .map((m: any) => ({
      id: m?.portfolios?.id,
      name: m?.portfolios?.name,
      org_id: m?.portfolios?.org_id,
      base_currency: m?.portfolios?.settings?.base_currency
        ?? m?.portfolios?.settings?.default_currency
        ?? 'USD',
      role: m?.role,
    }))
    .filter((p: any) => p.id && p.org_id === activeOrgId);
  const recommended_portfolio_id = portfolios[0]?.id ?? null;

  return jsonOk({
    user: { id: user.id, email: user.email },
    portfolios,
    // backward-compatible field expected by some pages
    portfolio_id: recommended_portfolio_id,
    // keep the explicit field as well for newer callers
    recommended_portfolio_id,
    // org membership
    organization_id: activeOrgId,
    error: null,
  });
}
