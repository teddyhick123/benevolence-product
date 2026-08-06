import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('donors route column contract', () => {
  const routeSrc = readFileSync('app/api/org/[orgId]/donors/route.ts', 'utf8');

  it('uses org_id not organization_id', () => {
    expect(routeSrc).not.toContain("'organization_id'");
    expect(routeSrc).not.toContain('"organization_id"');
    expect(routeSrc).toContain('org_id');
  });

  it('does not insert phantom columns or stale aliases', () => {
    expect(routeSrc).not.toContain('donor_type');
    expect(routeSrc).not.toContain('postal_code');
    expect(routeSrc).not.toContain('created_by');
  });

  it('persists platform CRM fields on donors', () => {
    expect(routeSrc).toContain('contact_name');
    expect(routeSrc).toContain('is_anonymous');
    expect(routeSrc).toContain('communication_preference');
    expect(routeSrc).toContain('do_not_contact');
  });
});
