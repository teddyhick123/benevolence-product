import { describe, it, expectTypeOf } from 'vitest';
import type { OrgType } from '../org';

describe('OrgType', () => {
  it('includes all DB enum values', () => {
    const dbValues = [
      'private_foundation',
      'family_office',
      'daf_sponsor',
      'community_foundation',
      'nonprofit',
      'corporation',
      'individual',
    ] as const;

    dbValues.forEach((v) => {
      const _: OrgType = v;
    });
  });

  it('does not include removed values', () => {
    // @ts-expect-error — 'daf' is not a valid OrgType
    const _bad: OrgType = 'daf';
  });
});
