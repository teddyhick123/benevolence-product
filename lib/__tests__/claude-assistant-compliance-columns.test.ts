import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('claude-assistant compliance executor column contract', () => {
  const src = readFileSync('lib/ai/assistant/executor.ts', 'utf8');

  const complianceStart = src.indexOf("case 'get_compliance_status'");
  const complianceEnd = src.indexOf("default:\n        throw new Error(`Unknown function");
  const complianceSrc = src.slice(complianceStart, complianceEnd);

  it('compliance cases do not use organization_id as a DB column', () => {
    // Check DB .eq() calls don't use 'organization_id' as column name
    expect(complianceSrc).not.toMatch(/\.eq\(['"]organization_id['"]/);
    // Check inserts don't use organization_id as a key (but args.organization_id as a value is fine)
    expect(complianceSrc).not.toMatch(/^\s+organization_id:/m);
  });

  it('track_filing_deadline does not use confirmation_number (use filing_reference)', () => {
    expect(complianceSrc).not.toContain('confirmation_number');
    expect(complianceSrc).toContain('filing_reference');
  });

  it('track_filing_deadline does not use filed_by (use completed_by)', () => {
    expect(complianceSrc).not.toContain("'filed_by'");
    expect(complianceSrc).toContain('completed_by');
  });

  it('track_filing_deadline uses extension_due_date not extended_due_date in insert', () => {
    const trackStart = complianceSrc.indexOf("case 'track_filing_deadline'");
    const trackEnd = complianceSrc.indexOf("case 'log_expenditure_responsibility'");
    const trackSrc = complianceSrc.slice(trackStart, trackEnd);
    // The insert should use extension_due_date (the real column name)
    expect(trackSrc).toContain('extension_due_date');
    // The old wrong column name should not appear in the insert
    expect(trackSrc).not.toMatch(/['"]extended_due_date['"]\s*:/);
  });

  it('get_state_registration_status filters by state not state_code', () => {
    const stateStart = complianceSrc.indexOf("case 'get_state_registration_status'");
    const stateSrc = complianceSrc.slice(stateStart);
    expect(stateSrc).not.toContain('.order(\'state_name\')');
    expect(stateSrc).not.toMatch(/eq\('state_code'/);
  });
});
