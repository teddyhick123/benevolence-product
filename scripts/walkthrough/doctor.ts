/* eslint-disable no-console */
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { assertCanonicalMigrationLink, assertSupportedNode, commandWorks, getLocalStatus, PROJECT_ROOT } from './lib';

const checks: Array<[string, () => void]> = [
  ['Node.js', assertSupportedNode],
  ['Docker daemon', () => {
    if (!commandWorks('docker', ['info'])) throw new Error('Docker is not running.');
  }],
  ['Supabase CLI', () => {
    if (!commandWorks('npx', ['supabase', '--version'])) throw new Error('Supabase CLI is unavailable.');
  }],
  ['Canonical migration link', assertCanonicalMigrationLink],
  ['Playwright Chromium', () => {
    if (!existsSync(chromium.executablePath())) {
      throw new Error('Chromium is not installed. Run npm run walkthrough:setup.');
    }
  }],
  ['Local Supabase stack', () => {
    const status = getLocalStatus();
    if (!status.apiUrl) throw new Error('Local Supabase API is unavailable.');
  }],
];

let failed = false;
console.log(`Walkthrough doctor: ${PROJECT_ROOT}\n`);

for (const [name, check] of checks) {
  try {
    check();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error('\nWalkthrough environment is not ready. Start Docker, then run npm run walkthrough:setup.');
  process.exit(1);
}

console.log('\nWalkthrough environment is ready.');
