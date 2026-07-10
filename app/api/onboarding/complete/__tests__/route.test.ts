import { describe, expect, it } from 'vitest';
import { POST } from '../route';

describe('retired onboarding completion endpoint', () => {
  it('does not provision a second organization path', async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({
      error: 'This onboarding endpoint has been retired.',
      canonical_endpoint: '/api/onboarding/provision',
    });
  });
});
