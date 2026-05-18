// lib/__tests__/tax-schema-contract.test.ts
//
// DB schema contract tests for the tax module.
// Focuses on gaps not already covered in app/api/__tests__/schema-contract.test.ts:
//
//   - All core tax tables have RLS enabled
//   - All core tax tables have a service_role policy
//   - Tax views are NOT declared SECURITY DEFINER (security invoker by default)
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

// ── Views: no SECURITY DEFINER ───────────────────────────────────────────────

describe('Tax schema contract: tax views are not SECURITY DEFINER', () => {
  // Postgres views are security invoker by default; explicit SECURITY DEFINER
  // would let the view bypass RLS, which is not what we want.
  const TAX_VIEWS = [
    'v_tax_contributions_enriched',
    'v_tax_contributions_with_limits',
    'v_tax_deduction_summary',
    'v_portfolio_tax_summary',
    'v_carryforward_schedule',
    'v_active_carryforwards',
  ];

  for (const view of TAX_VIEWS) {
    it(`${view} is not declared with SECURITY DEFINER`, () => {
      // Find the CREATE OR REPLACE VIEW block and check it has no SECURITY DEFINER
      // We look for the pattern "CREATE ... VIEW <name> ... SECURITY DEFINER"
      // within a reasonable lookahead window after the view definition starts.
      const viewStart = migrationsSrc.indexOf(`CREATE OR REPLACE VIEW public.${view}`);
      expect(viewStart, `view ${view} must exist in migrations`).toBeGreaterThan(-1);

      // Check the next 500 characters after the view definition start
      const window = migrationsSrc.slice(viewStart, viewStart + 500);
      expect(window).not.toMatch(/SECURITY\s+DEFINER/i);
    });
  }
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
