// @vitest-environment node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['lib', 'app', 'scripts'];

/** Runtime-provided or test-only variables that must not be documented as client config. */
const EXEMPT = new Set([
  'NODE_ENV', 'CI', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'PORT',
  'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SHELL', 'USER',
  'NO_COLOR', 'FORCE_COLOR', 'NEXT_TELEMETRY_DISABLED',
  'NODE_OPTIONS_SAFE_UNUSED', 'WALKTHROUGH_MODE',
]);

function sourceFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.(ts|tsx|mjs)$/.test(entry) && !/\.test\.|__tests__/.test(path) ? [path] : [];
  });
}

function referencedVars(): Set<string> {
  const found = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(dir)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        if (!EXEMPT.has(match[1])) found.add(match[1]);
      }
    }
  }
  return found;
}

describe('env template contract', () => {
  it('documents every environment variable the application reads', () => {
    const template = readFileSync(join(ROOT, '.env.example'), 'utf8');
    const undocumented = [...referencedVars()]
      .filter(name => !new RegExp(`^\\s*#?\\s*${name}=`, 'm').test(template))
      .sort();

    expect(undocumented, `Add these to .env.example: ${undocumented.join(', ')}`).toEqual([]);
  });
});
