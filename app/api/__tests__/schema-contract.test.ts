import { describe, it, expect } from 'vitest';
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
const agentDocsSrc = ['CLAUDE.md', 'AGENTS.md']
  .map(file => {
    try {
      return readFileSync(file, 'utf-8');
    } catch {
      return '';
    }
  })
  .join('\n');

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

  it('invitation acceptance enforces invitee email even though it uses the admin client', () => {
    expect(appSrc).toMatch(/user\.email\?\.trim\(\)\.toLowerCase\(\)/);
    expect(appSrc).toMatch(/invite\.email\.trim\(\)\.toLowerCase\(\)/);
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
