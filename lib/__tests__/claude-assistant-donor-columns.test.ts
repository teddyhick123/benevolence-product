import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('claude-assistant donor executor column contract', () => {
  const src = readFileSync('lib/claude-assistant.ts', 'utf8');

  it('does not reference donor.donor_type (use is_organization)', () => {
    expect(src).not.toMatch(/donor\.donor_type/);
    expect(src).not.toMatch(/\bd\.donor_type\b/);
  });

  it('does not use postal_code (column is zip)', () => {
    expect(src).not.toContain('postal_code');
  });

  it('does not insert organization_id into acknowledgment_letters', () => {
    expect(src).not.toMatch(/organization_id:\s*(?:contribution|args)\.organization_id/);
  });

  it('search_donors filters v_donor_summary by org_id not organization_id', () => {
    expect(src).not.toMatch(/eq\(['"]organization_id['"],\s*args\.organization_id\)/);
  });

  it('search_donors filters by tier not donor_tier', () => {
    expect(src).not.toMatch(/eq\(['"]donor_tier['"]/);
  });
});
