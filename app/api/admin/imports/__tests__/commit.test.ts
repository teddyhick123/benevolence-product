import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('import commit route', () => {
  const routeSrc = readFileSync(
    'app/api/admin/imports/[id]/commit/route.ts',
    'utf8'
  );
  const repositorySrc = readFileSync('lib/api/repositories/imports.ts', 'utf8');

  it('calls loadStagingToProduction', () => {
    expect(routeSrc).toContain('createImportOrchestrationRepository');
    expect(repositorySrc).toContain('loadStagingToProduction');
  });

  it('imports loadStagingToProduction from loader', () => {
    expect(repositorySrc).toContain("from '@/lib/import/loader'");
  });

  it('only marks completed after loading', () => {
    const loadIdx = repositorySrc.indexOf('loadStagingToProduction');
    const statusIdx = repositorySrc.indexOf("status: 'completed'");
    expect(loadIdx).toBeGreaterThan(0);
    expect(loadIdx).toBeLessThan(statusIdx);
  });

  it('only accepts approved status — no needs_review shortcut', () => {
    expect(repositorySrc).toContain("'approved'");
    expect(repositorySrc).not.toContain("'mapped'");
    expect(repositorySrc).not.toContain("'validated'");
  });

  it('transitions to committing while load runs', () => {
    expect(repositorySrc).toContain("'committing'");
  });

  it('does not use stale statuses or columns', () => {
    expect(repositorySrc).not.toContain("'paused'");
    expect(repositorySrc).not.toContain("'running'");
    expect(repositorySrc).not.toContain('pause_reason');
  });
});
