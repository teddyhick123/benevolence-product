import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test as base, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { personas, WALKTHROUGH_PASSWORD, type PersonaName } from './personas';

type WalkthroughFixtures = {
  adminDb: SupabaseClient<any, 'public', any>;
};

const BENIGN_CONSOLE_PATTERNS = [
  /Download the React DevTools/i,
  /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/i,
];

const activePersonaByPage = new WeakMap<Page, PersonaName>();
const AUTH_TIMEOUT = 300_000;

function tailServerLog(maxLines = 80) {
  const logPath = process.env.WALKTHROUGH_SERVER_LOG;
  if (!logPath) return null;

  try {
    return readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-maxLines).join('\n');
  } catch {
    return null;
  }
}

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
      const personaName = activePersonaByPage.get(page) ?? null;
      const persona = personaName ? personas[personaName] : null;
      const me = await context.request.get('/api/me')
        .then(async response => ({ status: response.status(), body: await response.json().catch(() => null) }))
        .catch(error => ({ error: error instanceof Error ? error.message : String(error) }));

      await testInfo.attach('walkthrough-triage.json', {
        contentType: 'application/json',
        body: JSON.stringify({
          url: page.isClosed() ? null : page.url(),
          persona: personaName && persona ? {
            name: personaName,
            email: persona.email,
            fullName: persona.fullName,
          } : null,
          activeOrgCookie: cookies.find(cookie => cookie.name === 'x-org-id')?.value ?? null,
          failures,
          consoleErrors,
          requestFailures,
          httpFailures,
          me,
          serverLogTail: tailServerLog(),
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
  activePersonaByPage.set(page, personaName);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.getByLabel('Email address');
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(persona.email);
  await page.getByLabel('Password', { exact: true }).fill(WALKTHROUGH_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login', {
    timeout: AUTH_TIMEOUT,
    waitUntil: 'domcontentloaded',
  });
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/me');
    return response.status();
  }, { timeout: AUTH_TIMEOUT }).toBe(200);
}

export async function setActiveOrg(page: Page, orgId: string) {
  await page.context().addCookies([{
    name: 'x-org-id',
    value: orgId,
    url: 'http://127.0.0.1:3000',
  }]);
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/me');
    if (!response.ok()) return null;
    const body = await response.json().catch(() => null);
    return body?.organization_id ?? null;
  }, { timeout: AUTH_TIMEOUT }).toBe(orgId);
}
