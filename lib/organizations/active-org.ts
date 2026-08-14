// Client-side helpers for the x-org-id cookie used to select the active org.

export function getActiveOrgId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find(c => c.startsWith('x-org-id='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

export function setActiveOrgId(orgId: string): void {
  const maxAge = 60 * 60 * 24 * 7; // 7 days — matches middleware
  document.cookie = `x-org-id=${encodeURIComponent(orgId)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function pickActiveOrg<T extends { id: string }>(orgs: T[]): T | undefined {
  if (!orgs.length) return undefined;
  const stored = getActiveOrgId();
  const found = stored ? orgs.find(o => o.id === stored) : undefined;
  return found ?? orgs[0];
}
