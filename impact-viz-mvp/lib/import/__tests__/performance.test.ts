// lib/import/__tests__/performance.test.ts
// Performance smoke test for transform+validate cycle

import { describe, it, expect } from 'vitest';
import { validateTransformedRow } from '../validator';
import { applyFieldMapping } from '../transformer';
import type { EntityMappingConfig } from '../validator';
import type { MappingProfile } from '../types';

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

// Minimal mapping profile for contributions
const testMappingProfile: MappingProfile = {
  id: 'test',
  name: 'Performance Test',
  source_type: 'blackbaud',
  entity_mappings: {
    contributions: {
      source_entity: 'contributions',
      field_mappings: [
        { source_field: 'DonorName', target_field: 'donor_name', transform: 'string' },
        { source_field: 'GiftDate', target_field: 'contribution_date', transform: 'date' },
        { source_field: 'GiftAmount', target_field: 'amount_usd', transform: 'numeric' },
        { source_field: 'GiftType', target_field: 'gift_type', transform: 'string' },
        { source_field: 'FundEIN', target_field: 'recipient_ein', transform: 'normalize_ein' },
        { source_field: 'FundName', target_field: 'recipient_name', transform: 'string' },
      ],
    },
  },
};

describe('performance smoke test', () => {
  it('transforms and validates 1000 rows in under 30 seconds', () => {
    const ROW_COUNT = 1000;
    const rows = generateContributionRows(ROW_COUNT);
    const entityConfig = testMappingProfile.entity_mappings.contributions as EntityMappingConfig;

    const startMs = Date.now();

    let validCount = 0;
    let invalidCount = 0;

    for (const rawRow of rows) {
      const { transformed } = applyFieldMapping(rawRow, entityConfig);
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
