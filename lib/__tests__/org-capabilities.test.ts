import { describe, expect, it, vi } from 'vitest';
import { canReviewImplementation, userHasOrgCapability } from '@/lib/org-capabilities';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

function client({ isAppAdmin, hasCapability }: { isAppAdmin: boolean; hasCapability: boolean }) {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'is_app_admin') return { data: isAppAdmin, error: null };
      if (fn === 'user_has_org_capability') return { data: hasCapability, error: null };
      return { data: null, error: null };
    }),
  } as any;
}

describe('implementation reviewer capability', () => {
  it('permits a granted org implementation reviewer', async () => {
    expect(await canReviewImplementation(client({ isAppAdmin: false, hasCapability: true }), ORG_ID)).toBe(true);
  });

  it('permits an app admin without an org capability row', async () => {
    expect(await canReviewImplementation(client({ isAppAdmin: true, hasCapability: false }), ORG_ID)).toBe(true);
  });

  it('denies an org admin without the capability', async () => {
    const supabase = client({ isAppAdmin: false, hasCapability: false });
    expect(await userHasOrgCapability(supabase, ORG_ID, 'implementation_reviewer')).toBe(false);
    expect(await canReviewImplementation(supabase, ORG_ID)).toBe(false);
  });
});
