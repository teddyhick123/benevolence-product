// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createBrowserAuthClient } from '@/lib/api/browser-auth-client';

type AuthCookieStorage = {
  storage: {
    getItem(_key: string): Promise<string | null>;
    setItem(_key: string, _value: string): Promise<void>;
    removeItem(_key: string): Promise<void>;
  };
};

describe('browser Supabase cookie persistence', () => {
  it('round-trips auth state through the @supabase/ssr browser cookie adapter', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://schema-cookie-check.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const client = createBrowserAuthClient();
    const { storage } = client.auth as unknown as AuthCookieStorage;
    const key = 'schema-browser-auth-check';
    const value = JSON.stringify({ access_token: 'token', refresh_token: 'refresh' });

    await storage.setItem(key, value);

    expect(document.cookie).toContain(`${key}=base64-`);
    expect(await storage.getItem(key)).toBe(value);

    await storage.removeItem(key);
    expect(await storage.getItem(key)).toBeNull();
  });
});
