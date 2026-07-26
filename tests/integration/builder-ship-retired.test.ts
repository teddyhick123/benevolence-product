// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/ship/route';

describe('POST ship — retired', () => {
  it('always returns 410 Gone; delivery status is never a manual assertion', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/retired/i);
  });
});
// Integration test.
