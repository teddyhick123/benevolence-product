// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'db/migrations/0060_migrations_ledger.sql'),
  'utf8',
);

describe('applied_migrations schema', () => {
  it('keys on the version string, not a number', () => {
    expect(SQL).toMatch(/version\s+text PRIMARY KEY/);
  });

  it('records a checksum and its provenance', () => {
    expect(SQL).toMatch(/checksum\s+text NOT NULL/);
    expect(SQL).toMatch(/applied_by\s+text NOT NULL CHECK \(applied_by IN \('cli','migrate-client','backfill'\)\)/);
  });

  it('backfills from the Supabase CLI table', () => {
    expect(SQL).toMatch(/INSERT INTO public\.applied_migrations[\s\S]*supabase_migrations\.schema_migrations/);
    expect(SQL).toMatch(/'unverified'/);
  });

  // Without this, the ledger's first act is to declare itself pending and the
  // next runner invocation tries to apply an already-applied migration.
  it('records itself', () => {
    expect(SQL).toMatch(/VALUES\s*\(\s*'0060'/);
  });

  it('lets org admins read but never write', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.applied_migrations ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/FOR SELECT TO authenticated/);
    expect(SQL).toMatch(/is_org_admin\(m\.org_id\)/);
    expect(SQL).not.toMatch(/FOR ALL TO authenticated/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.applied_migrations FROM authenticated/);
  });

  // Picking one arbitrary membership would grant or deny unpredictably for a
  // user who administers one organization and merely belongs to another.
  // Matched against SQL with comments stripped, so an explanatory comment
  // mentioning LIMIT cannot pass or fail this.
  it('tests membership with EXISTS rather than an arbitrary single row', () => {
    const code = SQL.replace(/^\s*--.*$/gm, '');
    expect(code).not.toMatch(/LIMIT\s+1/i);
    expect(code).toMatch(/EXISTS \(\s*SELECT 1 FROM public\.organization_members/);
  });
});
