// lib/import/validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateTransformedRow } from './validator';

// ---------------------------------------------------------------------------
// required rule
// ---------------------------------------------------------------------------
describe('required rule', () => {
  it('catches empty string', () => {
    const errors = validateTransformedRow(
      { recipient_name: '', contribution_date: '2024-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'recipient_name' && e.rule === 'required')).toBe(true);
  });

  it('catches null', () => {
    const errors = validateTransformedRow(
      { recipient_name: null, contribution_date: '2024-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'recipient_name' && e.rule === 'required')).toBe(true);
  });

  it('catches undefined', () => {
    const errors = validateTransformedRow(
      { contribution_date: '2024-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'recipient_name' && e.rule === 'required')).toBe(true);
  });

  it('does not fire when value is present', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'ACME Foundation', contribution_date: '2024-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'recipient_name' && e.rule === 'required')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// positive rule
// ---------------------------------------------------------------------------
describe('positive rule', () => {
  it('catches 0', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test Org', contribution_date: '2024-01-01', amount_usd: 0 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'amount_usd' && e.rule === 'positive')).toBe(true);
  });

  it('catches negative numbers', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test Org', contribution_date: '2024-01-01', amount_usd: -500 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'amount_usd' && e.rule === 'positive')).toBe(true);
  });

  it('passes for positive amounts', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test Org', contribution_date: '2024-01-01', amount_usd: 1000 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'amount_usd' && e.rule === 'positive')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// date_valid rule
// ---------------------------------------------------------------------------
describe('date_valid rule', () => {
  it('catches invalid month (2024-13-01)', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: '2024-13-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'contribution_date' && e.rule === 'date_valid')).toBe(true);
  });

  it('catches non-date string', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: 'not-a-date', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'contribution_date' && e.rule === 'date_valid')).toBe(true);
  });

  it('passes for valid ISO date', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: '2024-06-15', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.field === 'contribution_date' && e.rule === 'date_valid')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// date_not_future rule
// ---------------------------------------------------------------------------
describe('date_not_future rule', () => {
  it("catches tomorrow's date as a warning (not error)", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const isoTomorrow = tomorrow.toISOString().split('T')[0];

    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: isoTomorrow, amount_usd: 100 },
      'contributions'
    );
    const futureErr = errors.find(
      (e) => e.field === 'contribution_date' && e.rule === 'date_not_future'
    );
    expect(futureErr).toBeDefined();
    expect(futureErr?.severity).toBe('warning');
  });

  it('does not fire for past dates', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: '2020-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'date_not_future')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ein_format rule
// ---------------------------------------------------------------------------
describe('ein_format rule', () => {
  it('catches 8-digit EIN missing leading zero and marks auto_fixable', () => {
    const errors = validateTransformedRow(
      {
        recipient_name: 'Test',
        contribution_date: '2024-01-01',
        amount_usd: 100,
        recipient_ein: '12345678',
      },
      'contributions'
    );
    const einErr = errors.find((e) => e.rule === 'ein_format');
    expect(einErr).toBeDefined();
    expect(einErr?.auto_fixable).toBe(true);
    expect(einErr?.severity).toBe('warning');
  });

  it('does not fire for a valid XX-XXXXXXX formatted EIN', () => {
    const errors = validateTransformedRow(
      {
        recipient_name: 'Test',
        contribution_date: '2024-01-01',
        amount_usd: 100,
        recipient_ein: '12-3456789',
      },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'ein_format')).toBe(false);
  });

  it('does not fire when EIN is absent', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: '2024-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'ein_format')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// contribution_type_valid rule
// ---------------------------------------------------------------------------
describe('contribution_type_valid rule', () => {
  it('catches PayPal as invalid type', () => {
    const errors = validateTransformedRow(
      {
        recipient_name: 'Test',
        contribution_date: '2024-01-01',
        amount_usd: 100,
        contribution_type: 'PayPal',
      },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'contribution_type_valid')).toBe(true);
  });

  it('passes for valid type "cash"', () => {
    const errors = validateTransformedRow(
      {
        recipient_name: 'Test',
        contribution_date: '2024-01-01',
        amount_usd: 100,
        contribution_type: 'cash',
      },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'contribution_type_valid')).toBe(false);
  });

  it('passes when contribution_type is absent', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: '2024-01-01', amount_usd: 100 },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'contribution_type_valid')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// amount_reasonable rule
// ---------------------------------------------------------------------------
describe('amount_reasonable rule', () => {
  it('flags $11M as a warning, not an error', () => {
    const errors = validateTransformedRow(
      {
        recipient_name: 'Test',
        contribution_date: '2024-01-01',
        amount_usd: 11_000_000,
      },
      'contributions'
    );
    const reasonableErr = errors.find((e) => e.rule === 'amount_reasonable');
    expect(reasonableErr).toBeDefined();
    expect(reasonableErr?.severity).toBe('warning');
  });

  it('does not fire for a normal amount', () => {
    const errors = validateTransformedRow(
      { recipient_name: 'Test', contribution_date: '2024-01-01', amount_usd: 5000 },
      'contributions'
    );
    expect(errors.some((e) => e.rule === 'amount_reasonable')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full clean contribution row
// ---------------------------------------------------------------------------
describe('full contribution row with no errors', () => {
  it('passes clean with all required fields valid', () => {
    const errors = validateTransformedRow(
      {
        recipient_name: 'Green Earth Foundation',
        recipient_ein: '12-3456789',
        contribution_date: '2024-03-15',
        amount_usd: 25000,
        contribution_type: 'check',
      },
      'contributions'
    );
    // Only allow warnings for reasonable amounts (not present here)
    const hardErrors = errors.filter((e) => e.severity === 'error');
    expect(hardErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Other entity types
// ---------------------------------------------------------------------------
describe('holdings entity', () => {
  it('catches missing name', () => {
    const errors = validateTransformedRow({}, 'holdings');
    expect(errors.some((e) => e.field === 'name' && e.rule === 'required')).toBe(true);
  });

  it('passes when name is present', () => {
    const errors = validateTransformedRow({ name: 'Impact Fund I' }, 'holdings');
    expect(errors.some((e) => e.severity === 'error')).toBe(false);
  });
});

describe('investees entity', () => {
  it('catches missing display_name', () => {
    const errors = validateTransformedRow({}, 'investees');
    expect(errors.some((e) => e.field === 'display_name' && e.rule === 'required')).toBe(true);
  });
});

describe('metrics entity', () => {
  it('catches missing metric_code', () => {
    const errors = validateTransformedRow({ value: 42 }, 'metrics');
    expect(errors.some((e) => e.field === 'metric_code' && e.rule === 'required')).toBe(true);
  });

  it('catches non-positive value', () => {
    const errors = validateTransformedRow({ metric_code: 'jobs_created', value: -1 }, 'metrics');
    expect(errors.some((e) => e.field === 'value' && e.rule === 'positive')).toBe(true);
  });
});
