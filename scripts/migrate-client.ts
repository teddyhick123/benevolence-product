#!/usr/bin/env ts-node
/**
 * Client migration runner
 *
 * Applies new SQL migrations to an existing client Supabase project.
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx \
 *   npx ts-node scripts/migrate-client.ts --from 0001 --to latest
 *
 * Or apply a specific migration:
 *   npx ts-node scripts/migrate-client.ts --file db/migrations/0006_holdings.sql
 *
 * Options:
 *   --from [migration_number]   Start from this migration number (inclusive)
 *   --to   [migration_number|latest]  End at this migration number (inclusive), or "latest"
 *   --file [path]               Apply a single specific migration file
 *   --dry-run                   Print SQL without executing
 *   --help                      Show this help
 *
 * Environment variables:
 *   SUPABASE_URL          Project URL (https://xxx.supabase.co)
 *   SUPABASE_SERVICE_KEY  Service role key (for REST execution)
 *   SUPABASE_ACCESS_TOKEN Supabase Management API token (preferred for SQL execution)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  compareLedger,
  checksumOf,
  type AppliedMigrationRow,
} from '../lib/migrations/ledger';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
interface MigrateArgs {
  from?: string;
  to?: string;
  file?: string;
  /** Seed the ledger for a database that has no prior bookkeeping. */
  adopt?: string;
  dryRun: boolean;
}

function parseArgs(): MigrateArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Impact Platform Client Migration Runner

Usage:
  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx \\
  npx ts-node scripts/migrate-client.ts --from 0058 --to latest

  npx ts-node scripts/migrate-client.ts --file db/0063_qb_org_migration.sql

Options:
  --from [num]          Start migration number (inclusive, e.g. 0001)
  --to   [num|latest]   End migration number (inclusive) or "latest"
  --file [path]         Apply a single migration file
  --dry-run             Print SQL without executing
  --help                Show this help

Environment variables:
  SUPABASE_URL            Required. https://YOUR_REF.supabase.co
  SUPABASE_SERVICE_KEY    Service role key
  SUPABASE_ACCESS_TOKEN   Management API token (enables SQL execution via Management API)
`);
    process.exit(0);
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  return {
    from: get('--from'),
    to: get('--to'),
    file: get('--file'),
    adopt: get('--adopt'),
    dryRun: args.includes('--dry-run'),
  };
}

// ---------------------------------------------------------------------------
// Migration file discovery
// ---------------------------------------------------------------------------
interface MigrationFile {
  num: number;
  /** The four-character prefix. The ledger keys on this string, not on num:
   *  leading zeros and gaps make numeric identity unsafe. */
  version: string;
  filename: string;
  fullPath: string;
}

function discoverMigrations(dbDir: string): MigrationFile[] {
  const files = fs.readdirSync(dbDir).filter(f => {
    if (!f.endsWith('.sql')) return false;
    if (!/^\d{4}_/.test(f)) return false; // must start with 4-digit prefix
    return true;
  });

  return files
    .map(f => ({
      num: parseInt(f.slice(0, 4), 10),
      version: f.slice(0, 4),
      filename: f,
      fullPath: path.join(dbDir, f),
    }))
    .sort((a, b) => a.num - b.num || a.filename.localeCompare(b.filename));
}

function filterMigrations(
  all: MigrationFile[],
  from?: string,
  to?: string,
): MigrationFile[] {
  let result = all;

  if (from) {
    const fromNum = parseInt(from, 10);
    result = result.filter(m => m.num >= fromNum);
  }

  if (to && to !== 'latest') {
    const toNum = parseInt(to, 10);
    result = result.filter(m => m.num <= toNum);
  }

  return result;
}

// ---------------------------------------------------------------------------
// SQL execution via Supabase Management API
// ---------------------------------------------------------------------------
function extractProjectRef(supabaseUrl: string): string | null {
  const match = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : null;
}

async function executeSQL(sql: string, description: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) throw new Error('SUPABASE_URL env var is required');

  if (accessToken) {
    // Use Management API — most reliable for DDL
    const projectRef = extractProjectRef(supabaseUrl);
    if (!projectRef) throw new Error(`Could not parse project ref from SUPABASE_URL: ${supabaseUrl}`);

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Management API error for "${description}": ${err}`);
    }
  } else if (serviceKey) {
    // Fallback: use Supabase REST API via rpc (requires exec_sql function in DB)
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`REST API error for "${description}": ${err}`);
    }
  } else {
    throw new Error(
      'No execution method available. Set SUPABASE_ACCESS_TOKEN (Management API) or SUPABASE_SERVICE_KEY (REST API).'
    );
  }
}

