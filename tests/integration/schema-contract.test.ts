// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Directories that are never source code to validate
const EXCLUDED_DIRS = new Set(['__tests__', '.next', 'node_modules', 'graphify-out']);

function walkDir(dir: string, extensions: string[] = ['.ts', '.tsx']): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, extensions));
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function readAllSources(dirs: string[], extensions: string[] = ['.ts', '.tsx']): string {
  const files = dirs
    .flatMap(dir => walkDir(dir, extensions))
    .filter(f => {
      try {
        statSync(f);
        return true;
      } catch {
        return false;
      }
    });

  return files
    .map(f => {
      try {
        return readFileSync(f, 'utf-8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

const appSrc = readAllSources([
  'app',
  'lib',
  'components',
]);

const migrationsSrc = readAllSources(['db/migrations'], ['.sql']);
const moduleRegistrySrc = (() => {
  try {
    return readFileSync('lib/modules/registry.ts', 'utf-8');
  } catch {
    return '';
  }
})();
const backlogSrc = (() => {
  try {
    return readFileSync('docs/module-reviews/FULL-BACKLOG.md', 'utf-8');
  } catch {
    return '';
  }
})();
const agentDocsSrc = ['CLAUDE.md', 'AGENTS.md']
  .map(file => {
    try {
      return readFileSync(file, 'utf-8');
    } catch {
      return '';
    }
  })
  .join('\n');

function extractCreatedRelations(sql: string): Set<string> {
  const relations = new Set<string>();
  const patterns = [
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /CREATE\s+OR\s+REPLACE\s+VIEW\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /CREATE\s+VIEW\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of sql.matchAll(pattern)) {
      relations.add(match[1]);
    }
  }

  return relations;
}

function extractModuleRegistryTables(src: string): Set<string> {
  const tables = new Set<string>();

  for (const block of src.matchAll(/tables:\s*\[([\s\S]*?)\]/g)) {
    for (const table of block[1].matchAll(/['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g)) {
      tables.add(table[1]);
    }
  }

  return tables;
}

describe('Schema contract: RPC function names', () => {
  it('no calls to non-existent org_role RPC', () => {
    expect(appSrc).not.toMatch(/rpc\(['"]org_role['"]/);
  });

  it('no calls to non-existent is_admin RPC', () => {
    expect(appSrc).not.toMatch(/rpc\(['"]is_admin['"]/);
  });

  it('no calls to org_has_module with p_module_id (should be p_module)', () => {
    expect(appSrc).not.toMatch(/p_module_id:/);
  });
});

describe('Schema contract: module storage', () => {
  it('application code does not use removed organization_modules table', () => {
    expect(appSrc).not.toMatch(/from\(['"]organization_modules['"]/);
  });

  it('seed migration does not insert into removed modules table', () => {
    expect(migrationsSrc).not.toMatch(/INSERT\s+INTO\s+public\.modules/i);
  });

  it('agent docs do not describe organization_modules as active storage', () => {
    expect(agentDocsSrc).not.toMatch(/organization_modules` table tracks/i);
  });
});

describe('Schema contract: module registry table metadata', () => {
  const createdRelations = extractCreatedRelations(migrationsSrc);
  const registryTables = extractModuleRegistryTables(moduleRegistrySrc);

  it('has module table metadata to validate', () => {
    expect(registryTables.size).toBeGreaterThan(0);
  });

  it('missing registry table references are explicitly tracked in the backlog', () => {
    const untrackedMissingTables = Array.from(registryTables)
      .filter(table => !createdRelations.has(table))
      .filter(table => !backlogSrc.includes(`\`${table}\``))
      .sort();

    expect(untrackedMissingTables).toEqual([]);
  });
});

describe('Schema contract: prerelease migration cleanup', () => {
  function createTableCount(tableName: string): number {
    const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (migrationsSrc.match(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+(?:public\\.)?${escaped}\\s*\\(`, 'gi')) || []).length;
  }

  it('does not create legacy AI conversation/action-log tables', () => {
    expect(migrationsSrc).not.toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?ai_conversations\s*\(/i);
    expect(migrationsSrc).not.toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?ai_messages\s*\(/i);
    expect(migrationsSrc).not.toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?ai_action_log\s*\(/i);
    expect(migrationsSrc).not.toMatch(/ON\s+ai_action_log\b/i);
  });

  it('defines ai_actions.initiated_by in the canonical ai_actions table', () => {
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_actions[\s\S]*initiated_by\s+TEXT NOT NULL DEFAULT 'ai'/);
    expect(migrationsSrc).not.toMatch(/ALTER\s+TABLE\s+public\.ai_actions\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+initiated_by/i);
  });

  it('creates duplicated historical tables only once in the active schema', () => {
    expect(createTableCount('org_invitations')).toBe(1);
    expect(createTableCount('portfolio_recommendations')).toBe(1);
  });

  it('portfolio recommendations use the active recommendation workflow shape', () => {
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.portfolio_recommendations[\s\S]*organization_name TEXT NOT NULL/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.portfolio_recommendations[\s\S]*interaction_status TEXT NOT NULL DEFAULT 'new'/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.recommendation_status_history[\s\S]*user_id\s+UUID REFERENCES auth\.users\(id\)/);
    expect(migrationsSrc).toMatch(/CREATE OR REPLACE FUNCTION public\.update_recommendation_interaction_status/);
  });

  it('keeps org invitation status in the canonical organization migration', () => {
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS org_invitations[\s\S]*status\s+text NOT NULL DEFAULT 'pending'/);
    expect(migrationsSrc).toMatch(/idx_org_invitations_pending_unique/);
  });

  it('uses the canonical portfolio edit helper and valid Postgres DDL syntax', () => {
    expect(appSrc + migrationsSrc).not.toMatch(/can_modify_portfolio/);
    expect(migrationsSrc).not.toMatch(/CREATE\s+(?:POLICY|TRIGGER)\s+IF\s+NOT\s+EXISTS/i);
  });

  it('defines org_has_module once with all accepted module aliases', () => {
    expect((migrationsSrc.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?org_has_module\s*\(/gi) || []).length).toBe(1);
    expect(migrationsSrc).toMatch(/WHEN 'pledge_tracking'\s+THEN 'pledges'/);
    expect(migrationsSrc).toMatch(/WHEN 'donor_management'\s+THEN 'donors'/);
    expect(migrationsSrc).toMatch(/WHEN 'tax_optimization'\s+THEN 'tax'/);
    expect(migrationsSrc).toMatch(/WHEN 'reporting'\s+THEN 'reports'/);
    expect(migrationsSrc).toMatch(/WHEN 'core'\s+THEN 'portfolio'/);
  });
});

describe('Schema contract: organization membership columns', () => {
  it('organization_members selects use org_id, not organization_id', () => {
    expect(appSrc).not.toMatch(/from\(['"]organization_members['"]\)[\s\S]{0,160}\.select\(\s*['"`][^'"`]*organization_id/);
  });
});

describe('Schema contract: pledge payment accounting', () => {
  it('created payment contributions are donor gifts, not pledge placeholders', () => {
    expect(migrationsSrc).not.toMatch(/p_pledge_id,\s*p_installment_id,\s*true/);
  });

  it('pledge schedule validation does not allow cent drift', () => {
    expect(appSrc).not.toMatch(/Installment amounts must sum to total_amount[\s\S]{0,160}<\s*0\.02/);
    expect(migrationsSrc).not.toMatch(/ABS\(v_inst_sum - p_total_amount\)\s*>\s*0\.01/);
  });
});

describe('Schema contract: column names in donor components', () => {
  // Donor/contributions context: excludes portfolio and tax routes where
  // tax_contributions table legitimately has a contribution_type column,
  // and excludes admin import mapping labels.
  const donorSrc = readAllSources([
    'components/donors',
    'app/org',
    'app/dashboard/donors',
    'app/api/org',
  ]);

  it('no donor_type references (field is is_organization boolean)', () => {
    expect(donorSrc).not.toMatch(/donor_type/);
  });

  it('no contribution_type references (field is gift_type)', () => {
    expect(donorSrc).not.toMatch(/contribution_type/);
  });
});

describe('Schema contract: DB cleanup fixes (2026-05-15)', () => {
  it('recommendation_status_history has no UPDATE policy for authenticated users', () => {
    // rec_status_history is append-only via trigger; UPDATE access breaks audit integrity
    expect(migrationsSrc).not.toMatch(
      /ON\s+public\.recommendation_status_history\s+FOR\s+UPDATE\s+TO\s+authenticated/i
    );
  });

  it('recommendation status notes are inserted by the status RPC, not patched onto history rows', () => {
    expect(appSrc).not.toMatch(
      /from\(['"]recommendation_status_history['"]\)[\s\S]{0,300}\.update\(/i
    );
    expect(appSrc).toMatch(/rpc\(['"]update_recommendation_interaction_status['"]/);
    expect(migrationsSrc).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_recommendation_interaction_status[\s\S]*INSERT INTO public\.recommendation_status_history[\s\S]*notes/i
    );
  });

  it('recommendation comments and favorites writes require parent portfolio visibility', () => {
    expect(migrationsSrc).toMatch(
      /CREATE POLICY "rec_comments_write"[\s\S]{0,900}portfolio_recommendations[\s\S]{0,400}can_view_portfolio/i
    );
    expect(migrationsSrc).toMatch(
      /CREATE POLICY "rec_favorites_write"[\s\S]{0,900}portfolio_recommendations[\s\S]{0,400}can_view_portfolio/i
    );
  });

  it('invitation acceptance enforces invitee email after resolving typed principals', () => {
    expect(appSrc).toMatch(/userAccess\.context\.user\.email\?\.trim\(\)\.toLowerCase\(\)/);
    expect(appSrc).toMatch(/invitation\.email\.trim\(\)\.toLowerCase\(\)/);
    expect(appSrc).toContain('requireInvitationToken');
  });

  it('org_invitations read policy requires caller email match for non-admin access', () => {
    // Without this, any authenticated user can enumerate pending invitations for any org
    expect(migrationsSrc).toMatch(
      /CREATE\s+POLICY\s+"org_invitations: anyone can read by token"[\s\S]{0,800}auth\.jwt\(\)\s*->>\s*'email'/
    );
  });

  it('module_definitions seeds include all active module slugs', () => {
    // grant_management, impact_tracking, analytics, external_data were missing
    expect(migrationsSrc).toMatch(/INSERT\s+INTO\s+(?:public\.)?module_definitions[\s\S]{0,800}'grant_management'/i);
    expect(migrationsSrc).toMatch(/INSERT\s+INTO\s+(?:public\.)?module_definitions[\s\S]{0,800}'impact_tracking'/i);
    expect(migrationsSrc).toMatch(/INSERT\s+INTO\s+(?:public\.)?module_definitions[\s\S]{0,800}'analytics'/i);
    expect(migrationsSrc).toMatch(/INSERT\s+INTO\s+(?:public\.)?module_definitions[\s\S]{0,800}'external_data'/i);
  });

  it('task_events are viewable by org members, not only admins', () => {
    // Regular members need event visibility for tasks assigned to them
    expect(migrationsSrc).not.toMatch(
      /CREATE\s+POLICY\s+"task_events: org admins can view"\s+ON\s+public\.task_events\s+FOR\s+SELECT\s+USING\s*\(\s*public\.is_org_admin/i
    );
    expect(migrationsSrc).toMatch(
      /CREATE\s+POLICY\s+"task_events: org members can view"/
    );
  });

  it('metric_facts composite index uses metric_code, not the generated metric_name alias', () => {
    // metric_name is GENERATED ALWAYS AS (metric_code); index should use the real column
    expect(migrationsSrc).not.toMatch(
      /idx_metric_facts_holding_metric_period[\s\S]{0,500}metric_name/
    );
    expect(migrationsSrc).toMatch(
      /idx_metric_facts_holding_metric_period[\s\S]{0,500}metric_code/
    );
  });

  it('contributions_received has an explicit service_role policy', () => {
    // Every other table has one; consistency prevents surprises in service-client code
    expect(migrationsSrc).toMatch(
      /ON\s+(?:public\.)?contributions_received\s+FOR\s+ALL\s+TO\s+service_role/i
    );
  });

  it('tax contribution routes have matching canonical table columns and views', () => {
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.tax_profiles/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.tax_years/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.tax_contributions[\s\S]*amount_usd\s+NUMERIC/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.tax_contributions[\s\S]*fmv_at_donation\s+NUMERIC/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.tax_contributions[\s\S]*property_description\s+TEXT/);
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.tax_contributions[\s\S]*quid_pro_quo_value\s+NUMERIC/);
    expect(migrationsSrc).toMatch(/CREATE OR REPLACE VIEW public\.v_tax_contributions_enriched/);
    expect(migrationsSrc).toMatch(/CREATE OR REPLACE VIEW public\.v_tax_contributions_with_limits/);
    expect(migrationsSrc).toMatch(/CREATE OR REPLACE VIEW public\.v_portfolio_tax_summary/);
    expect(migrationsSrc).toMatch(/CREATE OR REPLACE FUNCTION public\.get_donation_capacity/);
  });
});

describe('Schema contract: get_donation_capacity security guard', () => {
  it('get_donation_capacity uses plpgsql (not sql) so it can execute the permission guard', () => {
    // A LANGUAGE sql function cannot contain IF/RAISE statements — must be plpgsql
    expect(migrationsSrc).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_donation_capacity[\s\S]{0,600}LANGUAGE\s+plpgsql/i
    );
  });

  it('get_donation_capacity calls can_view_portfolio before returning rows', () => {
    expect(migrationsSrc).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_donation_capacity[\s\S]{0,600}can_view_portfolio\s*\(\s*p_portfolio_id\s*\)/i
    );
  });

  it('get_donation_capacity raises an exception when the caller lacks portfolio access', () => {
    expect(migrationsSrc).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_donation_capacity[\s\S]{0,800}RAISE\s+EXCEPTION[\s\S]{0,200}42501/i
    );
  });
});

describe('Schema contract: tax document storage privacy', () => {
  const uploadRoutePath = 'app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts';
  const uploadRouteSrc = (() => {
    try {
      return readFileSync(uploadRoutePath, 'utf-8');
    } catch {
      return '';
    }
  })();
  const taxRepositorySrc = readFileSync('lib/api/repositories/tax.ts', 'utf-8');

  it('0013_tax_contributions.sql creates the tax-documents storage bucket', () => {
    expect(migrationsSrc).toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
  });

  it('tax-documents bucket is created as private (public = false)', () => {
    // The INSERT into storage.buckets for tax-documents must specify false for the public column
    expect(migrationsSrc).toMatch(/INSERT\s+INTO\s+storage\.buckets[\s\S]{0,200}tax-documents[\s\S]{0,200}false/i);
  });

  it('upload route does not use getPublicUrl (documents must be private)', () => {
    expect(uploadRouteSrc).not.toMatch(/getPublicUrl/);
    expect(taxRepositorySrc).not.toMatch(/getPublicUrl/);
  });

  it('upload route uses createSignedUrl to return private document URLs', () => {
    expect(uploadRouteSrc).toMatch(/createSignedDocumentUrl/);
    expect(taxRepositorySrc).toMatch(/createSignedUrl/);
  });
});

describe('Schema contract: CPA sharing', () => {
  const migPath = join(process.cwd(), 'db/migrations/0043_tax_cpa_sharing.sql');
  const routePath = join(process.cwd(), 'app/api/portfolio/[id]/tax/cpa-share/route.ts');
  const publicRoutePath = join(process.cwd(), 'app/api/tax/cpa/[token]/route.ts');
  const publicDownloadPath = join(process.cwd(), 'app/api/tax/cpa/[token]/download/route.ts');
  const publicPagePath = join(process.cwd(), 'app/tax/cpa/[token]/page.tsx');
  const publicAccessPath = join(process.cwd(), 'lib/api/repositories/cpa-share.ts');
  const helperPath = join(process.cwd(), 'lib/tax/cpa-collaboration.ts');
  let src: string;
  let routeSrc: string;
  let publicRouteSrc: string;
  let publicDownloadSrc: string;
  let publicPageSrc: string;
  let publicAccessSrc: string;
  let helperSrc: string;
  beforeAll(() => {
    src = readFileSync(migPath, 'utf-8');
    routeSrc = readFileSync(routePath, 'utf-8');
    publicRouteSrc = readFileSync(publicRoutePath, 'utf-8');
    publicDownloadSrc = readFileSync(publicDownloadPath, 'utf-8');
    publicPageSrc = readFileSync(publicPagePath, 'utf-8');
    publicAccessSrc = readFileSync(publicAccessPath, 'utf-8');
    helperSrc = readFileSync(helperPath, 'utf-8');
  });

  it('creates cpa_share_links table', () => {
    expect(src).toMatch(/CREATE TABLE.*cpa_share_links/i);
  });

  it('creates cpa_access_logs table', () => {
    expect(src).toMatch(/CREATE TABLE.*cpa_access_logs/i);
  });

  it('stores only a hashed share_token value (no plain token column)', () => {
    expect(src).toContain('share_token');
    expect(src).toMatch(/share_token\s+TEXT\s+NOT NULL UNIQUE[\s\S]{0,120}SHA-256/i);
    // Ensure there is no bare `token` column definition (e.g. `token TEXT NOT NULL`).
    // This deliberately excludes comments and the hashed share_token column.
    expect(src).not.toMatch(/^\s+token\s+\w/m);
  });

  it('CPA share route hashes raw bearer tokens before persistence', () => {
    expect(helperSrc).toMatch(/function\s+hashShareToken/);
    expect(routeSrc).toContain('hashShareToken(shareToken)');
    expect(routeSrc).toMatch(/share_token:\s*tokenHash/);
    expect(routeSrc).not.toMatch(/share_token:\s*shareToken/);
  });

  it('CPA share route does not select persisted token hashes into responses', () => {
    expect(routeSrc).not.toMatch(/from\('cpa_share_links'\)[\s\S]{0,100}\.select\(['"]\*['"]\)/);
    expect(routeSrc).not.toMatch(/\.select\(`[\s\S]{0,300}share_token[\s\S]{0,300}`\)/);
  });

  it('public CPA portal route and page exist', () => {
    expect(publicRouteSrc).toContain('requireCpaToken');
    expect(publicRouteSrc).toContain('repository.getPortalPayload');
    expect(publicDownloadSrc).toContain('repository.createDownload');
    expect(publicPageSrc).toContain('/api/tax/cpa/');
  });

  it('public CPA endpoints are rate limited', () => {
    expect(publicRouteSrc).toContain('cpaPortalLimiter');
    expect(publicDownloadSrc).toContain('cpaPortalLimiter');
  });

  it('public CPA access uses timing-safe hash comparison', () => {
    expect(publicAccessSrc).toContain('crypto.timingSafeEqual');
    expect(publicAccessSrc).toContain('hashShareToken(token)');
  });

  it('public CPA access records audit logs and increments access_count atomically', () => {
    expect(publicAccessSrc).toContain("rpc('record_cpa_access'");
    expect(migrationsSrc).toContain('CREATE OR REPLACE FUNCTION public.record_cpa_access');
    expect(migrationsSrc).toContain('FOR UPDATE');
    expect(migrationsSrc).toContain('access_count = access_count + 1');
    expect(migrationsSrc).toContain('INSERT INTO public.cpa_access_logs');
  });

  it('CPA sharing dashboard is enabled now that the public portal exists', () => {
    const portalSrc = readFileSync(join(process.cwd(), 'components/tax/CPACollaborationPortal.tsx'), 'utf-8');
    expect(portalSrc).toMatch(/const\s+cpaCollaborationEnabled\s*=\s*true/);
  });
});

describe('Schema contract: contribution type normalization', () => {
  const DB_CONTRIBUTION_TYPES = ['cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property'];
  const STALE_TYPES = ['ach', 'art', 'vehicle'];

  const helperSrc = (() => {
    try {
      return readFileSync(join(process.cwd(), 'lib/helpers/tax-holding-link.ts'), 'utf-8');
    } catch {
      return '';
    }
  })();

  it('helper contribution type labels contain no stale types (ach, art, vehicle)', () => {
    for (const staleType of STALE_TYPES) {
      expect(helperSrc).not.toContain(`'${staleType}'`);
    }
  });

  it('helper CONTRIBUTION_TYPE_LABELS covers all canonical DB types', () => {
    for (const dbType of DB_CONTRIBUTION_TYPES) {
      expect(helperSrc).toContain(`'${dbType}'`);
    }
  });

  it('CONTRIBUTION_TYPE_LABELS does not include bare "other" as a key', () => {
    // Extract CONTRIBUTION_TYPE_LABELS block — "other" key would appear as `other:` inside the object literal
    const labelsBlock = helperSrc.match(/CONTRIBUTION_TYPE_LABELS[^=]*=\s*\{([^}]+)\}/)?.[1] ?? '';
    // The key 'other' should not be a top-level key in the labels map
    expect(labelsBlock).not.toMatch(/^\s*other:/m);
    expect(labelsBlock).not.toMatch(/['"]other['"]\s*:/);
  });

  it('daf_grants CHECK constraint uses canonical type set (not legacy cash/stock/crypto/other)', () => {
    // Verify the old stale set is gone
    expect(migrationsSrc).not.toMatch(/contribution_type\s+IN\s*\(\s*'cash',\s*'stock',\s*'crypto',\s*'other'\s*\)/);
  });

  it('daf_grants CHECK constraint includes other_property', () => {
    expect(migrationsSrc).toMatch(
      /daf_grants[\s\S]{0,2000}contribution_type\s+TEXT\s+CHECK\s*\([^)]*'other_property'[^)]*\)/
    );
  });

  it('daf_grants and tax_contributions share the same canonical contribution type set', () => {
    // Both tables should have identical CHECK constraint content
    const canonicalConstraint = `('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property')`;
    const occurrences = (migrationsSrc.match(new RegExp(
      `contribution_type\\s+(?:TEXT\\s+(?:NOT NULL\\s+)?)?CHECK\\s*\\(contribution_type\\s+IN\\s*\\('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property'\\)\\)`,
      'g'
    )) || []).length;
    // Should appear at least twice: once for tax_contributions, once for daf_grants
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('no application source references bare "other" as a tax contribution type in type assertions', () => {
    // Specifically guard against contribution_type: 'other' assignments in app/lib code
    const taxRelatedSrc = readAllSources(['lib/helpers', 'lib/schemas', 'lib/tax', 'components/tax']);
    // Allow 'other' in recipient_type contexts (e.g., '501c3_public', 'other')
    // but not as a standalone contribution_type enum value
    expect(taxRelatedSrc).not.toMatch(/contribution_type.*?:\s*['"]other['"]/);
  });
});

describe('Schema contract: owner_tax_profiles removal', () => {
  const migrationFiles = (() => {
    const { readdirSync, readFileSync } = require('fs');
    const { join } = require('path');
    try {
      return readdirSync('db/migrations')
        .filter((f: string) => f.endsWith('.sql'))
        .map((f: string) => ({ name: f, content: readFileSync(join('db/migrations', f), 'utf-8') }));
    } catch {
      return [];
    }
  })();

  it('no migration file contains owner_tax_profiles', () => {
    const offending = migrationFiles
      .filter(({ content }: { content: string }) => content.includes('owner_tax_profiles'))
      .map(({ name }: { name: string }) => name);
    expect(offending).toEqual([]);
  });

  it('application source code does not reference owner_tax_profiles', () => {
    expect(appSrc).not.toContain('owner_tax_profiles');
  });
});
// Integration test.
