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
  page: async ({ page }, provide, testInfo) => {
    const failures: string[] = [];
    const consoleErrors: string[] = [];
    const requestFailures: Array<{ method: string; url: string; error: string }> = [];
    const httpFailures: Array<{ method: string; url: string; status: number }> = [];

    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (BENIGN_CONSOLE_PATTERNS.some(pattern => pattern.test(message.text()))) return;
      const text = message.text();
      consoleErrors.push(text);
      failures.push(`console.error: ${text}`);
    });
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText ?? '';
      if (errorText === 'net::ERR_ABORTED') return;
      requestFailures.push({ method: request.method(), url: request.url(), error: errorText });
      failures.push(`requestfailed: ${request.method()} ${request.url()} ${errorText}`);
    });
    page.on('response', response => {
      if (response.status() >= 500) {
        httpFailures.push({
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
        });
        failures.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`);
      }
    });

    await provide(page);

    if (failures.length > 0) {
      const context = page.context();
      const cookies = await context.cookies().catch(() => []);
      const me = await context.request.get('/api/me')
        .then(async response => ({ status: response.status(), body: await response.json().catch(() => null) }))
        .catch(error => ({ error: error instanceof Error ? error.message : String(error) }));

      await testInfo.attach('walkthrough-triage.json', {
        contentType: 'application/json',
        body: JSON.stringify({
          url: page.isClosed() ? null : page.url(),
          activeOrgCookie: cookies.find(cookie => cookie.name === 'x-org-id')?.value ?? null,
          failures,
          consoleErrors,
          requestFailures,
          httpFailures,
          me,
        }, null, 2),
      });
    }

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
