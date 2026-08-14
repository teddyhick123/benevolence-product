import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('portfolio assistant compliance executor column contract', () => {
  const complianceSrc = [
    'get-compliance-status',
    'calculate-payout-requirement',
    'get-payout-forecast',
    'screen-for-self-dealing',
    'register-disqualified-person',
    'track-filing-deadline',
    'log-expenditure-responsibility',
    'assess-qualifying-distribution',
    'get-990pf-export-data',
    'get-state-registration-status',
  ].map((name) => readFileSync(
    `lib/ai/assistant/executors/tools/${name}.ts`,
    'utf8'
  )).join('\n');

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
    const trackSrc = readFileSync(
      'lib/ai/assistant/executors/tools/track-filing-deadline.ts',
      'utf8'
    );
    // The insert should use extension_due_date (the real column name)
    expect(trackSrc).toContain('extension_due_date');
    // The old wrong column name should not appear in the insert
    expect(trackSrc).not.toMatch(/['"]extended_due_date['"]\s*:/);
  });

  it('get_state_registration_status filters by state not state_code', () => {
    const stateSrc = readFileSync(
      'lib/ai/assistant/executors/tools/get-state-registration-status.ts',
      'utf8'
    );
    expect(stateSrc).not.toContain('.order(\'state_name\')');
    expect(stateSrc).not.toMatch(/eq\('state_code'/);
  });
});
