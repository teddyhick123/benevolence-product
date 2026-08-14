import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(file => file && existsSync(file));

const localOutputPrefixes = [
  '.next/',
  '.next-walkthrough/',
  '.superpowers/',
  '.vercel/',
  '.claude/worktrees/',
  'out/',
  'playwright-report/',
  'test-results/',
  'graphify-out/',
  'app/graphify-out/',
  'components/graphify-out/',
  'lib/graphify-out/',
  'impact-viz-mvp/',
];

const allowedSqlPrefixes = [
  'db/migrations/',
  'db/demo/',
  'db/seeds/',
  'db/scripts/',
  'scripts/verify/',
  'templates/module/',
];

// The typed database client, its generated types, and the directory's own
// ownership README. `supabase.ts` / `supabase-browser.ts` are deliberately
// absent: they were replaced by `database-client.ts` and
// `lib/api/browser-auth-client.ts`, and must not come back.
const allowedRootLibFiles = new Set([
  'database-client.ts',
  'database.types.ts',
  'README.md',
]);

const violations = [];

for (const file of trackedFiles) {
  if (basename(file) === '.DS_Store' || file.endsWith('.bak')) {
    violations.push(`${file}: generated metadata or backup files are not tracked`);
  }

  if (file.endsWith('.tsbuildinfo') || localOutputPrefixes.some(prefix => file.startsWith(prefix))) {
    violations.push(`${file}: generated local output is not tracked`);
  }

  if (file.startsWith('supabase/.temp/') || file.startsWith('supabase/.branches/')) {
    violations.push(`${file}: Supabase local state is not tracked`);
  }

  if (file.startsWith('__tests__/')) {
    violations.push(`${file}: root test files must be assigned to a unit or integration owner`);
  }

  if (file.startsWith('docs/superpowers/')) {
    violations.push(`${file}: use docs/agent-work for coding-agent plans and specs`);
  }

  if (file.endsWith('.sql') && !allowedSqlPrefixes.some(prefix => file.startsWith(prefix))) {
    violations.push(`${file}: SQL must live in a sanctioned schema, demo, seed, verification, or template location`);
  }

  if (file.startsWith('lib/') && !file.slice(4).includes('/') && !allowedRootLibFiles.has(file.slice(4))) {
    violations.push(`${file}: loose lib files require an explicit ownership decision`);
  }
}

if (violations.length > 0) {
  console.error('repository-layout: failed');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`repository-layout: ${trackedFiles.length} tracked files satisfy layout rules`);
