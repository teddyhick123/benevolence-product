// Applies a portable configuration template in one audited transaction.

import { readFile } from 'node:fs/promises';
import { applyConfig, parseConfigTemplate, templateSha256 } from '../lib/config-template';
import { withTransaction } from '../lib/org-import/connection';
import { formatConfigComparison, parseConfigCliArgs } from './config-cli';

async function main(): Promise<void> {
  const args = parseConfigCliArgs(process.argv.slice(2), { command: 'apply', requireTemplate: true, requireActor: true });
  const template = parseConfigTemplate(await readFile(args.templatePath!, 'utf8'));
  const comparison = await withTransaction(tx => applyConfig(tx, {
    orgId: args.orgId,
    actorId: args.actorId!,
    portfolioId: args.portfolioId,
    template,
  }));
  process.stdout.write(`template_sha256 ${templateSha256(template)}\n`);
  const report = formatConfigComparison(comparison);
  if (report) process.stdout.write(`${report}\n`);
}

main().catch((error: Error) => {
  console.error(`Configuration apply failed: ${error.message}`);
  process.exitCode = 1;
});
