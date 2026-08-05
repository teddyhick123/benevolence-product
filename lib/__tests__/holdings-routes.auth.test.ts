// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('holding route auth contracts', () => {
  it('holding news resolves the holding portfolio and checks view access', () => {
    const src = readFileSync('app/api/holdings/[id]/news/route.ts', 'utf8');
    expect(src).toContain("select('portfolio_id')");
    expect(src).toContain("rpc('can_view_portfolio'");
    expect(src).toContain("'Cache-Control': 'no-store'");
    expect(src).not.toContain('s-maxage');
  });

  it('contact photo upload requires edit access, stores a stable path, and cleans up failures', () => {
    const src = readFileSync('app/api/holdings/[id]/upload-contact-photo/route.ts', 'utf8');
    expect(src).toContain("select('portfolio_id')");
    expect(src).toContain("rpc('can_edit_portfolio'");
    expect(src).toContain('primary_contact_photo: filePath');
    expect(src).toContain('createSignedUrl(filePath, 3600)');
    expect(src).toMatch(/storage\.from\('holdings'\)\.remove\(\[filePath\]\)/);
    expect(src).toContain("'Cache-Control': 'no-store'");
  });

  it('holding page resolves stored contact photo paths to signed URLs for display', () => {
    const page = readFileSync('components/holdings/detail/HoldingDetailPage.tsx', 'utf8');
    const queries = readFileSync('lib/holdings/detail/queries.ts', 'utf8');
    expect(page).toContain('resolveHoldingPhotoUrl');
    expect(queries).toContain("storage.from('holdings')");
    expect(queries).toContain('createSignedUrl(photo, 3600)');
  });

  it('holding charity search requires edit access before external lookup', () => {
    const src = readFileSync('app/api/holdings/[id]/search-charity/route.ts', 'utf8');
    expect(src).toContain("requireHoldingAccess(holdingId, 'member')");
    expect(src).not.toContain('createServerClient');
    expect(src).toContain("'Cache-Control': 'no-store'");
  });

  it('holding financial profile reads require view access and no-store responses', () => {
    const src = readFileSync('app/api/holdings/[id]/financial-profile/route.ts', 'utf8');
    expect(src).toContain("select('id, name, charity_id, portfolio_id')");
    expect(src).toContain('requireHoldingAccess(holdingId)');
    expect(src).not.toContain('createServerClient');
    expect(src).toContain("'Cache-Control': 'no-store'");
  });

  it('holding financial analysis generation requires edit access and AI rate limiting', () => {
    const src = readFileSync('app/api/holdings/[id]/financial-profile/generate/route.ts', 'utf8');
    expect(src).toContain('requireHoldingAccess(holdingId)');
    expect(src).toContain("requireHoldingAccess(holdingId, 'member')");
    expect(src).not.toContain('createServerClient');
    expect(src).toContain('aiLimiter.limit');
    expect(src).toContain("'Cache-Control': 'no-store'");
  });

  it('holding mutation routes require edit access and no-store responses', () => {
    for (const route of [
      'app/api/holdings/[id]/update-basic/route.ts',
      'app/api/holdings/[id]/link-charity/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain("requireHoldingAccess(holdingId, 'member')");
      expect(src, route).toContain("'Cache-Control': 'no-store'");
      expect(src, route).not.toContain("from('portfolio_members')");
      expect(src, route).not.toContain('createServerClient');
    }

    const taxRecord = readFileSync(
      'app/api/holdings/[id]/create-tax-record/route.ts',
      'utf8'
    );
    expect(taxRecord).toContain("rpc('can_edit_portfolio'");
    expect(taxRecord).toContain("'Cache-Control': 'no-store'");
  });

  it('holding charity linking uses normal not-found lookups and checks linked charity reads', () => {
    const src = readFileSync('app/api/holdings/[id]/link-charity/route.ts', 'utf8');
    expect(src).toContain('.maybeSingle()');
    expect(src).toContain('charityError');
  });

  it('holding tax-record creation checks supporting reads before writing tax data', () => {
    const src = readFileSync('app/api/holdings/[id]/create-tax-record/route.ts', 'utf8');
    expect(src).toContain('canEditErr');
    expect(src).toContain('moduleError');
    expect(src).toContain('existingTaxError');
    expect(src).toContain('perfError');
  });
});
