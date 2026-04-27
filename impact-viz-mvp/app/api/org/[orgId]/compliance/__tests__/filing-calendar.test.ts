import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('filing_calendar column contract', () => {
  it('uses org_id not organization_id', () => {
    const src = readFileSync(
      'app/api/org/[orgId]/compliance/filing-calendar/route.ts',
      'utf8'
    );
    expect(src).not.toContain("'organization_id'");
    expect(src).not.toContain('"organization_id"');
    expect(src).toContain('org_id');
  });

  it('does not reference phantom columns tax_year or filing_jurisdiction', () => {
    const src = readFileSync(
      'app/api/org/[orgId]/compliance/filing-calendar/route.ts',
      'utf8'
    );
    expect(src).not.toContain('tax_year');
    expect(src).not.toContain('filing_jurisdiction');
    expect(src).not.toContain('filed_date');
    expect(src).not.toContain('filed_by');
    expect(src).not.toContain('confirmation_number');
  });
});
