// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createBrowserClientSSR = vi.fn(() => ({ kind: 'browser-client' }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: createBrowserClientSSR,
}));

describe('browser Supabase client', () => {
  beforeEach(() => {
    vi.resetModules();
    createBrowserClientSSR.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('delegates browser auth and cookie persistence to @supabase/ssr', async () => {
    const { createBrowserAuthClient } = await import('@/lib/api/browser-auth-client');

    expect(createBrowserAuthClient()).toEqual({ kind: 'browser-client' });
    expect(createBrowserClientSSR).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key'
    );
  });
});
