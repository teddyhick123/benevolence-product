// @vitest-environment node

// lib/__tests__/tax-schema-contract.test.ts
//
// DB schema contract tests for the tax module.
// Focuses on gaps not already covered in app/api/__tests__/schema-contract.test.ts:
//
//   - All core tax tables have RLS enabled
//   - All core tax tables have a service_role policy
//   - Tax views are explicit security_invoker views
//   - tax_carryforwards table has amount_remaining column (canonical carryforward source)
//   - v_active_carryforwards view exists
//
// What is already covered in schema-contract.test.ts (not duplicated here):
//   - owner_tax_profiles removal from migrations and app source
//   - get_donation_capacity uses plpgsql with can_view_portfolio guard
//   - tax-documents storage bucket is private
//   - CPA sharing tables (cpa_share_links, cpa_access_logs)
//   - Contribution type enum alignment across tax_contributions and daf_grants
//   - All canonical views exist (v_tax_contributions_enriched, v_portfolio_tax_summary, etc.)

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'db/migrations');

let migrationsSrc: string;

beforeAll(() => {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  migrationsSrc = files
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n');
});

// ── RLS enabled ──────────────────────────────────────────────────────────────

describe('Tax schema contract: RLS enabled on all core tax tables', () => {
  const TAX_TABLES = [
    'tax_profiles',
    'tax_years',
    'tax_contributions',
    'holding_contributions',
    'tax_carryforwards',
    'tax_carryforward_applications',
    'daf_grants',
    'foundation_990pf_data',
    'tax_documents',
  ];

  for (const table of TAX_TABLES) {
    it(`${table} has ENABLE ROW LEVEL SECURITY`, () => {
      expect(migrationsSrc).toMatch(
        new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
      );
    });
  }
});

// ── Service-role policies ─────────────────────────────────────────────────────

describe('Tax schema contract: service_role policies on all core tax tables', () => {
  const TAX_TABLES = [
    'tax_profiles',
    'tax_years',
    'tax_contributions',
    'holding_contributions',
    'tax_carryforwards',
    'tax_carryforward_applications',
    'daf_grants',
    'foundation_990pf_data',
    'tax_documents',
  ];

  for (const table of TAX_TABLES) {
    it(`${table} has a FOR ALL TO service_role policy`, () => {
      expect(migrationsSrc).toMatch(
        new RegExp(
          `ON\\s+(?:public\\.)?${table}\\s+FOR\\s+ALL\\s+TO\\s+service_role`,
          'i'
        )
      );
    });
  }
});

// ── Views: explicit security invoker ─────────────────────────────────────────

describe('Tax schema contract: tax views are explicit SECURITY INVOKER views', () => {
  // Postgres views are SECURITY DEFINER by default. Tax views expose sensitive
  // AGI, contribution, carryforward, and document-derived data, so they must be
  // created with security_invoker = true to preserve base-table RLS.
  const TAX_VIEWS = [
    'v_tax_contributions_enriched',
    'v_tax_contributions_with_limits',
    'v_tax_deduction_summary',
    'v_portfolio_tax_summary',
    'v_carryforward_schedule',
    'v_active_carryforwards',
  ];

  for (const view of TAX_VIEWS) {
    it(`${view} uses WITH (security_invoker = true)`, () => {
      expect(migrationsSrc).toMatch(
        new RegExp(
          `CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+public\\.${view}\\s+WITH\\s*\\(\\s*security_invoker\\s*=\\s*true\\s*\\)\\s+AS`,
          'i'
        )
      );
    });
  }
});

describe('Tax schema contract: tax contribution view derived fields', () => {
  it('v_tax_contributions_enriched exposes computed substantiation_status', () => {
    const viewStart = migrationsSrc.indexOf('CREATE OR REPLACE VIEW public.v_tax_contributions_enriched');
    expect(viewStart).toBeGreaterThan(-1);
    const viewBlock = migrationsSrc.slice(viewStart, viewStart + 2500);
    expect(viewBlock).toContain('AS substantiation_status');
  });

  it('large non-cash compliance requires both acknowledgment and appraisal', () => {
    const viewStart = migrationsSrc.indexOf('CREATE OR REPLACE VIEW public.v_tax_contributions_enriched');
    const viewBlock = migrationsSrc.slice(viewStart, viewStart + 3000);
    expect(viewBlock).toMatch(/tc\.acknowledgment_received[\s\S]{0,120}tc\.appraisal_storage_path IS NOT NULL[\s\S]{0,120}THEN true/i);
  });
});

// ── tax_carryforwards shape ──────────────────────────────────────────────────

