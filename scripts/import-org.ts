// scripts/import-org.ts
// Loads an export archive into this database.
//
// Usage:
//   SUPABASE_DB_URL=... npm run import:org -- --archive ./export-acme.tar

import { createElevatedClient } from '../lib/api/admin-client';
import { withTransaction } from '../lib/org-import/connection';
import { readArchive } from '../lib/org-import/reader';
import { checkSchemaCompatibility, assertOrgAbsent } from '../lib/org-import/compatibility';
import { restoreAccounts } from '../lib/org-import/identity';
import { readForeignKeys, planLoadOrder } from '../lib/org-import/order';
import { loadTables } from '../lib/org-import/loader';
import { uploadDocuments } from '../lib/org-import/documents';

function parseArgs() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--archive');
  return { archive: index === -1 ? undefined : args[index + 1] };
}

async function main() {
  const { archive } = parseArgs();
  if (!archive) {
    console.error('Usage: npm run import:org -- --archive <path to .tar>');
    process.exit(1);
  }

  // Verification completes before a transaction opens: an archive that fails
  // its own hashes is not imported at all.
  console.log(`Reading ${archive}…`);
  const contents = await readArchive(archive);
  console.log(
    `  ${contents.manifest.orgName} (${contents.manifest.orgId}), ` +
    `${contents.manifest.files.length} files verified`,
  );

  const report = await withTransaction(async tx => {
    const { rows } = await tx.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM public.applied_migrations ORDER BY version');
    const compatibility = checkSchemaCompatibility(
      contents.manifest.schema.ledger, rows);

    if (!compatibility.ok) throw new Error(compatibility.reason);
    if (compatibility.warning) console.warn(`  warning: ${compatibility.warning}`);

    await assertOrgAbsent(tx, contents.manifest.orgId);

    const accounts = await restoreAccounts(tx, contents.tables.get('profiles') ?? []);
    console.log(`  restored ${accounts} account(s) with no credentials`);

    const fks = await readForeignKeys(tx);
    const plan = planLoadOrder([...contents.tables.keys()], fks);

    return loadTables(tx, contents, plan);
  });

  const rowTotal = report.reduce((sum, entry) => sum + entry.inserted, 0);
  console.log(`  ${report.length} tables, ${rowTotal} rows committed`);

  // After the commit, deliberately: object storage has no rollback.
  if (contents.documents.length > 0) {
    const documents = await uploadDocuments(createElevatedClient(), contents.documents);
    console.log(`  ${documents.uploaded} document(s) uploaded`);
    for (const failure of documents.failed) {
      console.error(`  document failed: ${failure.path} — ${failure.reason}`);
    }
    if (documents.failed.length > 0) {
      console.error(
        `\n${documents.failed.length} document(s) could not be uploaded. The rows are ` +
        'committed and correct; re-run to retry the documents.\n',
      );
      process.exit(1);
    }
  }

  console.log('Import complete.');
}

main().catch((err: Error) => {
  console.error(`\nImport failed: ${err.message}\n`);
  process.exit(1);
});
