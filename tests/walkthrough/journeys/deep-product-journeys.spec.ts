import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

const COLD_APP_TIMEOUT = 180_000;
const TAX_YEAR = 2026;

test.setTimeout(600_000);

async function deleteDonorByEmail(adminDb: any, email: string) {
  const { data: donors } = await adminDb
    .from('donors')
    .select('id')
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('email', email);

  const donorIds = (donors ?? []).map((donor: { id: string }) => donor.id);
  if (donorIds.length === 0) return;

  await adminDb.from('acknowledgment_letters').delete().in('donor_id', donorIds);
  await adminDb.from('contributions_received').delete().in('donor_id', donorIds);
  await adminDb.from('donors').delete().in('id', donorIds);
}

async function deleteTaxContributionsByRecipient(adminDb: any, recipientName: string) {
  const { data: contributions } = await adminDb
    .from('tax_contributions')
    .select('id')
    .eq('portfolio_id', fixtureIds.portfolios.alpha)
    .eq('recipient_name', recipientName);

  const contributionIds = (contributions ?? []).map((contribution: { id: string }) => contribution.id);
  if (contributionIds.length === 0) return;

  await adminDb.from('tax_documents').delete().in('tax_contribution_id', contributionIds);
  await adminDb.from('holding_contributions').delete().in('tax_contribution_id', contributionIds);
  await adminDb.from('tax_contributions').delete().in('id', contributionIds);
}

async function deleteFilingByTitle(adminDb: any, title: string) {
  await adminDb
    .from('filing_calendar')
    .delete()
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('title', title);
}

async function deleteStateRegistration(adminDb: any, state: string, registrationType = 'charitable_solicitation') {
  await adminDb
    .from('state_registrations')
    .delete()
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('state', state)
    .eq('registration_type', registrationType);
}

