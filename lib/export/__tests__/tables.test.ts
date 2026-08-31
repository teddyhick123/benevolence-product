// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, exportableTables, ruleFor } from '@/lib/export/tables';

function tablesOfType(type: 'BASE TABLE' | 'VIEW'): string[] {
  const out = execFileSync('docker', [
    'exec', 'supabase_db_benevolence-walkthrough',
    'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = '${type}'
     ORDER BY table_name`,
  ], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

describe('export table manifest', () => {
  // The guard that keeps the manifest true. A table added later is absent from
  // every client's export until someone classifies it, so failing the build is
  // the only point at which the decision is cheap.
  it('classifies every base table in the database', () => {
    const classified = new Set(EXPORT_TABLES.map(rule => rule.table));
    const missing = tablesOfType('BASE TABLE').filter(name => !classified.has(name));
    expect(missing).toEqual([]);
  });

  it('classifies no table that does not exist', () => {
    const present = new Set(tablesOfType('BASE TABLE'));
    const phantom = EXPORT_TABLES.map(r => r.table).filter(name => !present.has(name));
    expect(phantom).toEqual([]);
  });

  // Views are derived from base tables the archive already carries, and their
  // rows cannot be inserted anywhere.
  it('classifies no views', () => {
    const classified = new Set(EXPORT_TABLES.map(rule => rule.table));
    expect(tablesOfType('VIEW').filter(name => classified.has(name))).toEqual([]);
  });

  it('names each table exactly once', () => {
    const names = EXPORT_TABLES.map(rule => rule.table);
    expect(names.length).toBe(new Set(names).size);
  });

  // Only the organizations table itself is keyed by id; everything else that is
  // directly scoped carries org_id.
  it('scopes org_scoped tables by org_id, except the organization row itself', () => {
    for (const rule of EXPORT_TABLES) {
      if (rule.kind !== 'org_scoped') continue;
      expect(rule.column).toBe(rule.table === 'organizations' ? 'id' : 'org_id');
    }
  });

  it('gives every via_parent rule a parent that is itself exported', () => {
    const exported = new Set(exportableTables().map(rule => rule.table));
    for (const rule of EXPORT_TABLES) {
      if (rule.kind === 'via_parent') expect(exported.has(rule.parent)).toBe(true);
    }
  });

  it('gives every excluded rule a stated reason', () => {
    for (const rule of EXPORT_TABLES) {
      if (rule.kind === 'reference' || rule.kind === 'platform') {
        expect(rule.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('exports only org_scoped and via_parent tables', () => {
    for (const rule of exportableTables()) {
      expect(['org_scoped', 'via_parent']).toContain(rule.kind);
    }
  });

  // A user may belong to several organizations. Exporting profiles wholesale
  // would put other tenants' users into this client's archive - the one failure
  // that turns a sovereignty feature into a breach.
  it("scopes profiles through this organization's membership", () => {
    const rule = ruleFor('profiles');
    expect(rule?.kind).toBe('via_parent');
    if (rule?.kind === 'via_parent') {
      expect(rule.parent).toBe('organization_members');
    }
  });

  it('finds a known table by name', () => {
    expect(ruleFor('holdings')?.kind).toBe('org_scoped');
    expect(ruleFor('applied_migrations')?.kind).toBe('platform');
    expect(ruleFor('nope_not_a_table')).toBeUndefined();
  });
});
