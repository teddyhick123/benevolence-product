import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('import dashboard action buttons', () => {
  const src = readFileSync('app/admin/imports/ImportDashboardClient.tsx', 'utf8');

  it('Resume button has an onClick handler', () => {
    expect(src).toMatch(/onClick.*[Rr]esume|[Rr]esume.*onClick/);
  });

  it('Rollback button has an onClick handler', () => {
    expect(src).toMatch(/onClick.*[Rr]ollback|[Rr]ollback.*onClick/);
  });

  it('calls resume API', () => {
    expect(src).toContain('/resume');
  });

  it('calls rollback API', () => {
    expect(src).toContain('/rollback');
  });
});
