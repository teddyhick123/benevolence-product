import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('import commit route', () => {
  const src = readFileSync(
    'app/api/admin/imports/[id]/commit/route.ts',
    'utf8'
  );

  it('calls loadStagingToProduction', () => {
    expect(src).toContain('loadStagingToProduction');
  });

  it('imports loadStagingToProduction from loader', () => {
    expect(src).toContain("from '@/lib/import/loader'");
  });

  it('only marks completed after loading', () => {
    const loadIdx = src.indexOf('loadStagingToProduction');
    const statusIdx = src.indexOf("status: 'completed'");
    expect(loadIdx).toBeGreaterThan(0);
    expect(loadIdx).toBeLessThan(statusIdx);
  });
});
