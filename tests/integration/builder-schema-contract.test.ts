// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');
const sql = readFileSync(path.join(MIGRATIONS_DIR, '0025_builder.sql'), 'utf8');

/** Extract the body of `CREATE TABLE [IF NOT EXISTS] <name> ( ... );` */
function tableBody(name: string): string {
  const re = new RegExp(
    `CREATE TABLE IF NOT EXISTS (?:public\\.)?${name}\\s*\\(([\\s\\S]*?)\\n\\);`, 'm');
  const m = sql.match(re);
  if (!m) throw new Error(`table ${name} not found in 0025`);
  return m[1];
}

describe('0025 canonical builder schema', () => {
  it('builder_proposals has code_state with the 11-state CHECK and no transitional fields', () => {
    const body = tableBody('builder_proposals');
    for (const s of ['plan_ready','queued','generating','verifying','needs_repair',
                     'ready_to_apply','pr_opened','merged','deployed','rejected','failed']) {
      expect(body).toContain(`'${s}'`);
    }
    expect(body).toMatch(/current_revision_id\s+uuid/);
    expect(body).toMatch(/rejected_reason\s+text/);
    for (const dead of ['generated_code','review_report','pr_url']) {
      expect(body).not.toContain(dead);
    }
    expect(body).not.toMatch(/\bphase\b/);
    // type/state consistency constraint
    expect(body).toMatch(/proposal_type = 'config' AND status IS NOT NULL AND code_state IS NULL/);
    expect(body).toMatch(/proposal_type = 'code' AND code_state IS NOT NULL/);
  });

  it.each([
    ['builder_proposal_revisions', ['proposal_id','revision_number','parent_revision_id','kind',
      'base_commit_sha','head_commit_sha','manifest_hash','diff_hash','context_hash',
      'artifact_prefix','file_count','total_bytes','progress','created_by']],
    ['builder_review_attempts', ['proposal_id','revision_id','attempt_number','trigger','status',
      'policy_version','required_check_keys','summary_score','started_at','completed_at','decision_reason']],
    ['builder_verification_runs', ['review_attempt_id','check_key','command_version','status',
      'exit_code','duration_ms','log_artifact_key','evidence_hash']],
    ['builder_review_findings', ['review_attempt_id','reviewer_kind','severity','category','rule_id',
      'file_path','line_start','line_end','evidence','recommendation','state']],
    ['builder_delivery_records', ['proposal_id','revision_id','provider','pr_number','pr_url',
      'branch_name','commit_sha','environment','status','provider_event_id','payload_hash']],
  ])('%s has required columns', (table, cols) => {
    const body = tableBody(table);
    for (const col of cols) expect(body).toMatch(new RegExp(`\\b${col}\\b`));
  });

  it('enum CHECKs are exact', () => {
    expect(tableBody('builder_proposal_revisions'))
      .toMatch(/kind IN \('scaffold_generation','generic_submission','repair','rebase'\)/);
    expect(tableBody('builder_review_attempts'))
      .toMatch(/trigger IN \('initial','retry','repair','rebase','policy_change'\)/);
    expect(tableBody('builder_review_attempts'))
      .toMatch(/status IN \('running','passed','blocked','failed'\)/);
    expect(tableBody('builder_verification_runs'))
      .toMatch(/status IN \('pending','running','passed','failed','error','skipped'\)/);
    expect(tableBody('builder_review_findings'))
      .toMatch(/severity IN \('blocker','error','warning','info'\)/);
    expect(tableBody('builder_review_findings'))
      .toMatch(/state IN \('open','resolved','dismissed'\)/);
    expect(tableBody('builder_delivery_records'))
      .toMatch(/status IN \('pr_open','pr_closed','pr_merged','deploy_pending','deploy_succeeded','deploy_failed'\)/);
  });

  it('every builder table enables RLS with org-admin read + service-role policies', () => {
    for (const t of ['builder_proposals','builder_sessions','builder_proposal_revisions',
                     'builder_review_attempts','builder_verification_runs',
                     'builder_review_findings','builder_delivery_records']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE (?:public\\.)?${t} ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`"${t}: service role"`));
    }
    // child tables authorize via inner join to builder_proposals.org_id
    expect(sql).toMatch(/p\.id = proposal_id AND public\.is_org_admin\(p\.org_id\)/);
  });

  it('has immutability trigger, claim RPC, circular FK, and artifact bucket', () => {
    expect(sql).toContain('builder_revision_immutability_guard');
    expect(sql).toContain('builder_claim_code_run');
    expect(sql).toMatch(/ADD CONSTRAINT builder_proposals_current_revision_fkey/);
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).toMatch(/'builder-artifacts'.*false|\('builder-artifacts',\s*'builder-artifacts',\s*false\)/s);
  });
});

