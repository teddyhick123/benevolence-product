// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { jsonError, jsonOk } from '@/lib/api/responses';

describe('API JSON responses', () => {
  it('defaults successful authenticated JSON to no-store', async () => {
    const response = jsonOk({ data: { id: 'x' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { id: 'x' } });
  });

  it('preserves explicit cache and custom headers', () => {
    const response = jsonOk({ data: [] }, {
      headers: { 'Cache-Control': 's-maxage=60', 'X-Contract': 'kept' },
    });
    expect(response.headers.get('Cache-Control')).toBe('s-maxage=60');
    expect(response.headers.get('X-Contract')).toBe('kept');
  });

  it('returns the standard error shape and requested status', async () => {
    const response = jsonError('Forbidden', 403);
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('preserves route-specific error details without losing the standard shape', async () => {
    const response = jsonError('Sync failed', 500, { rollback_error: 'Rollback failed' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Sync failed',
      rollback_error: 'Rollback failed',
    });
  });
});