describe('Tax schema contract: tax_carryforwards canonical shape', () => {
  it('tax_carryforwards table has amount_remaining column', () => {
    // amount_remaining is the canonical remaining-amount field.
    // It must exist in the table definition (not just in a view alias).
    expect(migrationsSrc).toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.tax_carryforwards[\s\S]{0,2000}amount_remaining\s+NUMERIC/i
    );
  });

  it('tax_carryforwards has amount column (the original deduction amount)', () => {
    expect(migrationsSrc).toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.tax_carryforwards[\s\S]{0,2000}\bamount\s+NUMERIC/i
    );
  });

  it('tax_carryforwards amount_remaining <= amount constraint exists', () => {
    // Ensures the DB enforces amount_remaining does not exceed the original amount
    expect(migrationsSrc).toMatch(
      /tax_carryforwards[\s\S]{0,3000}amount_remaining[\s\S]{0,200}amount_remaining\s*<=\s*amount/i
    );
  });

  it('tax_carryforward_applications table records year-specific applications', () => {
    expect(migrationsSrc).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.tax_carryforward_applications/i);
    expect(migrationsSrc).toMatch(/carryforward_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.tax_carryforwards\(id\)/i);
    expect(migrationsSrc).toMatch(/applied_tax_year\s+INTEGER\s+NOT\s+NULL/i);
    expect(migrationsSrc).toMatch(/amount_applied\s+NUMERIC\(20,2\)\s+NOT\s+NULL\s+CHECK\s+\(amount_applied\s+>\s+0\)/i);
    expect(migrationsSrc).toMatch(/UNIQUE\s+\(carryforward_id,\s*applied_tax_year\)/i);
  });

  it('replace_tax_carryforward_applications persists applications and updates remaining balances atomically', () => {
    const fnStart = migrationsSrc.indexOf('CREATE OR REPLACE FUNCTION public.replace_tax_carryforward_applications');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBlock = migrationsSrc.slice(fnStart, fnStart + 5000);

    expect(fnBlock).toContain('DELETE FROM public.tax_carryforward_applications');
    expect(fnBlock).toContain('INSERT INTO public.tax_carryforward_applications');
    expect(fnBlock).toContain('UPDATE public.tax_carryforwards');
    expect(fnBlock).toContain('FOR UPDATE');
    expect(fnBlock).toContain('amount_remaining');
    expect(migrationsSrc).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.replace_tax_carryforward_applications/i);
  });
});

// ── v_active_carryforwards existence ─────────────────────────────────────────

describe('Tax schema contract: v_active_carryforwards view', () => {
  it('v_active_carryforwards view is created in migrations', () => {
    expect(migrationsSrc).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_active_carryforwards/i);
  });

  it('v_active_carryforwards filters to amount_remaining > 0', () => {
    const viewStart = migrationsSrc.indexOf('CREATE OR REPLACE VIEW public.v_active_carryforwards');
    expect(viewStart).toBeGreaterThan(-1);
    const viewBlock = migrationsSrc.slice(viewStart, viewStart + 600);
    expect(viewBlock).toContain('amount_remaining > 0');
  });

  it('v_active_carryforwards filters out expired carryforwards', () => {
    const viewStart = migrationsSrc.indexOf('CREATE OR REPLACE VIEW public.v_active_carryforwards');
    const viewBlock = migrationsSrc.slice(viewStart, viewStart + 600);
    expect(viewBlock).toContain('expires_tax_year');
  });
});

// ── Application code does not reference stale schema items ───────────────────

describe('Tax schema contract: application does not use stale tax schema', () => {
  let appSrc: string;

  beforeAll(() => {
    function walkDir(dir: string): string[] {
      const files: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (['__tests__', '.next', 'node_modules'].includes(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...walkDir(fullPath));
          } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            files.push(fullPath);
          }
        }
      } catch {
        // directory doesn't exist
      }
      return files;
    }

    const files = ['app', 'lib', 'components'].flatMap((d) =>
      walkDir(path.join(ROOT, d))
    );
    appSrc = files
      .map((f) => {
        try {
          return fs.readFileSync(f, 'utf-8');
        } catch {
          return '';
        }
      })
      .join('\n');
  });

  it('application source does not reference removed is_carryforward column on tax_contributions', () => {
    // is_carryforward existed in early drafts but was replaced by the
    // tax_carryforwards table with amount_remaining. The column still exists
    // on the table as a legacy flag, but application queries must NOT
    // use it as the primary carryforward data source.
    // Check that no queries filter by is_carryforward
    expect(appSrc).not.toMatch(/\.eq\(['"]is_carryforward['"]/);
    expect(appSrc).not.toMatch(/where.*is_carryforward\s*=/i);
  });

  it('application source does not query owner_tax_profiles', () => {
    expect(appSrc).not.toContain('owner_tax_profiles');
  });
});
