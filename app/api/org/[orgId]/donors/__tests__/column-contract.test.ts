import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('donors route column contract', () => {
  const routeSrc = readFileSync('app/api/org/[orgId]/donors/route.ts', 'utf8');

  it('uses org_id not organization_id', () => {
    expect(routeSrc).not.toContain("'organization_id'");
    expect(routeSrc).not.toContain('"organization_id"');
    expect(routeSrc).toContain('org_id');
  });

  it('does not insert phantom columns', () => {
    expect(routeSrc).not.toContain('donor_type');
    expect(routeSrc).not.toContain('contact_name');
    expect(routeSrc).not.toContain('postal_code');
    expect(routeSrc).not.toContain('is_anonymous');
    expect(routeSrc).not.toContain('communication_preference');
    expect(routeSrc).not.toContain('do_not_contact');
    expect(routeSrc).not.toContain('created_by');
  });
});