describe('migration set hygiene', () => {
  it('0026 is deleted and no migration re-adds transitional columns', () => {
    expect(existsSync(path.join(MIGRATIONS_DIR, '0026_builder_enhancement.sql'))).toBe(false);
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f));
    for (const f of all) {
      const text = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      expect(text, f).not.toMatch(/ALTER TABLE (?:public\.)?builder_proposals\s+ADD COLUMN/i);
    }
  });

  it('ai_instructions lives in 0002_organizations.sql', () => {
    const org = readFileSync(path.join(MIGRATIONS_DIR, '0002_organizations.sql'), 'utf8');
    expect(org).toMatch(/ai_instructions\s+TEXT/i);
  });
});

describe('builder migration type drift gate', () => {
  const checkMatrix = readFileSync(path.join(process.cwd(), 'lib/builder/check-matrix.ts'), 'utf8');
  const migrationAssert = readFileSync(path.join(process.cwd(), 'scripts/verify/migrations-assert.sh'), 'utf8');
  const pathPolicy = readFileSync(path.join(process.cwd(), 'lib/builder/path-policy.ts'), 'utf8');
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  it('routes every migration proposal through reset verification and this schema suite', () => {
    expect(checkMatrix).toContain("required.add('verify:migrations')");
    expect(checkMatrix).toContain("const SCHEMA_CONTRACT_SUITE = 'tests/integration/builder-schema-contract.test.ts'");
  });

  it('checks generated types after the migration reset', () => {
    expect(pkg.scripts['db:types:check']).toBe('node scripts/verify/database-types.mjs check');
    expect(migrationAssert).toContain('npm run db:types:check');
  });

  it('requires migration proposals to carry regenerated types', () => {
    expect(pathPolicy).toContain("rule: 'migration-types'");
    expect(pathPolicy).toContain("normalizedPaths.includes('lib/database.types.ts')");
  });
});

describe('transitional builder field guard', () => {
  const SOURCE_ROOTS = ['app', 'lib', 'components'];
  const SKIP_DIR_NAMES = new Set(['node_modules', '__tests__', '.next']);
  const SOURCE_EXT = /\.(ts|tsx)$/;

  /** Recursively collect .ts/.tsx files under root, skipping test dirs/files. */
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        walk(path.join(dir, entry.name), out);
      } else if (entry.isFile()) {
        if (!SOURCE_EXT.test(entry.name)) continue;
        if (entry.name.includes('.test.')) continue;
        out.push(path.join(dir, entry.name));
      }
    }
    return out;
  }

  /**
   * Strip `//` line comments and `/* *\/` block comments so historical
   * documentation references (e.g. "the deleted phase/generated_code/
   * review_report columns") don't trip the guard. `://` (URLs) is left
   * alone since the char before `//` is `:`. Only LIVE CODE usage of the
   * transitional tokens is a violation.
   */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('no runtime source references transitional builder fields', () => {
    const files = SOURCE_ROOTS.flatMap((root) => walk(path.join(process.cwd(), root)));
    const violations: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      // Only inspect files that touch the Builder domain at all.
      if (!/builder/i.test(raw)) continue;
      const code = stripComments(raw);

      for (const token of ['generated_code', 'review_report', 'proposal-lifecycle', 'REQUIRED_CHECK_KEYS', 'builder-review-policy/v1']) {
        if (code.includes(token)) {
          violations.push(`${file}: live code contains transitional token '${token}'`);
        }
      }

      // 'phase' as a quoted string or member-access — NOT bare identifiers,
      // so unrelated domain usage (e.g. an onboarding "phase" concept) is
      // never flagged.
      if (/(['"])phase\1|\.phase\b/.test(code)) {
        violations.push(`${file}: live code references a 'phase' field/property`);
      }

      // pr_url is a LEGITIMATE column on builder_delivery_records. It is
      // only a violation when selected/updated directly on the
      // builder_proposals table (that column was deleted from 0025).
      const fromCalls = [...code.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)];
      for (const call of fromCalls) {
        if (call[1] !== 'builder_proposals') continue;
        const statementStart = call.index! + call[0].length;
        const nextFromIdx = code.indexOf('.from(', statementStart);
        const windowEnd = nextFromIdx === -1
          ? Math.min(code.length, statementStart + 500)
          : Math.min(nextFromIdx, statementStart + 500);
        const window = code.slice(statementStart, windowEnd);
        if (/\bpr_url\b/.test(window)) {
          violations.push(`${file}: 'pr_url' referenced against builder_proposals (only builder_delivery_records.pr_url is legitimate)`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
// Integration test.
