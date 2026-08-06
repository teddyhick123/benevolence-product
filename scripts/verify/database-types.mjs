#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const action = process.argv[2];
const target = path.join(process.cwd(), 'lib', 'database.types.ts');

if (action !== 'check' && action !== 'write') {
  console.error('Usage: node scripts/verify/database-types.mjs <check|write>');
  process.exit(2);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const generated = spawnSync(
  npx,
  ['supabase', 'gen', 'types', 'typescript', '--local'],
  { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || generated.stdout || 'Failed to generate database types.\n');
  process.exit(generated.status ?? 1);
}

const normalized = `${generated.stdout.trimEnd()}\n`;

if (action === 'write') {
  writeFileSync(target, normalized);
  console.log(`database-types: wrote ${path.relative(process.cwd(), target)}`);
  process.exit(0);
}

let committed = '';
try {
  committed = readFileSync(target, 'utf8');
} catch {
  console.error('database-types: lib/database.types.ts is missing; run npm run db:types:generate');
  process.exit(1);
}

if (committed !== normalized) {
  console.error('database-types: committed types are stale; run npm run db:types:generate');
  process.exit(1);
}

console.log('database-types: committed types match the clean local schema');
