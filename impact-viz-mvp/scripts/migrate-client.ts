#!/usr/bin/env ts-node
/**
 * Benevolence Client Migration Runner
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

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
interface MigrateArgs {
  from?: string;
  to?: string;
  file?: string;
  dryRun: boolean;
}

function parseArgs(): MigrateArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Benevolence Client Migration Runner

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
    dryRun: args.includes('--dry-run'),
  };
}

// ---------------------------------------------------------------------------
// Migration file discovery
// ---------------------------------------------------------------------------
interface MigrationFile {
  num: number;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { from, to, file, dryRun } = parseArgs();

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
    migrations = [{ num, filename, fullPath }];
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

  const applied: string[] = [];
  const failed: Array<{ filename: string; error: string }> = [];

  for (const m of migrations) {
    process.stdout.write(`  Applying ${m.filename}… `);
    const sql = fs.readFileSync(m.fullPath, 'utf-8');
    try {
      await executeSQL(sql, m.filename);
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