/**
 * Reads rows. Separate from execSql, which throws on error but discards the
 * response body — adequate for DDL, useless for reading the ledger.
 *
 * Mirrors execSql's endpoint and ref derivation exactly, so it adds no new
 * environment variable.
 */
async function querySql<T>(sql: string, description: string): Promise<T[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) throw new Error('SUPABASE_URL env var is required');

  if (accessToken) {
    const projectRef = extractProjectRef(supabaseUrl);
    if (!projectRef) throw new Error(`Could not parse project ref from SUPABASE_URL: ${supabaseUrl}`);

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) throw new Error(`Management API error for "${description}": ${await res.text()}`);
    const body = await res.json();
    return (Array.isArray(body) ? body : []) as T[];
  }

  if (serviceKey) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) throw new Error(`REST API error for "${description}": ${await res.text()}`);
    // exec_sql may return a scalar rather than rows depending on how it is
    // defined in a given deployment. A non-array yields an empty ledger, which
    // the runner treats as a first run rather than crashing.
    const body = await res.json();
    return (Array.isArray(body) ? body : []) as T[];
  }

  throw new Error(
    'No query method available. Set SUPABASE_ACCESS_TOKEN (Management API) or SUPABASE_SERVICE_KEY (REST API).',
  );
}

/**
 * Version and filename are interpolated into SQL because executeSQL takes a
 * string. They come from the filesystem and match a strict shape, but assert
 * that rather than trusting it.
 */
