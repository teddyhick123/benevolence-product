// Exports one organization's portable configuration JSON.
// JSON is the sole stdout output; diagnostics remain safe for shell redirection.

import {
  assertNoSourceUuidReferences,
  auditConfigExport,
  formatConfigTemplateJson,
  readLiveConfig,
  templateSha256,
} from '../lib/config-template';
import { withTransaction } from '../lib/org-import/connection';
import { parseConfigCliArgs } from './config-cli';

async function main(): Promise<void> {
  const args = parseConfigCliArgs(process.argv.slice(2), { command: 'export' });
  const template = await withTransaction(async tx => {
    const live = await readLiveConfig(tx, { orgId: args.orgId, portfolioId: args.portfolioId });
    assertNoSourceUuidReferences(live);
    if (args.actorId) {
      await auditConfigExport(tx, { orgId: args.orgId, actorId: args.actorId, template: live });
    }
    return live;
  });
  console.error(`Exported configuration template sha256=${templateSha256(template)}`);
  process.stdout.write(formatConfigTemplateJson(template));
}

main().catch((error: Error) => {
  console.error(`Configuration export failed: ${error.message}`);
  process.exitCode = 1;
});
