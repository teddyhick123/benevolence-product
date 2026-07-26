// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const publicRouteSrc = readFileSync('app/api/tax/cpa/[token]/route.ts', 'utf8');
const downloadRouteSrc = readFileSync('app/api/tax/cpa/[token]/download/route.ts', 'utf8');
const publicAccessSrc = readFileSync('lib/tax/cpa-public-access.ts', 'utf8');
const pageSrc = readFileSync('app/tax/cpa/[token]/page.tsx', 'utf8');

describe('CPA public portal contract', () => {
  it('rate-limits the public portal endpoint by IP', () => {
    expect(publicRouteSrc).toContain('cpaPortalLimiter');
    expect(publicRouteSrc).toContain('getIP(req)');
  });

  it('rate-limits download endpoint by IP', () => {
    expect(downloadRouteSrc).toContain('cpaPortalLimiter');
    expect(downloadRouteSrc).toContain('getIP(req)');
  });

  it('hashes raw bearer token before DB lookup', () => {
    expect(publicAccessSrc).toContain('hashShareToken(token)');
    expect(publicAccessSrc).toMatch(/\.eq\('share_token',\s*tokenHash\)/);
  });

  it('uses timing-safe comparison for token hash validation', () => {
    expect(publicAccessSrc).toContain('crypto.timingSafeEqual');
  });

  it('never exposes the persisted share_token hash in public payloads', () => {
    expect(publicAccessSrc).toContain('sanitizeLink');
    expect(publicAccessSrc).not.toMatch(/share:\s*link/);
  });

  it('logs CPA views and downloads', () => {
    expect(publicAccessSrc).toContain("rpc('record_cpa_access'");
    expect(publicAccessSrc).toContain('download_form8283');
    expect(publicAccessSrc).toContain('download_turbotax');
    expect(publicAccessSrc).toContain('download_document');
  });

  it('revalidates share links around admin-client payload reads', () => {
    expect(publicAccessSrc).toContain('async function refreshValidCPAShareLink');
    expect(publicAccessSrc).toMatch(/const refreshed = await refreshValidCPAShareLink\(supabase, link\)/);
    expect(publicAccessSrc).toMatch(/const finalRefresh = await refreshValidCPAShareLink\(supabase, activeLink\)/);
    expect(publicAccessSrc).toMatch(/const finalRefresh = await refreshValidCPAShareLink\(supabase, link\)/);
    expect(publicAccessSrc).toContain('share: sanitizeLink(finalRefresh.link)');
  });

  it('public page fetches the public API route', () => {
    expect(pageSrc).toContain('/api/tax/cpa/');
  });
});
// Integration test.
