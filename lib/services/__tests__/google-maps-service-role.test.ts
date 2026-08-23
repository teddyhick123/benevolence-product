// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

const SERVICE_ROLE = 'service-role-key-value';
const SUPABASE_URL = 'https://project.supabase.co';

function cacheQueryStub() {
  const result = { data: null, error: { code: 'PGRST116' } };
  const builder = {
    select: () => builder,
    eq: () => builder,
    gt: () => builder,
    single: () => Promise.resolve(result),
  };
  return { from: () => builder };
}

describe('geocode cache Supabase client', () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockReset();
    createClient.mockReturnValue(cacheQueryStub());
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE = SERVICE_ROLE;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE;
  });

  it('reads the canonical SUPABASE_SERVICE_ROLE the rest of the app uses', async () => {
    const { getCachedGeocode } = await import('@/lib/services/google-maps');

    await getCachedGeocode('some-location-key');

    expect(createClient).toHaveBeenCalledWith(
      SUPABASE_URL,
      SERVICE_ROLE,
      expect.anything(),
    );
  });

  it('does not silently degrade to a cache miss when only the canonical name is set', async () => {
    const { getCachedGeocode } = await import('@/lib/services/google-maps');

    await getCachedGeocode('some-location-key');

    // A thrown "Missing Supabase environment variables" is swallowed by the
    // caller's try/catch and looks identical to an empty cache, so assert the
    // client was actually constructed rather than trusting the null return.
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