test('deep donor journey: creates a donor, logs a gift, and generates a receipt', async ({ page, adminDb }) => {
  const email = 'walkthrough.deep.donor@example.org';
  const firstName = 'Deep';
  const lastName = 'Donor';
  const amount = 275;

  await deleteDonorByEmail(adminDb, email);
  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto('/dashboard/donors', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Donors' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await expect(page.getByRole('link', { name: /\+ Add Donor/ })).toBeVisible();
    await page.goto(`/dashboard/donors/new?org=${fixtureIds.orgs.alpha}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Add Donor' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: COLD_APP_TIMEOUT });
    await page.locator('input[placeholder="Jane"]').fill(firstName);
    await page.locator('input[placeholder="Smith"]').fill(lastName);
    await page.locator('input[placeholder="jane@example.com"]').fill(email);
    await page.locator('select').selectOption('major');
    await page.locator('textarea').fill('Created by the deep donor exploratory walkthrough.');
    const donorResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/org/${fixtureIds.orgs.alpha}/donors`) &&
      response.request().method() === 'POST',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Add Donor' }).click();
    const donorResponse = await donorResponsePromise;
    expect(donorResponse.status()).toBe(201);

    await page.waitForURL(url => url.pathname === '/dashboard/donors', { timeout: COLD_APP_TIMEOUT });
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: donor } = await adminDb
      .from('donors')
      .select('id, first_name, last_name, email, tier')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('email', email)
      .single();

    expect(donor?.first_name).toBe(firstName);
    expect(donor?.last_name).toBe(lastName);
    expect(donor?.tier).toBe('major');
    expect(donor?.id).toBeTruthy();
    const donorId = donor!.id;

    await page.getByText(`${firstName} ${lastName}`).click();
    await expect(page.getByRole('heading', { name: `${firstName} ${lastName}` })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByRole('button', { name: '+ Log Gift' }).click();
    await page.locator('input[placeholder="0.00"]').fill(String(amount));
    await page.locator('input[type="date"]').fill('2026-06-15');
    await page.getByRole('button', { name: 'Log Gift' }).click();

    await expect(page.getByRole('cell', { name: '$275' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: contribution } = await adminDb
      .from('contributions_received')
      .select('id, amount, gift_type, receipt_status')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('donor_id', donorId)
      .single();

    expect(Number(contribution?.amount)).toBe(amount);
    expect(contribution?.gift_type).toBe('cash');
    expect(contribution?.receipt_status).toBe('pending');
    expect(contribution?.id).toBeTruthy();
    const contributionId = contribution!.id;

    const receipt = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/contributions/${contributionId}/receipt`, {
      data: { send_immediately: false },
    });
    expect(receipt.status()).toBe(200);

    const [{ data: generatedContribution }, { count: letterCount }] = await Promise.all([
      adminDb
        .from('contributions_received')
        .select('receipt_number, receipt_status, receipt_generated_at')
        .eq('id', contributionId)
        .single(),
      adminDb
        .from('acknowledgment_letters')
        .select('*', { count: 'exact', head: true })
        .eq('donor_id', donorId)
        .contains('contribution_ids', [contributionId]),
    ]);

    expect(generatedContribution?.receipt_number).toMatch(/^R-\d{4}-\d{6}$/);
    expect(generatedContribution?.receipt_status).toBe('generated');
    expect(generatedContribution?.receipt_generated_at).not.toBeNull();
    expect(letterCount).toBe(1);
  } finally {
    await deleteDonorByEmail(adminDb, email);
  }
});

test('deep tax journey: creates a visible contribution and exports tax data', async ({ page, adminDb }) => {
  const recipientName = 'Deep Tax Walkthrough Charity';

  await deleteTaxContributionsByRecipient(adminDb, recipientName);
  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto(`/dashboard/tax?portfolio_id=${fixtureIds.portfolios.alpha}&year=${TAX_YEAR}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect.poll(async () => {
      const response = await page.request.get('/api/me');
      if (!response.ok()) return null;
      const body = await response.json().catch(() => null);
      return body?.recommended_portfolio_id ?? body?.portfolio_id ?? null;
    }, { timeout: COLD_APP_TIMEOUT }).toBe(fixtureIds.portfolios.alpha);
    await expect(page.getByRole('heading', { name: 'Tax Center' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: '+ Add Contribution Manually' }).click();
    await expect(page.getByRole('heading', { name: 'Add Tax Contribution' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByLabel('Contribution Date *').fill('2026-06-20');
    await page.getByLabel('Recipient Name *').fill(recipientName);
    await page.getByLabel('EIN (Employer Identification Number)').fill('12-3456789');
    await page.getByLabel('Recipient Type').selectOption('501c3_public');
    await page.getByLabel('Amount *').fill('1250');
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.getByLabel('Notes (Optional)').fill('Created by the deep tax exploratory walkthrough.');
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.getByLabel(/written acknowledgment/).check();
    await page.getByRole('button', { name: 'Save Contribution' }).click();

    await expect(page.getByRole('heading', { name: 'Add Tax Contribution' })).toHaveCount(0, {
      timeout: COLD_APP_TIMEOUT,
    });

    const { data: contribution } = await adminDb
      .from('tax_contributions')
      .select('id, org_id, amount_usd, deductible_amount, contribution_type, acknowledgment_received, agi_limit_category')
      .eq('portfolio_id', fixtureIds.portfolios.alpha)
      .eq('tax_year', TAX_YEAR)
      .eq('recipient_name', recipientName)
      .single();

    expect(contribution?.org_id).toBe(fixtureIds.orgs.alpha);
    expect(Number(contribution?.amount_usd)).toBe(1250);
    expect(Number(contribution?.deductible_amount)).toBe(1250);
    expect(contribution?.contribution_type).toBe('cash');
    expect(contribution?.acknowledgment_received).toBe(true);
    expect(contribution?.agi_limit_category).toBe('60_cash');

    const taxExport = await page.request.get(
      `/api/portfolio/${fixtureIds.portfolios.alpha}/tax/export?year=${TAX_YEAR}&format=json`
    );
    expect(taxExport.status()).toBe(200);
    const exported = await taxExport.json();
    expect(exported.data.contributions.some((row: any) => row.recipient === recipientName)).toBe(true);
  } finally {
    await deleteTaxContributionsByRecipient(adminDb, recipientName);
  }
});

test('deep compliance journey: creates filings, marks filed, and upserts a registration', async ({ page, adminDb }) => {
  const filingTitle = 'Deep Walkthrough 990-PF Filing';
  const state = 'OR';

  await deleteFilingByTitle(adminDb, filingTitle);
  await deleteStateRegistration(adminDb, state);
  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto('/dashboard/compliance', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Compliance' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: '+ Add Filing' }).click();
    await page.locator('input[placeholder="e.g. Form 990-PF — FY 2025"]').fill(filingTitle);
    await page.locator('input[type="date"]').first().fill('2026-11-15');
    await page.locator('input[placeholder="e.g. CA, Federal"]').fill('Federal');
    await page.locator('input[placeholder="Optional notes"]').fill('Created by the deep compliance exploratory walkthrough.');
    await page.getByRole('button', { name: 'Save Filing' }).click();
    await expect(page.getByText('Created by the deep compliance exploratory walkthrough.')).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });

    await page
      .getByRole('row', { name: /deep compliance exploratory walkthrough/i })
      .getByRole('button', { name: 'Mark as Filed' })
      .click();
    await page.locator('input[placeholder="e.g. IRS-2026-XXXXX"]').fill('DEEP-FILED-001');
    await page.locator('input[placeholder="Name or role"]').fill('Walkthrough Bot');
    await page.locator('textarea[placeholder="Any additional notes"]').fill('Marked filed by the deep compliance journey.');
    const markFiledResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/org/${fixtureIds.orgs.alpha}/compliance/filing-calendar`) &&
      response.request().method() === 'PATCH',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Confirm Filed' }).click();
    const markFiledResponse = await markFiledResponsePromise;
    expect(markFiledResponse.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Mark as Filed' })).toHaveCount(0, {
      timeout: COLD_APP_TIMEOUT,
    });
    await expect(
      page.getByRole('row', { name: /deep compliance exploratory walkthrough/i }).getByText('filed')
    ).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: filing } = await adminDb
      .from('filing_calendar')
      .select('id, status, filing_reference, completed_by_name, notes')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('title', filingTitle)
      .single();

    expect(filing?.status).toBe('filed');
    expect(filing?.filing_reference).toBe('DEEP-FILED-001');
    expect(filing?.completed_by_name).toBe('Walkthrough Bot');

    await page.getByRole('button', { name: '+ Add Registration' }).click();
    await page.locator('input[placeholder="CA"]').fill(state);
    await page.locator('input[type="date"]').last().fill('2026-12-31');
    await page.locator('input[placeholder="Optional notes"]').fill('Deep compliance registration note.');
    await page.getByRole('button', { name: 'Save Registration' }).click();

    await expect(page.getByText('Deep compliance registration note.')).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: registration } = await adminDb
      .from('state_registrations')
      .select('state, registration_type, status, expiration_date, notes')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('state', state)
      .eq('registration_type', 'charitable_solicitation')
      .single();

    expect(registration?.status).toBe('active');
    expect(registration?.expiration_date).toBe('2026-12-31');
    expect(registration?.notes).toBe('Deep compliance registration note.');
  } finally {
    await deleteFilingByTitle(adminDb, filingTitle);
    await deleteStateRegistration(adminDb, state);
  }
});
