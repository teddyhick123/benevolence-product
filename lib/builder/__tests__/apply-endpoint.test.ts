import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('admin apply endpoint (retired)', () => {
  const src = readFileSync(
    'app/api/admin/builder/proposals/[proposalId]/apply/route.ts',
    'utf8'
  );

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('returns 410 Gone', () => {
    expect(src).toMatch(/410/);
  });

  it('response body points to org-scoped apply route', () => {
    expect(src).toMatch(/org.*builder.*apply|apply.*org.*builder/i);
  });

  it('does NOT write to the filesystem', () => {
    expect(src).not.toMatch(/writeFileSync|writeFile\b/);
  });

  it('does NOT check is_super_admin (no longer needs auth — always 410)', () => {
    expect(src).not.toMatch(/is_super_admin/);
  });
});
