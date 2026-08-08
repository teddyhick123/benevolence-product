// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_EXTENSION = /\.(ts|tsx)$/;
const TEST_FILE = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.)/;

function walk(relativeRoot: string): string[] {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      files.push(...walk(relative));
    } else if (SOURCE_EXTENSION.test(entry.name) && !TEST_FILE.test(relative)) {
      files.push(relative);
    }
  }

  return files;
}

function isClientPage(file: string, source: string): boolean {
  return file.startsWith('app/') && /['"]use client['"]/.test(source.slice(0, 500));
}

const candidates = [
  ...walk('app'),
  ...walk('components'),
  ...walk('contexts'),
  ...walk('lib/hooks'),
  ...walk('lib'),
];

const uniqueCandidates = Array.from(new Set(candidates));
const browserSources = uniqueCandidates
  .map(file => ({ file, source: readFileSync(path.join(ROOT, file), 'utf8') }))
  .filter(({ file, source }) =>
    file.startsWith('components/')
    || file.startsWith('contexts/')
    || file.startsWith('lib/hooks/')
    || /^lib\/[^/]+\/hooks\.tsx?$/.test(file)
    || file === 'lib/api/client-hooks.ts'
    || isClientPage(file, source)
  );

function violations(pattern: RegExp): string[] {
  return browserSources
    .filter(({ source }) => pattern.test(source))
    .map(({ file }) => file)
    .sort();
}

describe('Phase 6 browser data boundary', () => {
  it('has no raw fetch calls in components, contexts, client pages, or hooks', () => {
    expect(violations(/\bfetch\s*\(/)).toEqual([]);
  });

  it('parses JSON through the shared client contract', () => {
    expect(violations(/\.json\s*\(\s*\)/)).toEqual([]);
    expect(violations(/await\s+[\w.]+\.text\s*\(\s*\)/)).toEqual([]);
  });

  it('has no component-local generic SWR fetchers', () => {
    expect(violations(/(?:const|function)\s+fetcher\b/)).toEqual([]);
    expect(violations(/\buseSWR\s*[<(]/)).toEqual(['lib/api/client-hooks.ts']);
  });

  it('uses the single lib hook home', () => {
    expect(violations(/from\s+['"]@\/hooks\//)).toEqual([]);
  });

  it('does not add browser-supplied organization authority', () => {
    expect(violations(/['"]x-org-id['"]\s*:/i)).toEqual([]);
  });

  it('retains named upload, download, and stream transports', () => {
    const combined = browserSources.map(({ source }) => source).join('\n');
    expect(combined).toContain('uploadJson');
    expect(combined).toContain('requestDownload');
    expect(combined).toContain('requestStream');
  });
});
