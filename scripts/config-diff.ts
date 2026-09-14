// Compares a checked-in configuration template with a live organization.

import { readFile } from 'node:fs/promises';
import {
  assertNoSourceUuidReferences,
  assertTargetReferences,
  compareConfig,
  parseConfigTemplate,
  readLiveConfig,
  templateSha256,
} from '../lib/config-template';
import { checkSchemaCompatibility } from '../lib/org-import/compatibility';
import { withTransaction } from '../lib/org-import/connection';
import { formatConfigComparison, parseConfigCliArgs } from './config-cli';

async function main(): Promise<void> {
  const args = parseConfigCliArgs(process.argv.slice(2), { command: 'diff', requireTemplate: true });
  const template = parseConfigTemplate(await readFile(args.templatePath!, 'utf8'));
  assertNoSourceUuidReferences(template);
  const comparison = await withTransaction(async tx => {
    const live = await readLiveConfig(tx, { orgId: args.orgId, portfolioId: args.portfolioId });
    const compatibility = checkSchemaCompatibility(template.schema.ledger, live.schema.ledger);
    if (!compatibility.ok) throw new Error(compatibility.reason);
    if (compatibility.warning) console.error(`Warning: ${compatibility.warning}`);
    assertTargetReferences(template, live);
    return compareConfig(template, live);
  });
  process.stdout.write(`template_sha256 ${templateSha256(template)}\n`);
  const report = formatConfigComparison(comparison);
  if (report) process.stdout.write(`${report}\n`);
}

main().catch((error: Error) => {
  console.error(`Configuration diff failed: ${error.message}`);
  process.exitCode = 1;
});
