import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test as base, type Page } from '@playwright/test';
import { personas, WALKTHROUGH_PASSWORD, type PersonaName } from './personas';

type WalkthroughFixtures = {
  adminDb: SupabaseClient<any, 'public', any>;
};

const BENIGN_CONSOLE_PATTERNS = [
  /Download the React DevTools/i,
];

export const test = base.extend<WalkthroughFixtures>({
  page: async ({ page }, provide) => {
    const failures: string[] = [];

    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (BENIGN_CONSOLE_PATTERNS.some(pattern => pattern.test(message.text()))) return;
      failures.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText ?? '';
      if (errorText === 'net::ERR_ABORTED') return;
      failures.push(`requestfailed: ${request.method()} ${request.url()} ${errorText}`);
    });
    page.on('response', response => {
      if (response.status() >= 500) {
        failures.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`);
      }
    });

    await provide(page);

    expect(failures, failures.join('\n')).toEqual([]);
  },

  adminDb: async ({}, provide) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) throw new Error('Local Supabase environment is required. Run via npm run walkthrough:test.');

    await provide(createClient<any>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
  },
});

export { expect };

export async function loginAs(page: Page, personaName: PersonaName) {
  const persona = personas[personaName];
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.getByLabel('Email address');
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(persona.email);
  await page.getByLabel('Password', { exact: true }).fill(WALKTHROUGH_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login', {
    timeout: 90_000,
    waitUntil: 'domcontentloaded',
  });
}

export async function setActiveOrg(page: Page, orgId: string) {
  await page.context().addCookies([{
    name: 'x-org-id',
    value: orgId,
    url: 'http://127.0.0.1:3000',
  }]);
}
