import { describe, expect, it } from 'vitest';
import { createDonorSchema, updateDonorSchema } from '@/lib/schemas/donor';

describe('donor schemas', () => {
  it('accepts canonical donor tiers and contact fields', () => {
    expect(createDonorSchema.safeParse({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.org',
      tier: 'major',
      tags: ['board'],
    }).success).toBe(true);
  });

  it('rejects stale tiers, invalid email, and unknown mutation fields', () => {
    expect(createDonorSchema.safeParse({ tier: 'gold' }).success).toBe(false);
    expect(createDonorSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(createDonorSchema.safeParse({ created_by: crypto.randomUUID() }).success).toBe(false);
  });

  it('allows canonical recency updates and rejects empty updates at the route boundary', () => {
    expect(updateDonorSchema.safeParse({ recency_status: 'lost' }).success).toBe(true);
    expect(updateDonorSchema.parse({})).toEqual({});
  });
});
