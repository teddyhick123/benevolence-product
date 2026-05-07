import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('state_registrations column contract', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/compliance/state-registrations/route.ts',
    'utf8'
  );

  it('uses org_id not organization_id', () => {
    expect(src).not.toContain("'organization_id'");
    expect(src).not.toContain('"organization_id"');
    expect(src).toContain('org_id');
  });

  it('does not reference phantom columns', () => {
    expect(src).not.toContain('registered_name');
    expect(src).not.toContain('annual_report_due');
    expect(src).not.toContain('annual_report_filed');
    expect(src).not.toContain('filing_fee');
  });

  it('conflict key uses org_id', () => {
    expect(src).toContain("'org_id,state,registration_type'");
    expect(src).not.toContain("'organization_id,state'");
  });
});
