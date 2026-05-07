// lib/import/__tests__/performance.test.ts
// Performance smoke test for transform+validate cycle

import { describe, it, expect } from 'vitest';
import { validateTransformedRow } from '../validator';
import { applyFieldMapping } from '../transformer';
import type { EntityMappingConfig } from '../types';

// Generate N fake contribution rows
function generateContributionRows(count: number): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      DonorName: `Donor ${i}`,
      GiftDate: `0${(i % 9) + 1}/15/2024`,
      GiftAmount: `$${(Math.random() * 10000).toFixed(2)}`,
      GiftType: 'Cash',
      FundEIN: `12-${String(3456789 + i).padStart(7, '0')}`,
      FundName: `Fund ${i % 50}`,
    });
  }
  return rows;
}

// Minimal EntityMappingConfig for contributions (using types.ts structure)
const testEntityConfig: EntityMappingConfig = {
  source_entity: 'contributions',
  field_map: {
    donor_name:        { source: 'DonorName',  type: 'string' },
    contribution_date: { source: 'GiftDate',   type: 'date' },
    amount_usd:        { source: 'GiftAmount', type: 'numeric' },
    gift_type:         { source: 'GiftType',   type: 'string' },
    recipient_ein:     { source: 'FundEIN',    type: 'string', transform: 'normalize_ein' },
    recipient_name:    { source: 'FundName',   type: 'string', required: true },
  },
};

describe('performance smoke test', () => {
  it('transforms and validates 1000 rows in under 30 seconds', () => {
    const ROW_COUNT = 1000;
    const rows = generateContributionRows(ROW_COUNT);

    const startMs = Date.now();

    let validCount = 0;
    let invalidCount = 0;

    for (const rawRow of rows) {
      const { transformed } = applyFieldMapping(rawRow, testEntityConfig);
      const errors = validateTransformedRow(transformed, 'contributions');
      if (errors.some((e) => e.severity === 'error')) {
        invalidCount++;
      } else {
        validCount++;
      }
    }

    const elapsedMs = Date.now() - startMs;

    console.log(
      `[performance] ${ROW_COUNT} rows in ${elapsedMs}ms ` +
        `(${Math.round((ROW_COUNT / elapsedMs) * 1000)} rows/sec), ` +
        `valid=${validCount}, invalid=${invalidCount}`
    );

    // Must complete in under 30 seconds
    expect(elapsedMs).toBeLessThan(30_000);

    // All rows processed
    expect(validCount + invalidCount).toBe(ROW_COUNT);
  });
});
