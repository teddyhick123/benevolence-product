// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

describe('API authentication boundary', () => {
  it('keeps session-client construction and legacy access helpers out of routes', () => {
    for (const route of routeFiles('app/api')) {
      const source = readFileSync(route, 'utf8');
      expect(source, route).not.toContain('@supabase/ssr');
      expect(source, route).not.toMatch(/\bcreateServerClient\s*\(/);
      expect(source, route).not.toMatch(/\bcreateSupabaseServerClient\s*\(/);
      expect(source, route).not.toMatch(/@\/lib\/(admin-auth|org-access|portfolio-auth)/);
    }
  });
});
