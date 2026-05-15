import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';

const RUNTIME_ROOTS = ['app', 'components', 'lib', 'scripts'];
const RUNTIME_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const FORBIDDEN_BRAND_PATTERNS = [
  /\bBenevolence\b/,
  /\bBen\b/,
  /\bBEN-/,
];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function isRuntimeSource(path: string): boolean {
  if (!RUNTIME_EXTENSIONS.has(extname(path))) return false;
  if (path.includes('__tests__')) return false;
  if (/\.(test|spec)\.[tj]sx?$/.test(path)) return false;
  return true;
}

describe('brand runtime contract', () => {
  it('does not leak old template brand literals into shipped code', () => {
    const offenders = RUNTIME_ROOTS
      .flatMap(listFiles)
      .filter(isRuntimeSource)
      .flatMap(path => {
        const contents = readFileSync(path, 'utf8');
        return FORBIDDEN_BRAND_PATTERNS
          .filter(pattern => pattern.test(contents))
          .map(pattern => `${path} matched ${pattern}`);
      });

    expect(offenders).toEqual([]);
  });
});