function assertRecordableName(m: MigrationFile): void {
  if (!/^\d{4}$/.test(m.version) || !/^[\w.-]+\.sql$/.test(m.filename)) {
    throw new Error(`Refusing to record an unexpected migration name: ${m.filename}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { from, to, file, adopt, dryRun } = parseArgs();

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl && !dryRun) {
    console.error('SUPABASE_URL env var is required (unless --dry-run)');
    process.exit(1);
  }

  const scriptDir = path.dirname(__filename);
  const projectRoot = path.resolve(scriptDir, '..');
  const dbDir = path.join(projectRoot, 'db', 'migrations');

  let migrations: MigrationFile[];

  if (file) {
    // Single file mode
    const fullPath = path.isAbsolute(file) ? file : path.resolve(file);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      process.exit(1);
    }
    const filename = path.basename(fullPath);
    const num = parseInt(filename.slice(0, 4), 10) || 0;
    migrations = [{ num, version: filename.slice(0, 4), filename, fullPath }];
  } else {
    const all = discoverMigrations(dbDir);
    migrations = filterMigrations(all, from, to);
  }

  if (migrations.length === 0) {
    console.log('No migrations match the specified range.');
    return;
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Migrations to apply (${migrations.length}):`);
  for (const m of migrations) {
    console.log(`  ${m.filename}`);
  }

  if (dryRun) {
    console.log('\n── SQL Preview ─────────────────────────────────────────────────');
    for (const m of migrations) {
      console.log(`\n-- ${m.filename}`);
      console.log(fs.readFileSync(m.fullPath, 'utf-8'));
    }
    console.log('\n[Dry run complete — no changes made]');
    return;
  }

  console.log(`\nTarget: ${supabaseUrl}\n`);

  // -------------------------------------------------------------------------
  // Ledger: what has already been applied, and has anything changed since?
  // -------------------------------------------------------------------------
  if (adopt) {
    if (!/^\d{4}$/.test(adopt)) {
      console.error(`--adopt expects a four-digit version, got: ${adopt}`);
      process.exit(1);
    }
    // String comparison on a zero-padded version is correct ordering; parsing
    // to a number would mishandle gaps and leading zeros.
    const toAdopt = discoverMigrations(dbDir).filter(m => m.version <= adopt);
    for (const m of toAdopt) {
      assertRecordableName(m);
      await executeSQL(
        `INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
         VALUES ('${m.version}', '${m.filename}', 'unverified', 'backfill')
         ON CONFLICT (version) DO NOTHING`,
        `adopt ${m.filename}`,
      );
    }
    console.log(`Adopted ${toAdopt.length} migrations up to ${adopt}.`);
    return;
  }

  // Only a genuinely absent ledger table means "first run". Any other read
  // failure — no exec_sql function, bad credentials, network — must stop the
  // run: treating an unreadable ledger as an empty one would re-apply every
  // migration against a fully-migrated database, which is precisely the
  // failure this ledger exists to prevent.
  let ledgerRows: AppliedMigrationRow[];
  try {
    ledgerRows = await querySql<AppliedMigrationRow>(
      'SELECT version, filename, checksum, applied_at, applied_by FROM public.applied_migrations ORDER BY version',
      'read migrations ledger',
    );
  } catch (err: any) {
    const message = String(err?.message ?? err);
    const ledgerAbsent = /relation .*applied_migrations.* does not exist|42P01/i.test(message);
    if (!ledgerAbsent) {
      console.error('\nERROR  Could not read the migrations ledger:\n');
      console.error(`  ${message}\n`);
      console.error('  Refusing to proceed: an unreadable ledger is not an empty one.');
      console.error('  Set SUPABASE_ACCESS_TOKEN for the Management API, or ensure the');
      console.error('  exec_sql function exists for the REST path.\n');
      process.exit(1);
    }
    // The ledger itself is migration 0060. A database that predates it has no
    // table to read, which is a legitimate first-run state.
    console.log('No migrations ledger found — treating this as a first run.');
    ledgerRows = [];
  }

  const comparison = compareLedger(
    migrations.map(m => ({
      version: m.version,
      filename: m.filename,
      sql: fs.readFileSync(m.fullPath, 'utf-8'),
    })),
    ledgerRows,
  );

  if (comparison.drifted.length > 0) {
    console.error('\nERROR  Migration files have changed since they were applied:\n');
    for (const drift of comparison.drifted) {
      console.error(`  ${drift.filename} has changed since it was applied`);
      console.error(`    recorded ${drift.recorded.slice(0, 8)}…  current ${drift.current.slice(0, 8)}…`);
    }
    console.error('\n  Prerelease: run `supabase db reset` to rebuild from source.');
    console.error('  Released:   add a new migration instead of editing this one.\n');
    process.exit(1);
  }

  if (comparison.pending.length === 0) {
    console.log(
      `\nDatabase is already up to date — ${comparison.applied.length} migrations applied, nothing to apply.\n`,
    );
    return;
  }

  // --from/--to now filter what is pending rather than selecting what to run.
  migrations = migrations.filter(m =>
    comparison.pending.some(pending => pending.version === m.version));

  const applied: string[] = [];
  const failed: Array<{ filename: string; error: string }> = [];

  for (const m of migrations) {
    process.stdout.write(`  Applying ${m.filename}… `);
    const sql = fs.readFileSync(m.fullPath, 'utf-8');
    try {
      await executeSQL(sql, m.filename);
      assertRecordableName(m);
      await executeSQL(
        `INSERT INTO public.applied_migrations (version, filename, checksum, applied_by)
         VALUES ('${m.version}', '${m.filename}', '${checksumOf(sql)}', 'migrate-client')
         ON CONFLICT (version) DO UPDATE
           SET checksum = EXCLUDED.checksum,
               filename = EXCLUDED.filename,
               applied_by = EXCLUDED.applied_by,
               applied_at = now()`,
        `record ${m.filename}`,
      );
      console.log('OK');
      applied.push(m.filename);
    } catch (err: any) {
      console.log(`FAILED`);
      failed.push({ filename: m.filename, error: err.message });
    }
  }

  console.log(`\n── Results ──────────────────────────────────────────────────────`);
  console.log(`  Applied: ${applied.length}`);
  if (failed.length > 0) {
    console.log(`  Failed:  ${failed.length}`);
    for (const f of failed) {
      console.log(`    ✗ ${f.filename}`);
      console.log(`      ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log(`  All migrations applied successfully.`);
  }
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
